// 巡场 / 套牌检查是视角，不是管理权限。所有写入均由服务器验证并持久化。
import * as ws from '../ws.js'
import { currentTournament, canManage } from '../state.js'
import { tableData, getEditingTable } from './detail.js'

const FAB_INFRACTIONS = [
  'Game Rules Violation', 'Failure to Maintain Game State', 'Missed Trigger',
  'Looking at Extra Cards', 'Hidden Card Error', 'Shuffling Error', 'Presenting Cards Error',
  'Tardiness', 'Outside Assistance', 'Slow Play', 'Decklist Error', 'Card-Pool Contents Error',
  'Draft Procedure Violation (Minor)', 'Draft Procedure Violation (Major)', 'Marked Cards',
  'Insufficient Shuffling', 'Communicating Incorrect Game Information',
  'Unsporting Conduct (Minor)', 'Unsporting Conduct (Major)', 'Cheating', 'Aggressive Behavior',
  'Improperly Determining a Winner', 'Bribery', 'Betting', 'Theft', 'Stalling',
  'Improper Concession', 'Rules Sharking', 'Fraud',
]
const MTG_INFRACTIONS = [
  '2.1 遗漏触发', '2.2 额外看牌', '2.3 非公开牌张失误', '2.4 再调度失误',
  '2.5 违反游戏规则', '2.6 未维护游戏状态', '3.1 迟到', '3.2 外来协助',
  '3.3 游戏进行过慢', '3.4 套牌登记表问题', '3.5 套牌问题',
  '3.6 违反限制赛流程', '3.7 违反交流原则', '3.8 有记号的牌',
  '3.9 未充分洗牌', '4.1 举止违背运动道德 - 轻微',
  '4.2 举止违背运动道德 - 严重', '4.3 不当决定胜方',
  '4.4 贿赂与赌博', '4.5 攻击性举止', '4.6 窃取比赛用品',
  '4.7 拖延', '4.8 作弊',
]
const PENALTIES = {
  FAB: ['Caution', 'Warning', 'IP2', 'Game Loss', 'Disqualification'],
  MTG: ['警告', '一盘负', '一局负', '取消资格'],
}

let judgeState = { roundCompleted: 0, standings: [], records: [], stats: [], audit: [] }
let mode = sessionStorage.getItem('lynxJudgeMode') === 'deck' ? 'deck' : 'floor'
let filter = 'none'
let picked = new Set()
let activeTable = null
let penaltyTable = null
let pending = null
let stagedChecks = new Set()

function byId(id) { return document.getElementById(id) }
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
}
function keyFor(t, seat) {
  const id = String(t[`playerId${seat}`] || '').trim()
  const ns = String(t[`playerIdNamespace${seat}`] || '').trim()
  return id && ns ? `id:${ns}:${id}` : `name:${String(t[`p${seat}`] || '').trim().toLocaleLowerCase()}`
}
function nameUniqueInCurrent(name) {
  const normalized = String(name || '').trim().toLocaleLowerCase()
  return normalized && tableData.reduce((total, table) => total + [table.p1, table.p2]
    .filter(value => String(value || '').trim().toLocaleLowerCase() === normalized).length, 0) === 1
}
function recordsFor(t, seat) {
  const key = keyFor(t, seat)
  const unique = nameUniqueInCurrent(t[`p${seat}`])
  if (key.startsWith('name:') && !unique) return []
  const nameKey = `name:${String(t[`p${seat}`] || '').trim().toLocaleLowerCase()}`
  return judgeState.records.filter(r => r.playerKey === key || (unique && r.playerKey === nameKey))
}
function countChecks(t, seat) {
  return recordsFor(t, seat).filter(r => r.kind === 'deckcheck').length
}
function penaltyRecordsFor(t, seat) {
  return recordsFor(t, seat).filter(r => r.kind === 'penalty').reverse()
}
function penaltyRecordMarkup(record) {
  return `<p>R${record.round} · ${escapeHtml(record.infraction)} / ${escapeHtml(record.penalty)}${record.note ? ` · ${escapeHtml(record.note)}` : ''}</p>`
}
function renderFloorPenaltyRecords(tableNo) {
  const target = byId('tm-penalty-records')
  const summary = byId('tm-penalty-summary')
  const table = tableData.find(item => item.number === Number(tableNo))
  if (!target || !summary || !table) return
  let total = 0
  target.innerHTML = [1, 2].filter(seat => table[`p${seat}`]).map(seat => {
    const records = penaltyRecordsFor(table, seat)
    total += records.length
    return `<div class="penalty-player-history"><strong>${escapeHtml(table[`p${seat}`])}</strong>${records.length
      ? records.map(penaltyRecordMarkup).join('') : '<p>暂无判罚记录</p>'}</div>`
  }).join('') || '<p>该桌尚未录入玩家</p>'
  summary.textContent = `判罚记录（${total}）`
}
document.addEventListener('lynx:floor-table-open', event => renderFloorPenaltyRecords(event.detail?.tableNo))
function standingFor(t, seat) {
  if (judgeState.roundCompleted !== (currentTournament?.roundNumber || 1) - 1) return null
  const key = keyFor(t, seat)
  const exact = judgeState.standings.find(row => row.playerKey === key)
  if (exact) return exact
  if (!nameUniqueInCurrent(t[`p${seat}`])) return null
  const name = String(t[`p${seat}`] || '').trim().toLocaleLowerCase()
  const matches = judgeState.standings.filter(row => row.name.trim().toLocaleLowerCase() === name)
  return matches.length === 1 ? matches[0] : null
}
function statsFor(t, seat) {
  const key = keyFor(t, seat)
  const nameKey = `name:${String(t[`p${seat}`] || '').trim().toLocaleLowerCase()}`
  const unique = nameUniqueInCurrent(t[`p${seat}`])
  const matches = (judgeState.stats || []).filter(row => row.playerKey === key ||
    (unique && row.playerKey === nameKey))
  if (!matches.length) return null
  return matches.reduce((sum, row) => ({
    wins: sum.wins + row.wins, losses: sum.losses + row.losses,
    draws: sum.draws + row.draws, byes: sum.byes + row.byes,
  }), { wins: 0, losses: 0, draws: 0, byes: 0 })
}
function currentName() { return sessionStorage.getItem('adminName') || sessionStorage.getItem('guestName') || '用户' }

function render() {
  if (!currentTournament) return
  if (!byId('table-modal')?.classList.contains('hidden') && getEditingTable()) {
    renderFloorPenaltyRecords(getEditingTable().number)
  }
  const page = byId('page-tournament-detail')
  const enabled = mode === 'deck'
  page?.classList.toggle('deck-mode', enabled)
  byId('deck-view')?.classList.toggle('hidden', !enabled)
  const nav = byId('nav-username')
  if (nav) {
    nav.textContent = `${currentName()} · ${enabled ? '套牌检查' : '巡场裁判'} ▾`
    nav.title = `当前视角：${enabled ? '套牌检查' : '巡场裁判'}。点击切换；不改变登录权限。`
  }
  const manager = canManage(currentTournament)
  byId('deck-standings-btn')?.classList.toggle('hidden', !manager)
  const round = currentTournament.roundNumber || 1
  const hasStandings = judgeState.roundCompleted === round - 1 && judgeState.standings.length > 0
  byId('deck-standings-status').textContent = round === 1
    ? 'R1 尚无历史积分；所有玩家按 0 分参与筛选。'
    : hasStandings
      ? `${judgeState.standings[0].source === 'auto' ? 'Lynx 自动结算' : '已用外部积分校正'} R${round - 1}（${judgeState.standings.length} 位玩家）${judgeState.standings.some(row => row.baselineIncomplete) ? ' · 历史起点不完整' : ''}`
      : `尚未导入 R${round - 1} 积分榜；最低分数高于 0 时无法抽选。`
  document.querySelectorAll('[data-deck-filter]').forEach(button => button.classList.toggle('sel', button.dataset.deckFilter === filter))
  const list = byId('deck-table-list')
  if (!list || !enabled) return
  list.innerHTML = tableData.map(t => {
    const a = t.p1 || '未录入'
    const b = t.p2 || '未录入'
    const scoreA = round === 1 ? 0 : standingFor(t, 1)?.points
    const scoreB = round === 1 ? 0 : standingFor(t, 2)?.points
    const scoreText = scoreA == null || scoreB == null ? '积分未匹配' : `${scoreA} / ${scoreB} 分`
    const statsA = statsFor(t, 1), statsB = statsFor(t, 2)
    const statsText = statsA || statsB
      ? ` · 胜/负/平 ${statsA?.wins || 0}/${statsA?.losses || 0}/${statsA?.draws || 0} : ${statsB?.wins || 0}/${statsB?.losses || 0}/${statsB?.draws || 0}` : ''
    return `<button type="button" class="deck-row ${picked.has(t.number) ? 'picked' : ''}" onclick="openDeckModal(${t.number})">
      <span class="deck-no">#${t.number}</span><span class="deck-pair">${escapeHtml(a)}　vs　${escapeHtml(b)}</span>
      <span class="deck-meta">DC ${countChecks(t, 1)} / ${countChecks(t, 2)} · ${scoreText}${statsText}</span></button>`
  }).join('') || '<p class="text-sm text-gray">本轮暂无桌台</p>'
}

function submit(type, payload, statusEl) {
  if (pending) { statusEl.textContent = '正在保存，请稍候'; return false }
  if (!ws.isReady()) { statusEl.textContent = '连接中断，请等待重连'; return false }
  const opId = `judge-${Date.now()}-${Math.random().toString(36).slice(2)}`
  pending = { opId, type, statusEl }
  statusEl.textContent = '正在保存…'
  const ok = type === 'standings' ? ws.importStandings(payload, opId) : ws.commitJudgeRecord(payload, opId)
  if (!ok) { pending = null; statusEl.textContent = '连接中断，请重试' }
  return ok
}

ws.on('snapshot', msg => { judgeState = msg.judge || { roundCompleted: 0, standings: [], records: [], stats: [], audit: [] }; picked.clear(); render() })
ws.on('judge:state', msg => { judgeState = msg.judge || judgeState; render() })
ws.on('judge:ack', msg => {
  judgeState = msg.judge || judgeState
  if (pending?.opId === msg.opId) {
    const type = pending.type
    pending = null
    if (type === 'standings') closeStandingsModal()
    if (type === 'penalty') closePenaltyModal()
    if (type === 'deck') closeDeckModal()
  }
  render()
})
ws.on('operation:rejected', msg => {
  if (pending?.opId !== msg.opId) return
  pending.statusEl.textContent = `保存失败：${msg.message}`
  pending = null
})
ws.on('close', () => { if (pending) { pending.statusEl.textContent = '连接中断，请重试'; pending = null } })
for (const event of ['tables', 'tables:ack', 'round:ack', 'table:updated', 'table:ack']) ws.on(event, render)

export function toggleJudgeMode() {
  if (!currentTournament || !byId('page-tournament-detail')?.classList.contains('active')) return
  mode = mode === 'floor' ? 'deck' : 'floor'
  sessionStorage.setItem('lynxJudgeMode', mode)
  picked.clear()
  render()
}
export function setDeckFilter(value) { if (['none', 'one', 'all'].includes(value)) { filter = value; render() } }

export function pickDeckTables() {
  const output = byId('deck-pick-result')
  const countRaw = byId('deck-pick-count').value.trim()
  const minRaw = byId('deck-min-points').value.trim()
  if (!/^\d+$/.test(countRaw) || Number(countRaw) < 1 || !/^\d+$/.test(minRaw)) {
    output.textContent = '抽选桌数须为正整数，最低分数须为非负整数。'; return
  }
  const count = Number(countRaw), min = Number(minRaw)
  if (!Number.isSafeInteger(count) || !Number.isSafeInteger(min)) { output.textContent = '输入数值过大。'; return }
  const round = currentTournament.roundNumber || 1
  const pool = tableData.filter(t => {
    if (!t.p1 || !t.p2 || t.color === 'black') return false
    const checked = [countChecks(t, 1) > 0, countChecks(t, 2) > 0]
    if (filter === 'none' && checked.some(Boolean)) return false
    if (filter === 'one' && checked.filter(Boolean).length !== 1) return false
    if (min > 0) {
      const points = [1, 2].map(seat => round === 1 ? 0 : standingFor(t, seat)?.points)
      if (points.some(point => point == null || point < min)) return false
    }
    return true
  })
  if (!pool.length || count > pool.length) {
    output.textContent = `符合条件的桌台仅 ${pool.length} 桌；请调整抽选桌数或筛选条件。`; picked.clear(); render(); return
  }
  // Fisher–Yates with crypto randomness; no replacement.
  const shuffled = [...pool]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1)
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  picked = new Set(shuffled.slice(0, count).map(t => t.number))
  output.textContent = `已抽选：${[...picked].map(no => `#${no}`).join('、')}`
  render()
}

export function openStandingsModal() {
  if (!currentTournament || !canManage(currentTournament)) return
  const round = currentTournament.roundNumber || 1
  byId('standings-round-hint').textContent = round === 1
    ? '第 1 轮尚无已完成轮次；无需校正积分。'
    : `仅在自动结算与官方积分不一致、或旧轮次缺少历史数据时使用。请粘贴插件导出的 R${round - 1} 积分 JSON；该轮积分将整体覆盖，胜负记录仍保留。`
  byId('standings-error').textContent = ''
  byId('standings-confirm').checked = false
  byId('standings-audit').innerHTML = (judgeState.audit || []).slice(0, 12).map(row =>
    `<p>R${row.roundCompleted} · ${escapeHtml(row.playerName)} · ${row.oldPoints ?? '无'} → ${row.newPoints ?? '移除'} 分 · ${escapeHtml(row.changedBy)} · ${new Date(row.changedAt).toLocaleString()}</p>`
  ).join('') || '<p>暂无校正记录</p>'
  byId('standings-modal').classList.remove('hidden')
}
export function closeStandingsModal() { byId('standings-modal').classList.add('hidden') }
export function submitStandings() {
  const error = byId('standings-error')
  let data
  try { data = JSON.parse(byId('standings-json').value.trim()) } catch { error.textContent = 'JSON 格式错误'; return }
  if (data?.schema !== 'lynx-standings-v1' || !Array.isArray(data.rows)) { error.textContent = '这不是 Lynx 1.0 的积分榜 JSON'; return }
  if (Number(data.roundCompleted) !== (currentTournament.roundNumber || 1) - 1) { error.textContent = '积分榜轮次与当前赛事不符'; return }
  if (!byId('standings-confirm').checked) { error.textContent = '请先确认覆盖范围和积分数据'; return }
  submit('standings', data, error)
}

export function openPenaltyModal(tableNo, seat) {
  const t = tableNo ? tableData.find(item => item.number === Number(tableNo)) : getEditingTable()
  if (!t || (t.focus && !canManage(currentTournament))) return
  penaltyTable = t
  const players = byId('penalty-player')
  players.innerHTML = [1, 2].filter(i => t[`p${i}`]).map(i => `<option value="${i}">${escapeHtml(t[`p${i}`])}</option>`).join('')
  if (!players.options.length) { penaltyTable = null; alert('该桌尚未录入玩家'); return }
  if (seat && t[`p${seat}`]) players.value = String(seat)
  const game = currentTournament.game === 'FAB' ? 'FAB' : 'MTG'
  byId('penalty-title').textContent = `#${t.number} 添加判罚 · ${game}`
  byId('penalty-infraction').innerHTML = (game === 'FAB' ? FAB_INFRACTIONS : MTG_INFRACTIONS).map(value => `<option>${escapeHtml(value)}</option>`).join('')
  byId('penalty-value').innerHTML = PENALTIES[game].map(value => `<option>${escapeHtml(value)}</option>`).join('')
  byId('penalty-note').value = ''
  byId('penalty-time').value = '0'
  byId('penalty-error').textContent = ''
  byId('penalty-modal').classList.remove('hidden')
}
export function closePenaltyModal() { byId('penalty-modal').classList.add('hidden'); penaltyTable = null }
export function submitPenalty() {
  if (!penaltyTable) return
  const error = byId('penalty-error')
  const raw = byId('penalty-time').value.trim()
  if (raw && (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)))) { error.textContent = '加时只能填写非负整数（0 表示不加时）'; return }
  const addMinutes = Number(raw || 0)
  if (addMinutes > 0 && penaltyTable.timeExt > 0 && !confirm(`当前已补时 ${penaltyTable.timeExt} 分钟；本次增加 ${addMinutes} 分钟后共 ${penaltyTable.timeExt + addMinutes} 分钟。确定提交？`)) return
  const seat = Number(byId('penalty-player').value)
  submit('penalty', {
    tableNo: penaltyTable.number, round: currentTournament.roundNumber || 1,
    baseRevision: penaltyTable.revision || 0, addMinutes,
    penalties: [{ seat, infraction: byId('penalty-infraction').value, penalty: byId('penalty-value').value, note: byId('penalty-note').value }],
  }, error)
}

export function openDeckModal(tableNo) {
  const t = tableData.find(item => item.number === Number(tableNo))
  if (!t || (t.focus && !canManage(currentTournament))) return
  activeTable = t
  stagedChecks = new Set()
  byId('deck-modal-title').textContent = `#${t.number} 套牌检查 · R${currentTournament.roundNumber || 1}`
  byId('deck-modal-players').innerHTML = [1, 2].map(seat => {
    const records = recordsFor(t, seat)
    const penalties = penaltyRecordsFor(t, seat)
    const otherHistory = records.filter(r => r.kind !== 'penalty').slice(-5).reverse()
    const checkedThisRound = records.some(r => r.kind === 'deckcheck' && r.round === (currentTournament.roundNumber || 1))
    return `
    <div class="deck-player">
      <div class="deck-player-head"><span class="deck-player-name">${escapeHtml(t[`p${seat}`] || '未录入')}</span><span class="text-xs text-gray">已检查 ${countChecks(t, seat)} 次</span></div>
      <div class="deck-player-actions">
        <button type="button" id="deck-mark-${seat}" class="btn-secondary" onclick="toggleDeckMark(${seat})" ${t[`p${seat}`] && !checkedThisRound ? '' : 'disabled'}>${checkedThisRound ? '本轮已检查' : '标记套牌检查'}</button>
        <button type="button" class="btn-secondary" onclick="openPenaltyModal(${t.number},${seat})" ${t[`p${seat}`] ? '' : 'disabled'}>添加判罚</button>
      </div>
      <label>备注<textarea id="deck-note-${seat}" class="input-field" rows="2" maxlength="2000" placeholder="可选备注；提交后保留在记录中"></textarea></label>
      <details class="deck-history"><summary>判罚记录（${penalties.length}）</summary>${penalties.length
        ? penalties.map(penaltyRecordMarkup).join('') : '<p>暂无判罚记录</p>'}</details>
      ${otherHistory.length ? `<details class="deck-history"><summary>检查与备注（${otherHistory.length}）</summary>${otherHistory.map(r =>
        `<p>R${r.round} · ${r.kind === 'deckcheck' ? '套牌检查' : '备注'}${r.note ? ` · ${escapeHtml(r.note)}` : ''}</p>`
      ).join('')}</details>` : ''}
    </div>`
  }).join('')
  byId('deck-time').value = '10'
  byId('deck-modal-error').textContent = ''
  byId('deck-modal').classList.remove('hidden')
}
export function closeDeckModal() { byId('deck-modal').classList.add('hidden'); activeTable = null; stagedChecks.clear() }
export function toggleDeckMark(seat) {
  if (![1, 2].includes(Number(seat)) || !activeTable?.[`p${seat}`]) return
  if (stagedChecks.has(seat)) stagedChecks.delete(seat)
  else stagedChecks.add(seat)
  const button = byId(`deck-mark-${seat}`)
  button.textContent = stagedChecks.has(seat) ? '已选中 · 点击取消' : '标记套牌检查'
  button.classList.toggle('sel', stagedChecks.has(seat))
}
export function submitDeckCheck() {
  if (!activeTable) return
  const error = byId('deck-modal-error')
  const raw = byId('deck-time').value.trim()
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw))) { error.textContent = '补时只能填写非负整数（0 表示不补时）'; return }
  const addMinutes = Number(raw)
  const checks = [...stagedChecks].map(seat => ({ seat }))
  const notes = [1, 2].map(seat => ({ seat, note: byId(`deck-note-${seat}`).value.trim() })).filter(item => item.note)
  if (!checks.length && !notes.length && !addMinutes) { error.textContent = '请至少选择一名玩家、填写备注或添加补时'; return }
  if (addMinutes > 0 && activeTable.timeExt > 0 && !confirm(`当前已补时 ${activeTable.timeExt} 分钟；本次增加 ${addMinutes} 分钟后共 ${activeTable.timeExt + addMinutes} 分钟。确定提交？`)) return
  submit('deck', { tableNo: activeTable.number, round: currentTournament.roundNumber || 1,
    baseRevision: activeTable.revision || 0, addMinutes, checks, notes }, error)
}
