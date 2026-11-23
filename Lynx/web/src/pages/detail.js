// ==================== 界面4：比赛详情 ====================
import * as api from '../api.js'
import * as ws from '../ws.js'
import {
  tournaments, currentTournament, setCurrentTournament,
  STATUS_MAP, STATUS_CLS,
  getRole, randomCode, canManage, canDelete,
} from '../state.js'
import { goTo, updatePinButton, renderNavPins } from '../nav.js'
import { setLastPage } from '../auth.js'
import { FAB_FORMATS, fabRoundMinutes } from '../fab-formats.js'
import {
  mtgResultFromImport,
  hasReportedResult,
  optionalScore,
  readImportEnvelope,
  resetTableState,
  tablesForFirstImport,
} from '../import-utils.js'

// 选手名占位池（正式版来自报名/导入数据）

export let tableData = []          // 当前比赛的桌子数组
let editingTable = null     // 正在设置的桌子
export function getEditingTable() { return editingTable }
let fabResult = null        // 弹窗中暂存的 FAB 结果

function newTable(num) {
  return {
    number: num,
    color: 'white',
    p1: '',
    p2: '',
    playerId1: null,
    playerId2: null,
    playerIdNamespace1: null,
    playerIdNamespace2: null,
    result: null,       // FAB: 'p1'|'p2'|'draw'；MTG: { p1, p2, draws }
    outcomeType: null,  // Preserve BYE / LOSSALL / GHOST through round settlement.
    timeExt: 0,
    watchedBy: null,
    drop1: false,
    drop2: false,
    greenManual: false, // 手动染绿（非导入）
    greenAt: null,      // 手动染绿时间戳
    resultSource: null,
    focus: false,
    revision: 0,
  }
}

/** 按当前排序方向推算下一个桌号 */
function nextTableNumber() {
  if (tableData.length === 0) return (currentTournament && currentTournament.startTable) || 1
  const last = tableData[tableData.length - 1].number
  return (currentTournament && currentTournament.tableReversed) ? last - 1 : last + 1
}

// ---------- 实时同步层 ----------
let pendingOperation = null
let pendingRoundStart = null
let confirmedSnapshot = null
let operationSequence = 0
let roomReady = false
let showPlayerNames = false
let tableSearch = ''

function currentSyncSnapshot() {
  if (!currentTournament) return null
  return {
    tables: structuredClone(tableData),
    layoutCode: currentTournament.layoutCode || null,
    layoutRows: currentTournament.layoutRows || null,
    maxTables: currentTournament.maxTables,
    startTable: currentTournament.startTable,
    tableReversed: currentTournament.tableReversed,
    roundNumber: currentTournament.roundNumber || 1,
    lastImportRound: currentTournament.lastImportRound || 0,
    stateRevision: currentTournament.stateRevision || 0,
    scoringPolicy: currentTournament.scoringPolicy || null,
  }
}

function rememberConfirmed() { confirmedSnapshot = currentSyncSnapshot() }

function updateSyncStatus(message = '') {
  for (const id of ['detail-sync-status', 'm-detail-sync-status']) {
    const el = document.getElementById(id)
    if (el) el.textContent = message
  }
  document.getElementById('page-tournament-detail')?.classList.toggle('sync-busy', !!pendingOperation)
  document.querySelectorAll('#table-modal input, #table-modal select, #table-modal button').forEach(el => {
    el.disabled = !!pendingOperation
  })
}

function clearPending() {
  if (pendingOperation?.timer) clearTimeout(pendingOperation.timer)
  pendingOperation = null
  updateSyncStatus()
}

function readyForOperation() {
  if (pendingOperation) { updateSyncStatus('正在保存上一项操作，请稍候…'); return false }
  if (!ws.isReady() || !roomReady) { updateSyncStatus('正在连接赛事，请稍候…'); return false }
  return true
}

function beginOperation(send) {
  const opId = `${Date.now()}-${++operationSequence}`
  pendingOperation = { opId, timer: null }
  updateSyncStatus('正在保存…')
  if (!send(opId)) {
    clearPending()
    if (confirmedSnapshot) applySyncData(confirmedSnapshot)
    renderTables()
    updateSyncStatus('连接中断，操作未保存')
    return false
  }
  pendingOperation.timer = setTimeout(() => {
    if (pendingOperation?.opId !== opId) return
    updateSyncStatus('等待服务器确认，正在重新同步…')
    ws.joinRoom(currentTournament.id)
  }, 8000)
  return true
}

function mergeAuthoritativeTable(table, stateRevision) {
  const index = tableData.findIndex(t => t.number === table.number)
  if (index >= 0) Object.assign(tableData[index], table)
  if (currentTournament) {
    currentTournament.stateRevision = Math.max(currentTournament.stateRevision || 0, stateRevision || 0)
    currentTournament.tables = tableData
  }
  rememberConfirmed()
  renderTables()
}

function pushTables(importRound = null) {
  if (!currentTournament) return
  currentTournament.tables = tableData
  return beginOperation(opId => ws.pushTables({
    importPolicyVersion: 2,
    tables: tableData,
    layoutCode: currentTournament.layoutCode || null,
    layoutRows: currentTournament.layoutRows || null,
    maxTables: currentTournament.maxTables,
    startTable: currentTournament.startTable,
    tableReversed: currentTournament.tableReversed,
    roundNumber: currentTournament.roundNumber || 1,
    ...(importRound === null ? {} : { importRound }),
    stateRevision: confirmedSnapshot?.stateRevision ?? currentTournament.stateRevision ?? 0,
  }, opId))
}

function pushSingleTable(table) {
  return beginOperation(opId => ws.updateTable(table, table.revision || 0, opId))
}

function applySyncData(data) {
  // 兼容旧格式（纯数组）
  if (Array.isArray(data)) {
    tableData = data
  } else {
    tableData = data.tables || []
    if (currentTournament) {
      currentTournament.layoutCode = data.layoutCode
      currentTournament.layoutRows = data.layoutRows
      currentTournament.maxTables = data.maxTables
      currentTournament.startTable = data.startTable
      currentTournament.tableReversed = data.tableReversed
      currentTournament.roundNumber = data.roundNumber || 1
      currentTournament.lastImportRound = data.lastImportRound || 0
      currentTournament.stateRevision = data.stateRevision || 0
      currentTournament.scoringPolicy = data.scoringPolicy || null
    }
  }
  if (currentTournament) currentTournament.tables = tableData
  if (editingTable) editingTable = tableData.find(t => t.number === editingTable.number) || null
  rememberConfirmed()
}

// WebSocket 广播处理（替代 demo 的 storage 事件监听）
ws.on('snapshot', (msg) => {
  if (!currentTournament) return
  if (pendingOperation) clearPending()
  if (msg.tables) applySyncData(msg.tables)
  roomReady = true
  if (msg.timer) { timerState = msg.timer; renderTimer(); updateTimerToggleBtn() }
  renderTables()
  updateSyncStatus()
})

ws.on('round:preview', (msg) => {
  if (!pendingRoundStart) return
  const error = document.getElementById('settlement-error')
  if (msg.error) { pendingRoundStart = null; alert(`无法预览结算：${msg.error}`); return }
  const data = msg.data
  if (!data || data.stateRevision !== pendingRoundStart.stateRevision) {
    pendingRoundStart = null; alert('结算预览已过期，请重试'); return
  }
  pendingRoundStart.preview = data
  document.getElementById('settlement-title').textContent = `R${data.round} 结算预览`
  const c = data.counts
  document.getElementById('settlement-summary').textContent =
    `胜负桌 ${c.win} · 平局桌 ${c.draw} · 轮空 ${c.bye} · 双方判负 ${c.double_loss} · Ghost ${c.ghost} · 空桌 ${c.empty}；预计记录 ${data.participantCount} 位玩家本轮赛果。`
  const unresolved = document.getElementById('settlement-unresolved')
  unresolved.classList.toggle('hidden', !data.unresolved.length)
  unresolved.textContent = data.unresolved.length
    ? `仍有 ${data.unresolved.length} 项无法结算：${data.unresolved.slice(0, 8).map(item => `${item.tableNo ? `#${item.tableNo} ` : ''}${item.reason}`).join('；')}。请先补录或修正。`
    : ''
  const baseline = document.getElementById('settlement-baseline')
  baseline.classList.toggle('hidden', !data.baselineMissing && !data.baselineIncomplete)
  baseline.textContent = data.baselineMissing
    ? '缺少上一轮积分榜：现有历史积分无法凭已清空的桌台追溯。可先导入官方积分校正，或明确确认从本轮起累计（积分将标记为不完整）。'
    : data.baselineIncomplete ? '历史积分起点曾缺失；本轮计算仍会保留“不完整”标记。可在结算后用管理端校正。' : ''
  const map = { win: 'win', draw: 'draw', loss: 'loss', bye: 'bye', doubleLoss: 'double-loss' }
  for (const [field, id] of Object.entries(map)) {
    const input = document.getElementById(`settlement-${id}`)
    input.value = data.policy[field]
    input.disabled = data.policySaved
  }
  document.getElementById('settlement-policy-confirm-row').classList.toggle('hidden', data.policySaved)
  document.getElementById('settlement-policy-confirm').checked = false
  document.getElementById('settlement-baseline-confirm-row').classList.toggle('hidden', !data.baselineMissing)
  document.getElementById('settlement-baseline-confirm').checked = false
  document.getElementById('settlement-submit').disabled = !!data.unresolved.length
  error.textContent = ''
  document.getElementById('settlement-modal').classList.remove('hidden')
})

ws.on('table:ack', (msg) => {
  if (pendingOperation?.opId !== msg.opId) return
  clearPending()
  mergeAuthoritativeTable(msg.table, msg.stateRevision)
})
ws.on('table:updated', (msg) => {
  if (!currentTournament) return
  mergeAuthoritativeTable(msg.table, msg.stateRevision)
})
ws.on('tables:ack', (msg) => {
  if (pendingOperation?.opId !== msg.opId) return
  const successMessage = pendingOperation.successMessage
  clearPending()
  applySyncData(msg.data)
  renderTables()
  if (successMessage) alert(successMessage)
})
ws.on('round:ack', (msg) => {
  if (pendingOperation?.opId !== msg.opId) return
  const successMessage = pendingOperation.successMessage
  clearPending()
  applySyncData(msg.data)
  timerState = msg.timer
  renderTimer()
  updateTimerToggleBtn()
  renderTables()
  if (successMessage) alert(successMessage)
})
ws.on('operation:rejected', (msg) => {
  if (pendingOperation?.opId !== msg.opId) return
  clearPending()
  if (msg.data) applySyncData(msg.data)
  if (msg.timer) { timerState = msg.timer; renderTimer() }
  renderTables()
  alert(`操作未保存：${msg.message}`)
})
ws.on('close', () => {
  roomReady = false
  if (currentTournament) updateSyncStatus('连接中断，等待重连…')
})

ws.on('tables', (msg) => {
  if (!currentTournament) return
  applySyncData(msg.data)
  renderTables()
})

ws.on('timer', (msg) => {
  // 计时器广播（含发送者，统一以服务器状态为准）
  timerState = msg.state
  renderTimer()
  updateTimerToggleBtn()
})

ws.on('tournament', (msg) => {
  // 比赛元信息变更（PATCH /api/tournaments/:id 触发）
  const t = msg.tournament
  if (!t) return
  const idx = tournaments.findIndex(x => x.id === t.id)
  if (idx >= 0) tournaments[idx] = t
  if (currentTournament && currentTournament.id === t.id) {
    const tables = currentTournament.tables
    setCurrentTournament(t)
    currentTournament.tables = tables
    if (confirmedSnapshot) confirmedSnapshot.stateRevision = t.stateRevision || 0
    refreshDetailHeader()
  }
  renderNavPins()
})

ws.on('deleted', (msg) => {
  const id = msg.tournamentId
  const idx = tournaments.findIndex(x => x.id === id)
  if (idx >= 0) tournaments.splice(idx, 1)
  if (currentTournament && currentTournament.id === id) {
    clearTimerInt()
    setCurrentTournament(null)
    leaveTournament()
  }
  renderNavPins()
})

// ==================== 成绩回报面板（PC 端权限用户） ====================
// 规则（用户拍板）：
//  - 任何人在单桌弹窗"完成"时产生回报；自己的操作不进自己的消息框，但进历史
//  - 确认/清除所有只影响自己的消息框；历史永久保留，真删只随比赛删除
//  - 导入新一轮 = 全场消息框清空（历史保留）
let reportFeed = []   // 当前消息框里的未确认回报（服务器已排除自己的）

ws.on('reports', (msg) => {
  // 消息框全量（join 后 + 任何回报变化：新回报/旧消息被冲突标红，服务器都重推）
  reportFeed = msg.list || []
  renderReportPanel()
})

ws.on('reports:roundclear', () => {
  reportFeed = []
  renderReportPanel()
})

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

/** 渲染回报面板：仅"本场有管理权"的用户可见；空时收缩细条；可拖动吸附四边，桌子区对应侧让 gutter */
function renderReportPanel() {
  const panel = document.getElementById('report-panel')
  const area = document.getElementById('tables-area')
  if (!panel || !area) return
  const show = !!currentTournament && canManage(currentTournament)
  panel.classList.toggle('hidden', !show)
  if (!show) {
    area.classList.remove('report-gutter', 'report-gutter-left')
    return
  }

  document.getElementById('report-count').textContent = reportFeed.length
  panel.classList.toggle('report-empty', reportFeed.length === 0)
  document.getElementById('report-list').innerHTML = reportFeed.map(r =>
    `<div class="report-item${r.conflict ? ' report-conflict' : ''}"${r.grp ? ` data-grp="${escapeHtml(r.grp)}"` : ''}>` +
    `<span class="report-text">${escapeHtml(r.text)} - <span class="report-user">${escapeHtml(r.reporterName)}</span></span>` +
    `<button class="report-ack" onclick="ackReportItem(${r.id})">确认</button></div>`
  ).join('')
  bindReportHover()
  bindReportDrag()
  applyPanelDock()
  // 面板/gutter 影响可用宽度：重算桌子缩放
  fitCurrent()
}

// ---------- 面板位置：可拖动，松开吸附到最近的上/下/左/右边，localStorage 记忆 ----------
function loadReportDock() {
  try {
    const d = JSON.parse(localStorage.getItem('lynxReportDock') || 'null')
    if (d && ['left', 'right', 'top', 'bottom'].includes(d.edge)) return d
  } catch {}
  return { edge: 'right', pos: null }
}
function saveReportDock(d) { try { localStorage.setItem('lynxReportDock', JSON.stringify(d)) } catch {} }

/** 顶部栏目底缘 = 回报面板可到达的"页面顶端"（navbar sticky、z-index 50 高于面板，面板进入会被盖住） */
function reportTopBound() {
  const nav = document.querySelector('.navbar')
  return nav ? Math.ceil(nav.getBoundingClientRect().bottom) : 0
}

/** 按吸附边摆放面板；左/右贴边时桌子区对应侧让出 gutter（不遮桌子方块）；上边界=顶部栏目底缘 */
function applyPanelDock() {
  const panel = document.getElementById('report-panel')
  const area = document.getElementById('tables-area')
  if (!panel || !area || panel.classList.contains('hidden')) return
  const dock = loadReportDock()
  const vw = window.innerWidth, vh = window.innerHeight
  const w = panel.offsetWidth
  const topBound = reportTopBound()
  // 默认（未拖过）：右缘、与桌子区顶对齐（fixed 定位用视口坐标，且不低于顶部栏目底缘）
  const defTop = Math.max(topBound + 10, area.getBoundingClientRect().top)
  const pos = dock.pos != null ? dock.pos : defTop

  panel.style.left = panel.style.right = panel.style.top = panel.style.bottom = 'auto'
  if (dock.edge === 'left' || dock.edge === 'right') {
    const top = Math.min(Math.max(topBound + 10, pos), Math.max(topBound + 10, vh - 80))
    panel.style.top = top + 'px'
    panel.style.maxHeight = Math.max(120, vh - top - 12) + 'px'
    if (dock.edge === 'left') panel.style.left = '10px'
    else panel.style.right = '10px'
  } else {
    // 贴顶=贴顶部栏目下缘，left 保留拖动位置 → 沿栏目左右横移
    const left = Math.min(Math.max(10, pos), Math.max(10, vw - w - 10))
    panel.style.left = left + 'px'
    panel.style.maxHeight = Math.round(vh * 0.6) + 'px'
    if (dock.edge === 'top') panel.style.top = (topBound + 6) + 'px'
    else panel.style.bottom = '10px'
  }
  area.classList.toggle('report-gutter', dock.edge === 'right')
  area.classList.toggle('report-gutter-left', dock.edge === 'left')
}

let reportDragBound = false
function bindReportDrag() {
  if (reportDragBound) return
  const head = document.getElementById('report-panel-head')
  const panel = document.getElementById('report-panel')
  if (!head || !panel) return
  reportDragBound = true
  head.addEventListener('mousedown', (e) => {
    if (e.target.closest('button')) return // 点在 历史/清除所有 上不拖
    e.preventDefault()
    const rect = panel.getBoundingClientRect()
    const dx = e.clientX - rect.left, dy = e.clientY - rect.top
    // 拖前先转成 left/top 定位，跟随鼠标
    panel.style.right = 'auto'; panel.style.bottom = 'auto'
    panel.style.left = rect.left + 'px'; panel.style.top = rect.top + 'px'
    const onMove = (ev) => {
      panel.style.left = (ev.clientX - dx) + 'px'
      // 拖动中就不许进入顶部栏目覆盖区（栏目底缘即"页面顶端"）
      panel.style.top = Math.max(reportTopBound() + 2, ev.clientY - dy) + 'px'
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      const r = panel.getBoundingClientRect()
      const vw = window.innerWidth, vh = window.innerHeight
      // 距离最近的边吸附，另一轴保持拖动位置；"上边"算到顶部栏目底缘的距离
      const dists = [
        { edge: 'left', d: r.left, pos: r.top },
        { edge: 'right', d: vw - r.right, pos: r.top },
        { edge: 'top', d: Math.abs(r.top - reportTopBound()), pos: r.left },
        { edge: 'bottom', d: vh - r.bottom, pos: r.left },
      ]
      dists.sort((a, b) => a.d - b.d)
      saveReportDock({ edge: dists[0].edge, pos: Math.round(dists[0].pos) })
      applyPanelDock()
      fitCurrent() // gutter 可能换边，重算桌子缩放
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  })
}

// 悬停标红消息：同组（data-grp 相同）的其他可见消息红黑慢闪；已隐藏的不在 DOM 自然无变化
let reportHoverBound = false
function bindReportHover() {
  if (reportHoverBound) return
  const list = document.getElementById('report-list')
  if (!list) return
  reportHoverBound = true
  list.addEventListener('mouseover', (e) => {
    const item = e.target.closest('.report-item.report-conflict')
    if (!item || !item.dataset.grp) return
    const grp = item.dataset.grp
    list.querySelectorAll('.report-item[data-grp]').forEach(el => {
      if (el !== item && el.dataset.grp === grp) el.classList.add('report-flash')
    })
  })
  list.addEventListener('mouseout', (e) => {
    const item = e.target.closest('.report-item.report-conflict')
    if (!item) return
    // 移到同项内部子元素不消除
    if (item.contains(e.relatedTarget)) return
    list.querySelectorAll('.report-item.report-flash').forEach(el => el.classList.remove('report-flash'))
  })
}

/** 确认一条：只从自己的消息框清除（历史保留） */
export function ackReportItem(id) {
  ws.ackReport(id)
  reportFeed = reportFeed.filter(r => r.id !== id)
  renderReportPanel()
}

/** 清除所有：只清自己的消息框（历史保留） */
export function clearAllReports() {
  if (reportFeed.length === 0) return
  ws.clearReports()
  reportFeed = []
  renderReportPanel()
}

/** 历史弹窗：这场比赛的全部回报（含自己的/已确认的/已轮清的） */
export async function openReportHistory() {
  if (!currentTournament) return
  const listEl = document.getElementById('report-history-list')
  listEl.innerHTML = '<div style="padding:20px;text-align:center;color:#9ca3af">加载中…</div>'
  document.getElementById('report-history-modal').classList.remove('hidden')
  try {
    const list = await api.getReports(currentTournament.id)
    listEl.innerHTML = list.length === 0
      ? '<div style="padding:20px;text-align:center;color:#9ca3af">暂无回报记录</div>'
      : list.map(r => {
          const d = new Date(r.createdAt)
          const ts = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
          const cls = r.conflict ? ' report-history-conflict' : ''
          const dupTag = r.dup ? '<span class="report-history-dup">（重复，未入消息框）</span>' : ''
          return `<div class="report-history-item${cls}"><span class="report-history-time">${ts}</span>${escapeHtml(r.text)} - <span class="report-user">${escapeHtml(r.reporterName)}</span>${dupTag}</div>`
        }).join('')
  } catch (e) {
    listEl.innerHTML = `<div style="padding:20px;text-align:center;color:#dc2626">加载失败：${escapeHtml(e.message)}</div>`
  }
}

export function closeReportHistory() {
  document.getElementById('report-history-modal').classList.add('hidden')
}


function initTables(t) {
  setCurrentTournament(t)
  roomReady = false
  // 同步层改动②：加入 WebSocket 房间，等待 snapshot 全量
  ws.joinRoom(t.id)
  if (t.tables && t.tables.length) { tableData = t.tables; rememberConfirmed(); return }
  const count = t.maxTables || 8
  const start = t.startTable || 1
  const reversed = !!t.tableReversed
  tableData = []
  for (let i = 0; i < count; i++) {
    tableData.push(newTable(reversed ? start - i : start + i))
  }
  rememberConfirmed()
}

// ---------- 巡场筛选（可叠加，点亮表示隐藏对应状态） ----------
const tableFilters = { playing: false, judge: false, timeext: false, submitted: false }

// ---------- 排序开关（PC 权限用户，纯前端不影响其他人） ----------
// true = 忽略桌号编码布局，回默认桌号升序；再点恢复布局
let ignoreLayoutOrder = false

export function toggleSortOrder() {
  ignoreLayoutOrder = !ignoreLayoutOrder
  const btn = document.getElementById('filter-sort')
  if (btn) btn.classList.toggle('sel', ignoreLayoutOrder)
  renderTables()
}

export function toggleFilter(key) {
  if (!(key in tableFilters)) return
  tableFilters[key] = !tableFilters[key]
  for (const prefix of ['filter-', 'm-filter-']) {
    const button = document.getElementById(prefix + key)
    if (!button) continue
    button.classList.toggle('off', tableFilters[key])
    button.setAttribute('aria-pressed', String(tableFilters[key]))
  }
  renderTables()
}

/** 该桌是否被筛选隐藏 */
function isTableHidden(t) {
  if (tableFilters.playing && t.color === 'red') return true
  if (tableFilters.judge && (t.watchedBy || t.color === 'yellow')) return true
  if (tableFilters.timeext && t.timeExt) return true
  if (tableFilters.submitted && t.color === 'green') return true
  // 区域筛选（仅移动端生效）
  if (!useTableLayout() && zoneFilter.size > 0 && !zoneFilter.has(t.number)) return true
  if (tableSearch) {
    const q = tableSearch.toLocaleLowerCase()
    if (![String(t.number), t.p1 || '', t.p2 || ''].some(value => value.toLocaleLowerCase().includes(q))) return true
  }
  return false
}

export function searchTables(value) {
  tableSearch = String(value || '').trim()
  renderTables()
}

export function clearTableSearch() {
  tableSearch = ''
  for (const id of ['detail-table-search', 'm-detail-table-search']) {
    const el = document.getElementById(id)
    if (el) el.value = ''
  }
  renderTables()
}

export function togglePlayerNames() {
  if (!currentTournament || !canManage(currentTournament)) return
  showPlayerNames = !showPlayerNames
  for (const id of ['detail-show-names', 'drawer-show-names']) {
    const el = document.getElementById(id)
    if (el) el.textContent = showPlayerNames ? '隐藏姓名' : '显示姓名'
  }
  renderTables()
}

// ---------- 区域筛选（移动端） ----------
let zoneFilter = new Set()   // 空 Set = 显示全部

export function openZoneFilter() {
  document.getElementById('zone-filter-input').value = Array.from(zoneFilter).sort((a,b)=>a-b).join('\n')
  document.getElementById('zone-filter-modal').classList.remove('hidden')
}

export function closeZoneFilter() {
  document.getElementById('zone-filter-modal').classList.add('hidden')
}

export function clearZoneFilter() {
  document.getElementById('zone-filter-input').value = ''
}

export function applyZoneFilter() {
  const text = document.getElementById('zone-filter-input').value.trim()
  zoneFilter = parseZoneFilter(text)
  closeZoneFilter()
  renderTables()
}

/** 解析区域筛选条件，返回桌号集合 */
function parseZoneFilter(text) {
  const result = new Set()
  if (!text) return result
  const lines = text.split('\n').map(l => l.trim()).filter(l => l)
  const allNums = tableData.map(t => t.number).sort((a,b)=>a-b)
  const maxNum = allNums.length ? Math.max(...allNums) : 999
  const minNum = allNums.length ? Math.min(...allNums) : 1

  for (const line of lines) {
    // X-Y 范围
    let m = line.match(/^(\d+)-(\d+)$/)
    if (m) {
      const a = parseInt(m[1], 10), b = parseInt(m[2], 10)
      for (let i = Math.min(a,b); i <= Math.max(a,b); i++) result.add(i)
      continue
    }
    // X- 开区间（X及之后）
    m = line.match(/^(\d+)-$/)
    if (m) {
      const a = parseInt(m[1], 10)
      for (const n of allNums) if (n >= a) result.add(n)
      continue
    }
    // -X 开区间（X及之前）
    m = line.match(/^-(\d+)$/)
    if (m) {
      const a = parseInt(m[1], 10)
      for (const n of allNums) if (n <= a) result.add(n)
      continue
    }
    // 单个桌号
    m = line.match(/^(\d+)$/)
    if (m) {
      result.add(parseInt(m[1], 10))
      continue
    }
  }
  return result
}

// ---------- 桌子渲染 ----------
function tableSquareHtml(t) {
  const mobile = !useTableLayout()
  // 手动染绿：编号红字；超过 2 分钟显示红色计时（移动端只标红不显示时间）
  const isGreen = t.greenManual && t.color === 'green'
  const numColor = (isGreen || (t.color === 'green' && t.resultSource === 'judge')) ? 'color:#dc2626;' : ''
  const showNames = showPlayerNames && canManage(currentTournament)
  const firstName = showNames ? `<span class="table-player-name">${escapeHtml(t.p1 || '')}</span>` : ''
  const secondName = showNames ? `<span class="table-player-name">${escapeHtml(t.p2 || '')}</span>` : ''
  const focusClass = t.focus ? ' focus-table' : ''
  let gtimeHtml = ''
  if (!mobile && isGreen && t.greenAt) {
    const elapsed = Math.floor((Date.now() - t.greenAt) / 1000)
    if (elapsed > 120) {
      const m = String(Math.floor(elapsed / 60)).padStart(2, '0')
      const s = String(elapsed % 60).padStart(2, '0')
      gtimeHtml = `<div class="t-gtime">${m}:${s}</div>`
    }
  }
  const hiddenStyle = isTableHidden(t) ? 'visibility:hidden;' : ''

  if (mobile) {
    // 移动端：桌号、补时和盯桌裁判分行展示，避免窄方块中互相挤压。
    const hasJudge = !!t.watchedBy
    const detailClass = `${t.timeExt ? ' has-time-ext' : ''}${hasJudge ? ' has-watcher' : ''}${showNames ? ' has-player-names' : ''}`
    let html = `<div class="t-top"><span class="t-num" style="${numColor}">${t.number}</span></div>`
    if (t.timeExt) html += `<div class="t-ext">+${t.timeExt} 分钟</div>`
    if (hasJudge) html += `<div class="t-judge">${escapeHtml(t.watchedBy)}</div>`
    return `<div class="table-square c-${t.color}${focusClass}${detailClass}" style="${hiddenStyle}"
      onmousedown="pressStart(${t.number})" onmousemove="pressMove(event)" onmouseup="pressEnd(${t.number})" onmouseleave="pressCancel()"
      ontouchstart="pressStart(${t.number})" ontouchmove="pressMove(event)" ontouchend="pressEnd(${t.number});event.preventDefault()">${firstName}${html}${secondName}</div>`
  }

  // 桌面端：原布局
  let extra = ''
  if (t.timeExt) extra += `<div class="t-ext">+${t.timeExt}分</div>`
  if (t.watchedBy) extra += `<div class="t-judge">${escapeHtml(t.watchedBy)}</div>`
  extra += gtimeHtml
  return `<div class="table-square c-${t.color}${focusClass}" style="${hiddenStyle}"
    onmousedown="pressStart(${t.number})" onmousemove="pressMove(event)" onmouseup="pressEnd(${t.number})" onmouseleave="pressCancel()"
    ontouchstart="pressStart(${t.number})" ontouchmove="pressMove(event)" ontouchend="pressEnd(${t.number});event.preventDefault()">
    ${firstName}
    <div class="t-num" style="${numColor}">${t.number}</div>
    ${extra}
    ${secondName}
  </div>`
}

// ---------- 分区显示（1/4/9 区） ----------
let blockCount = 1
let zoneIndex = 0   // 当前显示的分区序号

const ZONE_NAMES_4 = ['左上', '右上', '左下', '右下']
const ZONE_NAMES_9 = ['左上', '中上', '右上', '左中', '正中', '右中', '左下', '中下', '右下']

export function setBlocks(n) {
  blockCount = n
  zoneIndex = 0
  ;[1, 4, 9].forEach(b => {
    const el = document.getElementById('block-' + b)
    if (el) el.classList.toggle('sel', b === n)
  })
  renderTables()
}



/** 把矩阵切成 rows×cols 个分区（每区格子数一致，中间居中，边缘用相邻内容填充） */
function splitZones(m, total) {
  const zc = total === 4 ? 2 : 3
  const zr = total === 4 ? 2 : 3

  // 1. 补齐为规整矩形（仅当行长度不一致时）
  const C = Math.max(...m.map(r => r.length))
  const R = m.length
  const rect = m.map(row => {
    const r = row.slice()
    while (r.length < C) r.push({ type: 'aisle' })
    return r
  })

  // 2. 找出纯 X 的行和列
  const pureXRows = []
  for (let r = 0; r < R; r++) {
    if (rect[r].every(c => c.type === 'aisle')) pureXRows.push(r)
  }
  const pureXCols = []
  for (let c = 0; c < C; c++) {
    let allX = true
    for (let r = 0; r < R; r++) {
      if (rect[r][c].type !== 'aisle') { allX = false; break }
    }
    if (allX) pureXCols.push(c)
  }

  // 3. 计算分区尺寸和忽略策略（列方向）
  //    目标：每区 W 列，W = ceil(len/parts)，若 len 与 W 奇偶不同则尝试调整
  function calcDim(len, xCount, parts) {
    let W = Math.ceil(len / parts)
    const lenParity = len % 2, wParity = W % 2
    if (lenParity === wParity) {
      // 奇偶相同，可以居中（如 11列 W=4? 11奇4偶不同 → 进下步）
      return { W, ignore: false }
    }
    // 奇偶不同，尝试忽略 X
    const len2 = len - xCount
    if (len2 > 0) {
      const W2 = Math.ceil(len2 / parts)
      if (W2 === W && len2 % 2 === W % 2) {
        // 忽略后 W 不变且奇偶相同 → 忽略
        return { W, ignore: true }
      }
    }
    // 忽略无效或不能保持 W → 默认忽略，W+1 变奇数
    const W3 = W + 1
    return { W: W3, ignore: true }
  }

  const colDim = calcDim(C, pureXCols.length, zc)
  const rowDim = calcDim(R, pureXRows.length, zr)

  // 4. 构建有效矩阵（按决策忽略纯 X 行/列）
  const keepCols = []
  for (let c = 0; c < C; c++) { if (!colDim.ignore || !pureXCols.includes(c)) keepCols.push(c) }
  const keepRows = []
  for (let r = 0; r < R; r++) { if (!rowDim.ignore || !pureXRows.includes(r)) keepRows.push(r) }

  const effC = keepCols.length
  const effR = keepRows.length
  const zoneW = colDim.W
  const zoneH = rowDim.W

  // 5. 定位九个分区：先定正中，再拖动定位四边，最后定位四角
  //    分区起始坐标（在有效矩阵中的行列范围）
  function zoneRange(zi, zj) {
    // 列方向：左=0，中=居中，右=effC-zoneW
    let c0
    if (zj === 0) c0 = 0
    else if (zj === zc - 1) c0 = effC - zoneW
    else c0 = Math.floor((effC - zoneW) / 2)  // 中
    // 行方向：上=0，中=居中，下=effR-zoneH
    let r0
    if (zi === 0) r0 = 0
    else if (zi === zr - 1) r0 = effR - zoneH
    else r0 = Math.floor((effR - zoneH) / 2)  // 中
    return { r0, c0 }
  }

  const zones = []
  for (let zi = 0; zi < zr; zi++) {
    for (let zj = 0; zj < zc; zj++) {
      const { r0, c0 } = zoneRange(zi, zj)
      const cells = []
      for (let r = 0; r < zoneH; r++) {
        const row = []
        for (let c = 0; c < zoneW; c++) {
          const ri = r0 + r
          const ci = c0 + c
          if (ri >= 0 && ri < effR && ci >= 0 && ci < effC) {
            row.push(rect[keepRows[ri]][keepCols[ci]])
          } else {
            row.push({ type: 'aisle' })
          }
        }
        cells.push(row)
      }
      zones.push({ cells })
    }
  }
  return zones
}

function zoneNames() { return blockCount === 4 ? ZONE_NAMES_4 : ZONE_NAMES_9 }

export function switchZone(dir) {
  const zones = currentZones()
  if (!zones.length) return
  zoneIndex = ((zoneIndex + dir) % zones.length + zones.length) % zones.length
  renderTables()
}

let _cachedZones = []
function currentZones() { return _cachedZones }

export function renderTables() {
  const grid = document.getElementById('tables-grid')
  // 排序开关（纯前端）：暂时忽略桌号编码布局，回默认桌号升序
  const hasLayout = currentTournament && currentTournament.layoutRows && useTableLayout() && !ignoreLayoutOrder
  // 移动端强制单区（无分区功能）
  if (!useTableLayout()) blockCount = 1

  if (rotation === 0 && !hasLayout && blockCount === 1) {
    // 普通网格（被筛选隐藏的桌子直接移除，后面往前补位；区域筛选时按桌号排序）
    grid.classList.remove('layout-mode')
    let visible = tableData.filter(t => !isTableHidden(t))
    if (ignoreLayoutOrder || (!useTableLayout() && zoneFilter.size > 0)) {
      visible = visible.sort((a, b) => a.number - b.number)
    }
    grid.innerHTML = visible.length === 0
      ? '<div style="padding:40px;text-align:center;color:#9ca3af;font-size:14px;grid-column:1/-1">所有桌子均被筛选隐藏</div>'
      : visible.map(t => tableSquareHtml(t)).join('')
    _cachedZones = []
  } else {
    // 矩阵渲染（编码布局 或 旋转状态）
    let m = getBaseMatrix()
    if (rotation === 90) m = rotateMatrixCW(m)
    else if (rotation === 180) m = rotateMatrix180(m)
    else if (rotation === 270) m = rotateMatrixCCW(m)

    grid.classList.add('layout-mode')
    if (m.length === 0) {
      // 全部被筛选隐藏
      _cachedZones = []
      grid.innerHTML = '<div style="padding:40px;text-align:center;color:#9ca3af;font-size:14px">所有桌子均被筛选隐藏</div>'
    } else if (blockCount === 1) {
      _cachedZones = []
      grid.innerHTML = renderMatrixRows(m)
    } else {
      _cachedZones = splitZones(m, blockCount)
      if (zoneIndex >= _cachedZones.length) zoneIndex = 0
      const zone = _cachedZones[zoneIndex]
      const names = zoneNames()
      grid.innerHTML =
        `<div class="zone-label">${names[zoneIndex] || ''}区（${zoneIndex + 1}/${_cachedZones.length}）</div>` +
        `<div class="zone-viewport"><div class="zone-content">${renderMatrixRows(zone.cells)}</div></div>`
    }
  }
  document.getElementById('table-count-num').textContent = tableData.length
  updateRoundDisplay()
  updateTableRangeInfo()
  renderZoneUI(m_or_null(hasLayout))
  fitCurrent()
}

function m_or_null(hasLayout) {
  if (blockCount === 1) return null
  let m = getBaseMatrix()
  if (rotation === 90) m = rotateMatrixCW(m)
  else if (rotation === 180) m = rotateMatrix180(m)
  else if (rotation === 270) m = rotateMatrixCCW(m)
  return m
}

/** 渲染分区切换箭头和右下角缩略图 */
function renderZoneUI(fullMatrix) {
  // 移除旧的
  document.querySelectorAll('.zone-nav, .zone-minimap').forEach(el => el.remove())
  if (blockCount === 1 || !fullMatrix) return

  // 左右箭头
  const left = document.createElement('button')
  left.className = 'zone-nav left'
  left.textContent = '‹'
  left.onclick = () => switchZone(-1)
  document.body.appendChild(left)
  const right = document.createElement('button')
  right.className = 'zone-nav right'
  right.textContent = '›'
  right.onclick = () => switchZone(1)
  document.body.appendChild(right)

  // 缩略图
  const R = fullMatrix.length, C = fullMatrix[0].length
  const byNumber = new Map(tableData.map(t => [t.number, t]))
  const mm = document.createElement('div')
  mm.className = 'zone-minimap'
  const cellSize = Math.max(6, Math.min(12, Math.floor(120 / Math.max(R, C))))
  let html = `<div class="mm-grid" style="grid-template-columns:repeat(${C},${cellSize}px);position:relative">`
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      const cell = fullMatrix[r][c]
      if (cell.type !== 'table') { html += `<div class="mm-cell c-aisle" style="width:${cellSize}px;height:${cellSize}px"></div>`; continue }
      const t = byNumber.get(cell.num)
      const cls = t ? t.color : 'white'
      html += `<div class="mm-cell c-${cls === 'white' ? '' : cls}" style="width:${cellSize}px;height:${cellSize}px"></div>`
    }
  }
  html += '</div>'
  mm.innerHTML = html
  // 当前分区视口框（映射到完整矩阵坐标）
  const zone = _cachedZones[zoneIndex]
  if (zone) {
    const vp = document.createElement('div')
    vp.className = 'mm-viewport'
    // zone.r0/c0 是有效矩阵中的偏移，需要加上 pad 映射回完整矩阵
    // 简化：直接用分区索引估算位置
    const zc = blockCount === 4 ? 2 : 3
    const zr = blockCount === 4 ? 2 : 3
    const zi = Math.floor(zoneIndex / zc)
    const zj = zoneIndex % zc
    vp.style.left = (zj * (C / zc) * (cellSize + 2)) + 'px'
    vp.style.top = (zi * (R / zr) * (cellSize + 2)) + 'px'
    vp.style.width = ((C / zc) * (cellSize + 2) - 2) + 'px'
    vp.style.height = ((R / zr) * (cellSize + 2) - 2) + 'px'
    mm.querySelector('.mm-grid').appendChild(vp)
  }
  document.body.appendChild(mm)
}

/** 按当前模式做宽度适配 */
function fitCurrent() {
  // 移动端：CSS 已用 1fr 自适应，禁用整体缩放避免冲突
  if (!useTableLayout()) {
    const grid = document.getElementById('tables-grid')
    if (grid) { grid.style.transform = ''; grid.style.height = '' }
    return
  }
  if (blockCount > 1) {
    // 分区模式：缩放分区内容到恰好填满可用宽度
    const zc = document.querySelector('#tables-grid .zone-content')
    const vp = document.querySelector('#tables-grid .zone-viewport')
    if (!zc || !vp) return
    // 先还原，测量自然尺寸
    zc.style.transform = ''
    zc.style.height = ''
    const naturalW = zc.scrollWidth
    const availW = vp.clientWidth
    if (naturalW > 0 && availW > 0) {
      const s = availW / naturalW
      zc.style.transformOrigin = 'top left'
      zc.style.transform = `scale(${s})`
      zc.style.height = (zc.scrollHeight * s) + 'px'
    }
    return
  }
  fitTablesToWidth()
}

function renderMatrixRows(m) {
  const byNumber = new Map(tableData.map(t => [t.number, t]))
  return m.map(row =>
    `<div class="table-row">` + row.map(cell => {
      if (cell.type === 'empty') return ''  // 空占位不占位置
      if (cell.type !== 'table') return '<div class="table-aisle"></div>'
      const t = byNumber.get(cell.num)
      return t ? tableSquareHtml(t) : '<div class="table-aisle"></div>'
    }).join('') + `</div>`
  ).join('')
}

/** 更新轮数显示（R1/R2/R3…） */
function updateRoundDisplay() {
  const text = 'R' + (currentTournament ? (currentTournament.roundNumber || 1) : 1)
  const el = document.getElementById('round-display')
  if (el) el.textContent = text
  const mEl = document.getElementById('m-round-display')
  if (mEl) mEl.textContent = text
}

/** 是否使用桌号排序布局（仅 PC / 平板横屏 ≥1024px 使用；手机与平板竖屏忽略） */
function useTableLayout() {
  return window.matchMedia('(min-width: 1024px)').matches
}

/** 当前排列的矩阵（布局=编码矩阵补齐；普通=按桌号顺序排列成方阵；窄屏始终忽略编码布局） */
function getBaseMatrix() {
  if (currentTournament && currentTournament.layoutRows && useTableLayout()) {
    const layout = currentTournament.layoutRows
    const maxLen = Math.max(...layout.map(r => r.length))
    return layout.map(r => {
      const row = r.slice()
      while (row.length < maxLen) row.push({ type: 'aisle' })
      return row
    })
  }
  // 普通模式：按桌号顺序排列，列数取平方根向上取整（尽量接近正方形）
  // 被筛选隐藏的桌子直接移除，后面往前补位
  const visible = tableData.filter(t => !isTableHidden(t))
  const n = visible.length
  if (n === 0) return []
  const cols = Math.ceil(Math.sqrt(n))
  const rows = []
  for (let i = 0; i < n; i += cols) {
    const row = visible.slice(i, i + cols).map(t => ({ type: 'table', num: t.number }))
    while (row.length < cols) row.push({ type: 'aisle' })
    rows.push(row)
  }
  return rows
}

/** 顺时针 90°：转置后每行反转 */
function rotateMatrixCW(m) {
  const R = m.length, C = m[0].length
  const out = []
  for (let c = 0; c < C; c++) {
    const row = []
    for (let r = 0; r < R; r++) row.push(m[r][c])
    row.reverse()
    out.push(row)
  }
  return out
}

/** 180°：行列全反转 */
function rotateMatrix180(m) {
  return m.slice().reverse().map(r => r.slice().reverse())
}

/** 逆时针 90°：列从右往左依次成行 */
function rotateMatrixCCW(m) {
  const R = m.length, C = m[0].length
  const out = []
  for (let c = C - 1; c >= 0; c--) {
    const row = []
    for (let r = 0; r < R; r++) row.push(m[r][c])
    out.push(row)
  }
  return out
}

/** 输出本场截止桌号与下场起始桌号 */
function updateTableRangeInfo() {
  const el = document.getElementById('table-range-info')
  if (!el || !currentTournament || tableData.length === 0) { if (el) el.textContent = ''; return }
  const nums = tableData.map(t => t.number)
  const maxN = Math.max(...nums)
  const minN = Math.min(...nums)
  const reversed = !!currentTournament.tableReversed && !currentTournament.layoutRows
  if (reversed) {
    const next = minN - 1
    el.textContent = next < 1
      ? `桌号 ${maxN}–${minN} · 下场起始：桌号不够`
      : `桌号 ${maxN}–${minN} · 下场起始：${next}`
    el.style.color = next < 1 ? '#dc2626' : ''
  } else {
    el.textContent = `桌号 ${minN}–${maxN} · 下场起始：${maxN + 1}`
    el.style.color = ''
  }
}

// ---------- 视图旋转（所有用户可用） ----------
let rotation = 0   // 0 / 90 / 180 / 270（顺时针角度）

export function rotateTables(dir) {
  rotation = ((rotation + dir * 90) % 360 + 360) % 360
  applyRotation()
}

export function resetRotation() {
  rotation = 0
  applyRotation()
}

function applyRotation() {
  document.getElementById('rotate-reset')?.classList.toggle('hidden', rotation === 0)
  renderTables()
}

/** 桌面区域整体缩放：宽度不足时等比缩小到恰好填满内容盒，保证不出屏幕 */
function fitTablesToWidth() {
  const grid = document.getElementById('tables-grid')
  const area = document.getElementById('tables-area')
  if (!grid || !area) return
  // 先还原，测量自然尺寸
  grid.style.transform = ''
  grid.style.height = ''
  const naturalWidth = grid.scrollWidth
  const naturalHeight = grid.scrollHeight
  // 减去左右实际 padding（基础 16px×2；权限用户有回报面板时右侧多 258px gutter）
  const cs = getComputedStyle(area)
  const contentBox = area.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
  if (naturalWidth > contentBox && naturalWidth > 0) {
    const scale = contentBox / naturalWidth
    grid.style.transformOrigin = 'top left'
    grid.style.transform = `scale(${scale})`
    // transform 不改变布局高度，手动补偿避免下方留白
    grid.style.height = (naturalHeight * scale) + 'px'
  }
}

let lastLayoutState = useTableLayout()
window.addEventListener('resize', () => {
  if (document.getElementById('page-tournament-detail').classList.contains('active')) {
    const nowLayout = useTableLayout()
    if (nowLayout !== lastLayoutState) {
      // 跨越 1024px 断点：矩阵结构变化（窄屏忽略编码布局），需整体重渲染
      lastLayoutState = nowLayout
      renderTables()
    } else {
      applyRotation()
    }
    renderReportPanel() // 面板 top/maxHeight 跟随视口重算
  }
})

/** 判断是否已有成绩回报 */
function computeHasResult(t) {
  return hasReportedResult(t)
}

/** 实时生效：渲染 + 同步 */
function applyAndRender() {
  renderTables()
  if (editingTable) pushSingleTable(editingTable)
}

// ---------- 点击 / 长按（带防误触） ----------
let pressTimer = null
let pressStartPos = null   // {x, y} 按下位置
const DRAG_THRESHOLD = 10  // 移动超过此距离判定为拖动

export function pressStart(num) {
  pressCancel()
  const table = tableData.find(t => t.number === num)
  if (!table || (table.focus && !canManage(currentTournament)) || !readyForOperation()) return
  pressStartPos = null
  pressTimer = setTimeout(() => { pressTimer = null; openTableSettings(num) }, 500)
}

export function pressMove(e) {
  if (!pressTimer) return
  const x = e.touches ? e.touches[0].clientX : e.clientX
  const y = e.touches ? e.touches[0].clientY : e.clientY
  if (pressStartPos === null) { pressStartPos = { x, y }; return }
  const dx = Math.abs(x - pressStartPos.x)
  const dy = Math.abs(y - pressStartPos.y)
  if (dx > DRAG_THRESHOLD || dy > DRAG_THRESHOLD) {
    pressCancel()  // 判定为拖动，取消点击/长按
  }
}

export function pressEnd(num) {
  if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; cycleTableColor(num) }
  pressStartPos = null
}

export function pressCancel() {
  if (pressTimer) { clearTimeout(pressTimer); pressTimer = null }
  pressStartPos = null
}

/** 白色→浅红；非白色→浅红/浅黄/绿轮换 */
// 改动①：颜色循环 白→红→黄→绿→红（demo 原为 白→黄→红→绿→黄）
function cycleTableColor(num) {
  const t = tableData.find(x => x.number === num)
  if (!t || (t.focus && !canManage(currentTournament)) || !readyForOperation()) return
  if (t.color === 'white') t.color = 'red'
  else if (t.color === 'red') t.color = 'yellow'
  else if (t.color === 'yellow') t.color = 'green'
  else t.color = 'red'
  if (t.color !== 'black' && t.outcomeType === 'GHOST') t.outcomeType = null

  // 手动点成绿色：清除盯桌裁判注释，标记手动染绿并开始计时
  if (t.color === 'green') {
    t.watchedBy = null
    t.greenManual = true
    t.greenAt = Date.now()
  } else {
    t.greenManual = false
    t.greenAt = null
  }
  renderTables()
  pushSingleTable(t)
}

// ---------- 桌数控制（权限用户） ----------
export function changeTableCount(delta) {
  if (!currentTournament || !canManage(currentTournament) || !readyForOperation()) return
  let n = tableData.length + delta
  if (n < 1) n = 1
  if (n > 999) n = 999
  while (tableData.length < n) tableData.push(newTable(nextTableNumber()))
  while (tableData.length > n) tableData.pop()
  currentTournament.maxTables = n
  renderTables()
  pushTables()
}

// ---------- 桌子详细设置 ----------
// 弹窗打开时的初始状态快照：点"完成"关闭时与它对比，决定要不要产生成绩/Drop 回报
let modalSnapshot = null

export function openTableSettings(num) {
  editingTable = tableData.find(x => x.number === num)
  if (!editingTable) return
  const t = editingTable
  if (t.focus && !canManage(currentTournament)) { editingTable = null; return }
  modalSnapshot = { result: JSON.stringify(t.result ?? null), drop1: !!t.drop1, drop2: !!t.drop2 }

  document.getElementById('tm-title').textContent = `桌号 #${t.number}`
  document.getElementById('tm-players').textContent = `${t.p1} vs ${t.p2}`
  document.getElementById('tm-time-ext').value = t.timeExt || ''
  document.getElementById('tm-drop1').checked = t.drop1
  document.getElementById('tm-drop2').checked = t.drop2
  document.getElementById('tm-drop1-name').textContent = t.p1
  document.getElementById('tm-drop2-name').textContent = t.p2
  document.getElementById('tm-drop-area').classList.add('hidden')
  updateGhostButton()
  updateSpecialButtons()
  // 重置按钮仅对本场有管理权的用户可见（event 仅自己场）
  document.getElementById('tm-reset-btn').classList.toggle('hidden', !canManage(currentTournament))
  const focusButton = document.getElementById('tm-focus-btn')
  focusButton.classList.toggle('hidden', !canManage(currentTournament))
  focusButton.textContent = t.focus ? '取消焦点桌' : '设为焦点桌'
  updateWatcherText()

  const isFab = currentTournament.game === 'FAB'
  document.getElementById('tm-fab-result').classList.toggle('hidden', !isFab)
  document.getElementById('tm-mtg-result').classList.toggle('hidden', isFab)

  if (isFab) {
    fabResult = typeof t.result === 'string' ? t.result : null
    const btns = document.querySelectorAll('#tm-fab-options .tm-opt')
    btns[0].textContent = `${t.p1} 获胜`
    btns[1].textContent = `${t.p2} 获胜`
    updateFabButtons()
  } else {
    const r = (t.result && typeof t.result === 'object') ? t.result : { p1: 0, p2: 0, draws: 0 }
    document.getElementById('tm-p1-label').textContent = `${t.p1} 胜场`
    document.getElementById('tm-p2-label').textContent = `${t.p2} 胜场`
    document.getElementById('tm-draws').value = r.draws || 0
    buildWinsSelect('tm-p1-wins', 2, r.p1 || 0)
    buildWinsSelect('tm-p2-wins', 2, r.p2 || 0)
    onWinsChange(false)
  }

  document.getElementById('table-modal').classList.remove('hidden')
  document.dispatchEvent(new CustomEvent('lynx:floor-table-open', { detail: { tableNo: t.number } }))
}

export function closeTableModal() {
  if (pendingOperation) { updateSyncStatus('正在保存，请等待确认后完成'); return }
  // 点"完成"= 提交一次：与打开时对比，成绩变了报成绩、新勾了 Drop 报 Drop（每条消息只含一个回报）
  if (editingTable && modalSnapshot) sendPendingReports(editingTable)
  document.getElementById('table-modal').classList.add('hidden')
  editingTable = null
  modalSnapshot = null
}

/** 按最终状态生成回报消息（成绩一条 + 每个新勾的 Drop 各一条） */
function sendPendingReports(t) {
  // 成绩：现在有成绩 且 与打开时不同 → 报（无变化/被清空不报；重复/冲突判定在服务器）
  const now = JSON.stringify(t.result ?? null)
  if (computeHasResult(t) && now !== modalSnapshot.result) {
    const body = resultReportBody(t)
    if (body) ws.sendReport(t.number, 'score', body)
  }
  // Drop：只报"新勾选"的（取消勾选不报；同玩家重复报服务器会标红）
  if (!modalSnapshot.drop1 && t.drop1) ws.sendReport(t.number, 'drop', `player1 - ${t.p1} - Drop`)
  if (!modalSnapshot.drop2 && t.drop2) ws.sendReport(t.number, 'drop', `player2 - ${t.p2} - Drop`)
}

/**
 * 组装成绩回报正文（去重/冲突比较键，服务器前缀 R轮 - 桌号N 后成完整消息）：
 *  胜：  "player1 - 姓名 - 2:0"（MTG 2:0/2:1；FAB 1:0）
 *  平局："Draw - X-Y-Z"（X=p1胜场 Y=p2胜场 Z=平局数；FAB 平局无细分记 0-0-0）
 */
function resultReportBody(t) {
  const r = t.result
  if (!r) return null
  if (typeof r === 'string') {
    if (r === 'p1') return `player1 - ${t.p1} - 1:0`
    if (r === 'p2') return `player2 - ${t.p2} - 1:0`
    if (r === 'draw') return 'Draw - 0-0-0'
    return null
  }
  const p1 = r.p1 || 0, p2 = r.p2 || 0, d = r.draws || 0
  if (p1 === 0 && p2 === 0) return null  // 未分胜负（纯平局局数积累中）不报
  if (p1 > p2) return `player1 - ${t.p1} - ${p1}:${p2}`
  if (p2 > p1) return `player2 - ${t.p2} - ${p2}:${p1}`
  return `Draw - ${p1}-${p2}-${d}`
}

// FAB 结果三选一（再点取消），实时生效
export function setFabResult(r) {
  if (!readyForOperation()) return
  fabResult = fabResult === r ? null : r
  updateFabButtons()
  if (!editingTable) return
  editingTable.result = fabResult
  editingTable.outcomeType = fabResult === 'p1' ? '1WIN' : fabResult === 'p2' ? '2WIN' : fabResult === 'draw' ? 'DRAW' : null
  updateSpecialButtons()
  editingTable.resultSource = fabResult ? (canManage(currentTournament) ? 'manager' : 'judge') : null
  if (fabResult) {
    if (editingTable.color === 'black') clearGhostDrops()
    editingTable.color = 'green'
  }
  applyAndRender()
}

function updateFabButtons() {
  document.querySelectorAll('#tm-fab-options .tm-opt').forEach(b => {
    b.classList.toggle('active', b.dataset.r === fabResult)
  })
}

// MTG 胜场约束：一方为 2 时另一方只能 0/1
function buildWinsSelect(id, max, val) {
  const sel = document.getElementById(id)
  sel.innerHTML = ''
  for (let i = 0; i <= max; i++) {
    const opt = document.createElement('option')
    opt.value = i
    opt.textContent = i
    sel.appendChild(opt)
  }
  sel.value = val
}

export function onWinsChange(save = true) {
  const p1 = document.getElementById('tm-p1-wins')
  const p2 = document.getElementById('tm-p2-wins')
  let v1 = parseInt(p1.value) || 0
  let v2 = parseInt(p2.value) || 0
  if (v1 === 2 && v2 === 2) v2 = 1   // 同时为 2 时后者让位
  const maxP2 = v1 === 2 ? 1 : 2
  const maxP1 = v2 === 2 ? 1 : 2
  buildWinsSelect('tm-p1-wins', maxP1, Math.min(v1, maxP1))
  buildWinsSelect('tm-p2-wins', maxP2, Math.min(v2, maxP2))
  if (save) applyMtgResult()
}

/** 读取 MTG 比分并实时生效 */
export function applyMtgResult() {
  if (!editingTable || !readyForOperation()) return
  const r = {
    p1: parseInt(document.getElementById('tm-p1-wins').value) || 0,
    p2: parseInt(document.getElementById('tm-p2-wins').value) || 0,
    draws: parseInt(document.getElementById('tm-draws').value) || 0,
  }
  editingTable.result = r
  editingTable.outcomeType = r.p1 + r.p2 + r.draws === 0 ? null : r.p1 > r.p2 ? '1WIN' : r.p2 > r.p1 ? '2WIN' : 'DRAW'
  updateSpecialButtons()
  editingTable.resultSource = r.p1 + r.p2 + r.draws > 0 ? (canManage(currentTournament) ? 'manager' : 'judge') : null
  if (r.p1 + r.p2 + r.draws > 0) {
    if (editingTable.color === 'black') clearGhostDrops()
    editingTable.color = 'green'
  }
  applyAndRender()
}

/** 补时实时生效 */
export function onTimeExtInput() {
  if (!editingTable || !readyForOperation()) return
  editingTable.timeExt = parseInt(document.getElementById('tm-time-ext').value) || 0
  applyAndRender()
}

/** Drop 实时生效 */
export function onDropChange() {
  if (!editingTable || !readyForOperation()) return
  editingTable.drop1 = document.getElementById('tm-drop1').checked
  editingTable.drop2 = document.getElementById('tm-drop2').checked
  if (editingTable.color === 'black' && !(editingTable.drop1 && editingTable.drop2)) editingTable.color = 'white'
  updateGhostButton()
  applyAndRender()
}

function clearGhostDrops() {
  editingTable.drop1 = false
  editingTable.drop2 = false
  document.getElementById('tm-drop1').checked = false
  document.getElementById('tm-drop2').checked = false
  updateGhostButton()
}

function updateGhostButton() {
  const button = document.getElementById('tm-ghost-btn')
  if (!button) return
  const selected = editingTable?.color === 'black' && editingTable.drop1 && editingTable.drop2
  button.classList.toggle('active', !!selected)
  button.textContent = selected ? '取消双方均未出席（Ghost）' : '双方均未出席（Ghost）'
}

function updateSpecialButtons() {
  const t = editingTable
  const bye = document.getElementById('tm-special-bye')
  const lossall = document.getElementById('tm-special-lossall')
  if (!bye || !lossall) return
  bye.disabled = !t?.p1 || !!t?.p2
  lossall.disabled = !t?.p1 || !t?.p2
  bye.classList.toggle('active', t?.outcomeType === 'BYE')
  lossall.classList.toggle('active', t?.outcomeType === 'LOSSALL')
}

export function setSpecialOutcome(type) {
  if (!editingTable || !readyForOperation()) return
  const t = editingTable
  if (type === 'BYE' && (!t.p1 || t.p2)) return
  if (type === 'LOSSALL' && (!t.p1 || !t.p2)) return
  if (type !== 'BYE' && type !== 'LOSSALL' && type !== null) return
  t.outcomeType = type
  t.result = type === 'BYE'
    ? currentTournament.game === 'FAB' ? 'p1' : { p1: 2, p2: 0, draws: 0 }
    : null
  t.resultSource = type ? (canManage(currentTournament) ? 'manager' : 'judge') : null
  t.color = type ? 'green' : 'white'
  t.greenManual = false
  t.greenAt = null
  fabResult = type === 'BYE' && currentTournament.game === 'FAB' ? 'p1' : null
  updateFabButtons()
  if (currentTournament.game === 'MTG') {
    buildWinsSelect('tm-p1-wins', 2, type === 'BYE' ? 2 : 0)
    buildWinsSelect('tm-p2-wins', type === 'BYE' ? 1 : 2, 0)
    document.getElementById('tm-draws').value = 0
  }
  updateSpecialButtons()
  applyAndRender()
}

/** Ghost 独立于成绩：黑底白字，双方 Drop；再次点击可撤销。 */
export function toggleGhostTable() {
  if (!editingTable || !readyForOperation()) return
  const selected = editingTable.color === 'black' && editingTable.drop1 && editingTable.drop2
  editingTable.color = selected ? 'white' : 'black'
  editingTable.drop1 = !selected
  editingTable.drop2 = !selected
  editingTable.result = null
  editingTable.outcomeType = selected ? null : 'GHOST'
  updateSpecialButtons()
  editingTable.resultSource = null
  editingTable.greenManual = false
  editingTable.greenAt = null
  editingTable.watchedBy = null
  if (!selected) editingTable.timeExt = 0
  document.getElementById('tm-drop1').checked = editingTable.drop1
  document.getElementById('tm-drop2').checked = editingTable.drop2
  document.getElementById('tm-time-ext').value = editingTable.timeExt || ''
  if (currentTournament.game === 'FAB') {
    fabResult = null
    updateFabButtons()
  } else {
    document.getElementById('tm-draws').value = 0
    buildWinsSelect('tm-p1-wins', 2, 0)
    buildWinsSelect('tm-p2-wins', 2, 0)
  }
  updateWatcherText()
  updateGhostButton()
  applyAndRender()
}

// 我在盯这桌 / 离开这桌，实时生效
export function watchTable() {
  if (!editingTable || !readyForOperation()) return
  const name = sessionStorage.getItem('adminName') || sessionStorage.getItem('guestName') || '匿名用户'
  if (editingTable.watchedBy === name) {
    // 当前用户已在盯 → 离开这桌，清除注释
    editingTable.watchedBy = null
  } else {
    editingTable.watchedBy = name
    if (!computeHasResult(editingTable)) editingTable.color = 'yellow'
  }
  updateWatcherText()
  applyAndRender()
}

export function toggleFocusTable() {
  if (!editingTable || !canManage(currentTournament) || !readyForOperation()) return
  editingTable.focus = !editingTable.focus
  document.getElementById('tm-focus-btn').textContent = editingTable.focus ? '取消焦点桌' : '设为焦点桌'
  applyAndRender()
}

function updateWatcherText() {
  const el = document.getElementById('tm-watcher')
  const btn = document.getElementById('tm-watch-btn')
  const name = sessionStorage.getItem('adminName') || sessionStorage.getItem('guestName') || '匿名用户'
  if (editingTable && editingTable.watchedBy) {
    el.textContent = `当前裁判：${editingTable.watchedBy}`
    el.classList.remove('hidden')
    // 当前用户在盯这桌 → 按钮变为"离开这桌"
    if (btn) btn.textContent = editingTable.watchedBy === name ? '离开这桌' : '我在盯这桌'
  } else {
    el.classList.add('hidden')
    if (btn) btn.textContent = '我在盯这桌'
  }
}

// ---------- 计时器（服务器权威计时模型） ----------
// 同步层改动②：timerState 存服务器，客户端仅渲染 + 发送控制指令（开始/暂停/重置/改时长）
// 状态模型: { configured(分钟), remaining(秒), running, updatedAt(时间戳) }
// 客户端不做权威倒计时，只按时间戳推算剩余时间
let timerState = null
let timerInt = null

export function clearTimerInt() { clearInterval(timerInt) }

function defaultTimerState() {
  return { configured: 50, remaining: 50 * 60, running: false, updatedAt: Date.now() }
}

/** 进入比赛：加载计时状态，绝不重置 */
function loadTimer() {
  clearInterval(timerInt)
  // 同步层改动②：初始状态由 snapshot 提供，未到时先用默认渲染
  if (!timerState) timerState = defaultTimerState()
  renderTimer()
  // 渲染循环：仅刷新显示，不拥有时间
  timerInt = setInterval(renderTimer, 1000)
}

/** 当前剩余秒数（可为负：归零后进入正计时，负值表示超时） */
function currentRemaining() {
  if (!timerState) return 0
  if (!timerState.running) return timerState.remaining
  const elapsed = Math.floor((Date.now() - timerState.updatedAt) / 1000)
  return timerState.remaining - elapsed
}

/** 格式化计时显示：负值显示为红色 -MM:SS */
export function formatTimer(r) {
  const neg = r < 0
  const a = Math.abs(r)
  const m = String(Math.floor(a / 60)).padStart(2, '0')
  const s = String(a % 60).padStart(2, '0')
  return { text: (neg ? '-' : '') + `${m}:${s}`, neg }
}

function renderTimer() {
  if (!timerState) return
  const { text, neg } = formatTimer(currentRemaining())
  const el = document.getElementById('timer-display')
  if (el) { el.textContent = text; el.style.color = neg ? '#dc2626' : '' }
  const mEl = document.getElementById('m-timer-display')
  if (mEl) { mEl.textContent = text; mEl.style.color = neg ? '#dc2626' : '' }
}

export function openTimerSettings() {
  document.getElementById('timer-minutes').value = timerState ? timerState.configured : 50
  updateTimerToggleBtn()
  document.getElementById('timer-modal').classList.remove('hidden')
}

export function applyTimerMinutes() {
  if (!readyForOperation()) return
  const mins = parseInt(document.getElementById('timer-minutes').value)
  if (isNaN(mins) || mins < 0 || mins > 999 || !timerState) return
  // 同步层改动②：发送 set 指令，服务器广播新状态
  ws.sendTimerCmd({ action: 'set', minutes: mins })
}

export function timerToggle() {
  if (!timerState || !readyForOperation()) return
  // 同步层改动②：发送 start/pause 指令，服务器广播新状态
  ws.sendTimerCmd({ action: timerState.running ? 'pause' : 'start' })
}

function updateTimerToggleBtn() {
  const btn = document.getElementById('timer-toggle-btn')
  if (btn) btn.textContent = (timerState && timerState.running) ? '暂停' : '开始'
}

export function timerReset() {
  if (!timerState || !readyForOperation()) return
  // 同步层改动②：发送 reset 指令，服务器广播新状态
  ws.sendTimerCmd({ action: 'reset' })
}

// ---------- 进入 / 离开比赛 ----------
export function showTournamentDetail(t) {
  setCurrentTournament(t)
  setLastPage({ page: 'detail', tournamentId: t.id }) // 规则 5：记住上次停留的比赛详情
  // 记录"进入比赛"（用于赛事列表"最近进入靠前"排序，3 天续期）；失败不影响进入
  const enterName = sessionStorage.getItem('adminName') || sessionStorage.getItem('guestName') || ''
  if (enterName) api.recordEnter(t.id, enterName).catch(() => {})
  refreshDetailHeader()
  // 初始化桌子与计时器
  initTables(t)
  renderTables()
  loadTimer()
  // 回报面板：清空上一场残留，等服务器推 'reports' 初始列表
  reportFeed = []
  renderReportPanel()
  goTo('page-tournament-detail')
  // 页面显示后再做一次宽度适配（隐藏时测量为 0）
  requestAnimationFrame(() => { fitCurrent(); renderReportPanel() })
}

/** 刷新详情页头部（比赛信息 + 权限控件可见性） */
function refreshDetailHeader() {
  const t = currentTournament
  if (!t) return
  // 桌面端元素
  document.getElementById('detail-name').textContent = t.name
  document.getElementById('detail-date').textContent = t.date
  document.getElementById('detail-format').textContent = t.format
  const gameEl = document.getElementById('detail-game')
  gameEl.textContent = t.game
  gameEl.className = 'badge ' + (t.game === 'MTG' ? 'badge-blue' : 'badge-rose')
  const statusEl = document.getElementById('detail-status')
  statusEl.textContent = STATUS_MAP[t.status]
  statusEl.className = 'badge ' + STATUS_CLS[t.status]
  // 移动端元素
  const mName = document.getElementById('m-detail-name')
  if (mName) mName.textContent = t.name
  // 比赛权限密码：对本场有管理权的用户可见
  const codeBox = document.getElementById('detail-event-code')
  const role = getRole()
  // 修复：event 仅在自己那场有管理权；其他场视作 judge，不显示任何操作按钮
  const manageable = canManage(t)
  const showCode = t.eventCode && manageable
  codeBox.classList.toggle('hidden', !showCode)
  if (showCode) document.getElementById('detail-event-code-text').textContent = t.eventCode
  // 对本场有管理权的用户可见的控件
  document.getElementById('table-count-control').classList.toggle('hidden', !manageable)
  document.getElementById('detail-settings-btn').classList.toggle('hidden', !manageable)
  document.getElementById('detail-import-btn').classList.toggle('hidden', !manageable)
  document.getElementById('detail-resetall-btn').classList.toggle('hidden', !manageable)
  document.getElementById('detail-next-round-btn').classList.toggle('hidden', !manageable)
  document.getElementById('detail-show-names').classList.toggle('hidden', !manageable)
  document.getElementById('detail-redall-btn').classList.toggle('hidden', !manageable)
  document.getElementById('timer-gear').classList.toggle('hidden', !manageable)
  // 排序开关（忽略桌号布局）：仅本场有管理权的 PC 用户可见
  document.getElementById('filter-sort').classList.toggle('hidden', !manageable)
  // 移动端抽屉按钮权限
  const drawerItems = ['drawer-admin','drawer-import','drawer-resetall','drawer-redall','drawer-settings','drawer-timer','drawer-eventcode','drawer-next-round','drawer-show-names']
  drawerItems.forEach(id => {
    const el = document.getElementById(id)
    if (el) el.classList.toggle('hidden', !manageable)
  })
}

// ---------- 移动端侧边抽屉 ----------
export function openDrawer() {
  document.getElementById('drawer-overlay').classList.remove('hidden')
  document.getElementById('drawer').classList.add('open')
}

export function closeDrawer() {
  document.getElementById('drawer-overlay').classList.add('hidden')
  document.getElementById('drawer').classList.remove('open')
}

export function leaveTournament() {
  pendingRoundStart = null
  document.getElementById('settlement-modal')?.classList.add('hidden')
  clearPending()
  roomReady = false
  clearInterval(timerInt)
  ws.leaveRoom()
  timerState = null
  rotation = 0
  blockCount = 1
  zoneIndex = 0
  _cachedZones = []
  zoneFilter = new Set()
  tableSearch = ''
  showPlayerNames = false
  confirmedSnapshot = null
  document.querySelectorAll('.zone-nav, .zone-minimap').forEach(el => el.remove())
  reportFeed = []
  closeReportHistory()
  ignoreLayoutOrder = false
  const sortBtn = document.getElementById('filter-sort')
  if (sortBtn) sortBtn.classList.remove('sel')
  setCurrentTournament(null)
  renderReportPanel() // 隐藏面板 + 撤掉桌子区 gutter
  goTo('page-tournaments')
}

// ---------- 比赛设置 ----------
let settingsGame = 'FAB'
let settingsFabFormat = 'Classic Constructed'
let settingsMtgFormat = ''

function syncSettingsFormatControl(game) {
  const control = document.getElementById('ts-format')
  if (!control || !control.hasAttribute('data-beta-format')) {
    if (control) control.placeholder = game === 'FAB' ? '例如：CC / SA' : '例如：T2 / 摩登'
    return
  }

  const isFab = game === 'FAB'
  let next = control
  if (isFab && control.tagName !== 'SELECT') {
    next = document.createElement('select')
    next.innerHTML = FAB_FORMATS.map(format => `<option>${format}</option>`).join('')
    next.addEventListener('change', () => selectSettingsFabFormat(next.value))
    control.replaceWith(next)
  } else if (!isFab && control.tagName !== 'INPUT') {
    next = document.createElement('input')
    next.addEventListener('input', () => { settingsMtgFormat = next.value })
    control.replaceWith(next)
  }

  next.id = 'ts-format'
  next.className = 'input-field'
  next.setAttribute('data-beta-format', '')
  next.value = isFab ? settingsFabFormat : settingsMtgFormat
  if (!isFab) next.placeholder = '例如：T2 / 摩登'

  const hint = document.getElementById('ts-format-timer-hint')
  if (hint) {
    hint.classList.toggle('hidden', !isFab)
    if (isFab) hint.textContent = `保存后每轮计时将自动设置为 ${fabRoundMinutes(next.value)} 分钟`
  }
}

export function openTournamentSettings() {
  const t = currentTournament
  if (!t) return
  selectSettingsGame(t.game)
  document.getElementById('ts-name').value = t.name
  document.getElementById('ts-pass').value = t.password
  document.getElementById('ts-date').value = t.date && t.date !== '待定' ? t.date + 'T10:00' : ''
  const savedFormat = t.format === '未指定' ? '' : t.format
  const formatControl = document.getElementById('ts-format')
  if (t.game === 'FAB' && formatControl.hasAttribute('data-beta-format')) {
    settingsFabFormat = FAB_FORMATS.includes(savedFormat) ? savedFormat : 'Other'
    formatControl.value = settingsFabFormat
    selectSettingsFabFormat(settingsFabFormat)
  } else {
    settingsMtgFormat = savedFormat
    formatControl.value = savedFormat
  }
  document.getElementById('ts-max-tables').value = t.maxTables || tableData.length
  document.getElementById('ts-start-table').value = t.startTable || 1
  document.getElementById('ts-round').value = t.roundNumber || 1
  document.getElementById('ts-manual-only').checked = !!t.manualOnly
  document.getElementById('ts-reversed').checked = !!t.tableReversed
  document.getElementById('ts-event-code').checked = !!t.eventCode
  const codeDisplay = document.getElementById('ts-event-code-display')
  codeDisplay.classList.toggle('hidden', !t.eventCode)
  if (t.eventCode) document.getElementById('ts-event-code-text').textContent = t.eventCode
  // 删除比赛按钮：仅 super / putong(非进行中) 可见；event / judge 永不可见
  const delBtn = document.getElementById('ts-delete-btn')
  if (delBtn) delBtn.classList.toggle('hidden', !canDelete(t))
  updatePinButton()
  document.getElementById('tsettings-modal').classList.remove('hidden')
}

export function selectSettingsGame(game) {
  const control = document.getElementById('ts-format')
  if (control && control.hasAttribute('data-beta-format')) {
    if (settingsGame === 'FAB') settingsFabFormat = control.value || settingsFabFormat
    else settingsMtgFormat = control.value
  }
  settingsGame = game
  document.getElementById('ts-game-fab').className = game === 'FAB' ? 'active-fab' : ''
  document.getElementById('ts-game-mtg').className = game === 'MTG' ? 'active-mtg' : ''
  syncSettingsFormatControl(game)
}

export function selectSettingsFabFormat(format) {
  settingsFabFormat = FAB_FORMATS.includes(format) ? format : 'Other'
  const hint = document.getElementById('ts-format-timer-hint')
  if (hint) hint.textContent = `保存后每轮计时将自动设置为 ${fabRoundMinutes(settingsFabFormat)} 分钟`
}

export function closeTournamentSettings() {
  document.getElementById('tsettings-modal').classList.add('hidden')
}

export async function saveTournamentSettings() {
  const t = currentTournament
  if (!t || !readyForOperation()) return
  const previousGame = t.game
  const previousFormat = t.format

  const name = document.getElementById('ts-name').value.trim()
  const pass = document.getElementById('ts-pass').value.trim()
  if (!name || !pass) { alert('比赛名称和进入密码不能为空'); return }

  t.game = settingsGame
  t.name = name
  t.password = pass
  const dateVal = document.getElementById('ts-date').value
  t.date = dateVal ? dateVal.split('T')[0] : '待定'
  const fmt = document.getElementById('ts-format').value.trim()
  t.format = fmt || '未指定'

  // 最大桌号数：同步增减桌子
  const newMax = parseInt(document.getElementById('ts-max-tables').value) || tableData.length
  let n = Math.max(1, Math.min(999, newMax))
  while (tableData.length < n) tableData.push(newTable(nextTableNumber()))
  while (tableData.length > n) tableData.pop()
  t.maxTables = n

  // 起始桌号与倒序：重新编号
  const startNum = parseInt(document.getElementById('ts-start-table').value) || 1
  const reversed = document.getElementById('ts-reversed').checked
  t.startTable = startNum
  t.tableReversed = reversed
  if (t.layoutCode) {
    // 已有编码布局：按新起始桌号重新解析
    try {
      t.layoutRows = parseTableLayout(t.layoutCode, startNum)
      let maxNum = startNum - 1
      for (const row of t.layoutRows) {
        for (const cell of row) {
          if (cell.type === 'table' && cell.num > maxNum) maxNum = cell.num
        }
      }
      syncTablesToRange(startNum, maxNum)
    } catch { /* 编码异常时保持原样 */ }
  } else {
    tableData.forEach((tb, i) => {
      tb.number = reversed ? startNum - i : startNum + i
    })
  }

  // 特定权限密码
  const wantCode = document.getElementById('ts-event-code').checked
  if (wantCode && !t.eventCode) {
    t.eventCode = randomCode(6)
    t.eventNum = null   // 编号分配在服务端完成
  }
  if (!wantCode) { t.eventCode = null; t.eventNum = null }

  // 当前轮数
  t.roundNumber = Math.max(1, parseInt(document.getElementById('ts-round').value) || 1)
  t.manualOnly = document.getElementById('ts-manual-only').checked

  // 同步层改动②：比赛元信息走 PATCH /api/tournaments/:id（后端广播 tournament）
  let saved = false
  try {
    const updated = await api.tournaments.update(t.id, {
      game: t.game, name: t.name, password: t.password, date: t.date,
      format: t.format, maxTables: t.maxTables, startTable: t.startTable,
      tableReversed: t.tableReversed, roundNumber: t.roundNumber,
      eventCode: t.eventCode, manualOnly: t.manualOnly,
    })
    t.stateRevision = updated.stateRevision
    t.lastImportRound = updated.lastImportRound || 0
    if (confirmedSnapshot) confirmedSnapshot.stateRevision = updated.stateRevision
    saved = true
  } catch (error) {
    if (confirmedSnapshot) applySyncData(confirmedSnapshot)
    renderTables()
    alert(`比赛设置未保存：${error.message}`)
    return
  }

  if (saved && t.game === 'FAB' && (previousGame !== t.game || previousFormat !== t.format)) {
    ws.sendTimerCmd({ action: 'set', minutes: fabRoundMinutes(t.format) })
  }

  // 刷新详情页头部显示
  refreshDetailHeader()

  renderTables()
  pushTables()
  closeTournamentSettings()
}

// ---------- 桌号排序（编码规律） ----------

/** 标记字符 → 序号值：1-9=1-9, A=10, B=11, ..., Z=35（X 不算标记） */
function markerValue(ch) {
  if (/[1-9]/.test(ch)) return parseInt(ch)
  if (/[A-WYZ]/.test(ch)) return ch.charCodeAt(0) - 55  // A=10，X 除外
  return 0
}

/** 是否为标记字符（非0数字或大写字母，X 除外） */
function isMarker(ch) {
  return /[1-9A-WYZ]/.test(ch)
}

export function openOrderModal() {
  document.getElementById('order-input').value = (currentTournament && currentTournament.layoutCode) || ''
  document.getElementById('order-error').classList.add('hidden')
  document.getElementById('order-modal').classList.remove('hidden')
}

export function closeOrderModal() {
  document.getElementById('order-modal').classList.add('hidden')
}

/**
 * 解析桌号编码规律（横向 + 纵向）
 * 横向：非0数字在行首=从左往右，行尾=从右往左；0顺序桌；X过道；XX分段蛇形编号
 * 纵向：每列一个标记，列顶=从上往下，列底=从下往上；标记值=列的编号顺序
 * 返回：行数组，cell = { type:'table', num } | { type:'aisle' }
 */
function parseTableLayout(text, startNum = 1) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l)
  if (!lines.length) return null

  for (const line of lines) {
    if (!/^[0-9A-Za-zXx]+$/.test(line)) {
      throw new Error(`行「${line}」包含无效字符，只允许数字、字母和 X`)
    }
  }

  const mode = detectLayoutMode(lines)
  if (mode === 'horizontal') return parseHorizontalLayout(lines, startNum)
  if (mode === 'vertical') return parseVerticalLayout(lines, startNum)
  throw new Error('无法识别的编码格式：每行（或每列）需各含 1 个位于两端的起始标记')
}

/** 判断编码是横向还是纵向 */
function detectLayoutMode(lines) {
  // 横向：每行(段)恰好 1 个标记，且位于该段首或尾
  const rowsSegs = lines.map(l => l.toUpperCase().split(/X{2,}/))
  let hasMarker = false
  const horizontalOk = rowsSegs.every(segs => segs.every(seg => {
    if (!seg) return true
    const chars = seg.split('')
    const markers = chars.filter(c => isMarker(c))
    if (markers.length !== 1) return false
    const idx = chars.findIndex(c => isMarker(c))
    if (idx !== 0 && idx !== seg.length - 1) return false
    hasMarker = true
    return true
  }))
  if (horizontalOk && hasMarker) return 'horizontal'

  // 纵向：每列恰好 1 个标记，且位于列顶或列底
  const grid = lines.map(l => l.toUpperCase().split(''))
  const R = grid.length
  const C = Math.max(...grid.map(r => r.length))
  let verticalOk = true
  hasMarker = false
  for (let c = 0; c < C && verticalOk; c++) {
    let count = 0, pos = -1
    for (let r = 0; r < R; r++) {
      const ch = grid[r][c] ?? 'X'
      if (isMarker(ch)) { count++; pos = r }
    }
    if (count !== 1 || (pos !== 0 && pos !== R - 1)) verticalOk = false
    else hasMarker = true
  }
  if (verticalOk && hasMarker) return 'vertical'
  return null
}

/** 横向解析（原规则：行流向 + XX 分段蛇形） */
function parseHorizontalLayout(lines, startNum) {
  const rowSegments = lines.map(line => line.toUpperCase().split(/X{2,}/))
  const maxSegs = Math.max(...rowSegments.map(s => s.length))

  const rows = rowSegments.map(() => [])
  let nextNum = startNum

  for (let seg = 0; seg < maxSegs; seg++) {
    const rowIdx = lines.map((_, i) => i)
    if (seg % 2 === 1) rowIdx.reverse()
    for (const i of rowIdx) {
      const segment = rowSegments[i][seg]
      if (segment == null || segment === '') continue
      if (rows[i].length > 0) rows[i].push({ type: 'aisle' })
      nextNum = parseSegment(segment, rows[i], nextNum)
    }
  }
  return rows
}

/** 纵向解析：每列一条"泳道"，标记值决定编号顺序 */
function parseVerticalLayout(lines, startNum) {
  const grid = lines.map(l => l.toUpperCase().split(''))
  const R = grid.length
  const C = Math.max(...grid.map(r => r.length))

  // 收集每列泳道：标记值 + 方向
  const lanes = []
  for (let c = 0; c < C; c++) {
    for (let r = 0; r < R; r++) {
      const ch = grid[r][c] ?? 'X'
      if (isMarker(ch)) {
        lanes.push({ value: markerValue(ch), col: c, fromTop: r === 0 })
        break
      }
    }
  }
  lanes.sort((a, b) => a.value - b.value)

  // 初始化全过道
  const rows = Array.from({ length: R }, () =>
    Array.from({ length: C }, () => ({ type: 'aisle' }))
  )

  let nextNum = startNum
  for (const lane of lanes) {
    const c = lane.col
    const rOrder = lane.fromTop
      ? Array.from({ length: R }, (_, i) => i)
      : Array.from({ length: R }, (_, i) => R - 1 - i)
    for (const r of rOrder) {
      const ch = grid[r][c] ?? 'X'
      if (ch !== 'X') rows[r][c] = { type: 'table', num: nextNum++ }
    }
  }
  return rows
}

/** 解析单个段，返回下一个可用桌号 */
function parseSegment(segment, rowCells, nextNum) {
  const chars = segment.split('')
  // 找标记位置：在开头 → 从左往右；否则视为在结尾 → 从右往左
  const firstMarker = chars.findIndex(c => isMarker(c))
  const leftToRight = firstMarker === 0

  if (leftToRight) {
    for (const c of chars) {
      if (c === '0' || isMarker(c)) rowCells.push({ type: 'table', num: nextNum++ })
      else rowCells.push({ type: 'aisle' })  // 单个 X 过道
    }
  } else {
    // 先生成占位，再从右往左填桌号
    const cells = chars.map(c =>
      (c === '0' || isMarker(c)) ? { type: 'table', num: null } : { type: 'aisle' }
    )
    for (let i = cells.length - 1; i >= 0; i--) {
      if (cells[i].type === 'table') cells[i].num = nextNum++
    }
    rowCells.push(...cells)
  }
  return nextNum
}

/** 按布局范围同步桌子数据（补缺/去多余） */
function syncTablesToRange(startNum, maxNum) {
  const existing = new Map(tableData.map(t => [t.number, t]))
  const next = []
  for (let n = startNum; n <= maxNum; n++) {
    next.push(existing.get(n) || newTable(n))
  }
  tableData = next
  currentTournament.maxTables = tableData.length
  currentTournament.tables = tableData
}

export function applyTableOrder() {
  if (!currentTournament || !canManage(currentTournament) || !readyForOperation()) return
  const text = document.getElementById('order-input').value.trim()
  const errEl = document.getElementById('order-error')
  errEl.classList.add('hidden')

  if (!text) { errEl.textContent = '请输入编码'; errEl.classList.remove('hidden'); return }

  try {
    const startNum = (currentTournament && currentTournament.startTable) || 1
    const rows = parseTableLayout(text, startNum)
    if (!rows) throw new Error('无法解析编码')

    // 布局中最大桌号
    let maxNum = startNum - 1
    for (const row of rows) {
      for (const cell of row) {
        if (cell.type === 'table' && cell.num > maxNum) maxNum = cell.num
      }
    }

    currentTournament.layoutCode = text
    currentTournament.layoutRows = rows
    syncTablesToRange(startNum, maxNum)

    renderTables()
    pushTables()
    closeOrderModal()
  } catch (e) {
    errEl.textContent = e.message
    errEl.classList.remove('hidden')
  }
}

/** 清除排序，恢复默认连续排列 */
export function clearTableOrder() {
  if (!currentTournament || !canManage(currentTournament) || !readyForOperation()) return
  currentTournament.layoutCode = null
  currentTournament.layoutRows = null
  // 重新按起始桌号连续编号
  const start = currentTournament.startTable || 1
  const reversed = !!currentTournament.tableReversed
  tableData.forEach((t, i) => { t.number = reversed ? start - i : start + i })
  renderTables()
  pushTables()
  closeOrderModal()
}

// ---------- 重置桌子（权限用户） ----------
export function resetTable() {
  const t = editingTable
  if (!t || !canManage(currentTournament) || !readyForOperation()) return
  t.color = 'white'
  t.watchedBy = null
  t.result = null
  t.outcomeType = null
  t.drop1 = false
  t.drop2 = false
  t.greenManual = false
  t.greenAt = null
  t.resultSource = null
  // 补时不清空
  applyAndRender()
  closeTableModal()
}

// ---------- 导入比赛数据（网页拓展导出格式） ----------
export function openImportModal() {
  document.getElementById('import-text').value = ''
  document.getElementById('import-msg').innerHTML = ''
  document.getElementById('import-modal').classList.remove('hidden')
}

export function closeImportModal() {
  document.getElementById('import-modal').classList.add('hidden')
}

export async function readClipboard() {
  const msgEl = document.getElementById('import-msg')
  try {
    const text = await navigator.clipboard.readText()
    document.getElementById('import-text').value = text
    msgEl.className = 'import-ok'
    msgEl.textContent = '已读取剪贴板，确认无误后点击导入'
  } catch {
    msgEl.className = 'import-err'
    msgEl.textContent = '无法读取剪贴板，请手动粘贴'
  }
}

/**
 * 导入拓展数据（统一兼容 GEM / melee / EventLink 格式）
 * 字段: tableNumber, playerName1/2, result(1WIN/2WIN/DRAW/LOSSALL/BYE/null),
 *       dropped1/2(GEM/melee/EventLink), timeExtension(仅 melee；EventLink 固定 null 不动桌面已有补时),
 *       p1Wins/p2Wins/draws（插件 v0.3.0，melee/EventLink 的精确比分）
 * 规则: 空成绩保留原桌态；有成绩→绿；Ghost 双 Drop 保持黑色；匹配代码头可开始新一轮
 * MTG 来源（melee/EventLink）与 FAB 来源（GEM）靠当前比赛 game 类型自行解释 result，与数据里 game 字段无关
 */
export function applyImport() {
  if (!currentTournament || !canManage(currentTournament) || !readyForOperation()) return
  const text = document.getElementById('import-text').value.trim()
  const msgEl = document.getElementById('import-msg')
  msgEl.innerHTML = ''
  if (!text) { msgEl.className = 'import-err'; msgEl.textContent = '请粘贴数据'; return }

  let data
  try { data = JSON.parse(text) } catch {
    msgEl.className = 'import-err'; msgEl.textContent = 'JSON 格式错误，请检查是否完整复制'; return
  }
  if (!Array.isArray(data) || data.length === 0) {
    msgEl.className = 'import-err'; msgEl.textContent = '数据需要是非空 JSON 数组'; return
  }

  // 插件 v0.3.0 新一轮代码头必须先弹出，不能当桌子数据标准化。
  const envelope = readImportEnvelope(data)
  data = envelope.data
  const { hasNewRoundHeader, headerStartTable } = envelope
  if (data.length === 0) {
    msgEl.className = 'import-err'; msgEl.textContent = '代码头后没有可导入的桌子数据'; return
  }

  // 校验并标准化
  let entries
  try {
    entries = data.map((item, i) => {
      const tn = parseInt(item.tableNumber)
      if (isNaN(tn)) throw new Error(`第 ${i + 1} 条缺少有效的 tableNumber`)
      return {
        tableNumber: tn,
        p1: item.playerName1 || null,
        p2: item.playerName2 || null,
        playerId1: item.playerGameId1 || null,
        playerId2: item.playerGameId2 || null,
        playerIdNamespace1: item.playerIdNamespace1 || null,
        playerIdNamespace2: item.playerIdNamespace2 || null,
        result: item.result || null,
        outcomeType: ['BYE', 'LOSSALL', '1WIN', '2WIN', 'DRAW'].includes(item.result) ? item.result : null,
        dropped1: !!item.dropped1,
        dropped2: !!item.dropped2,
        timeExt: item.timeExtension != null ? (parseInt(item.timeExtension) || 0) : null,
        p1Wins: optionalScore(item.p1Wins),
        p2Wins: optionalScore(item.p2Wins),
        draws: optionalScore(item.draws),
      }
    })
  } catch (e) {
    msgEl.className = 'import-err'; msgEl.textContent = e.message; return
  }

  // 每轮首次导入以 JSON 桌号清单重设桌数；之后只更新现有桌号。
  const importNums = entries.map(e => e.tableNumber)
  const importMin = Math.min(...importNums)
  const importMax = Math.max(...importNums)
  if (new Set(importNums).size !== importNums.length) {
    msgEl.className = 'import-err'; msgEl.textContent = '导入数据含重复桌号，请检查提取结果'; return
  }

  // 起始桌号校验：导入的最小桌号必须与比赛设置的起始桌号一致
  const expectedStart = currentTournament.startTable || 1
  // 保留原起始桌号校验；唯一例外是“有代码头但起始桌号不匹配”的防误清空场景，
  // 此时按手册要求降级为部分更新，而不是拒绝或清空全场。
  const headerMismatch = hasNewRoundHeader && headerStartTable !== expectedStart
  // 代码头起始桌号不匹配时沿用既有防误清场规则：只做部分更新，不认定为首次导入。
  const firstImport = !headerMismatch &&
    (currentTournament.lastImportRound || 0) !== (currentTournament.roundNumber || 1)
  const isNewRound = hasNewRoundHeader && headerStartTable === expectedStart && !currentTournament.manualOnly
  const firstImportNum = currentTournament.tableReversed ? importMax : importMin
  if ((firstImport || isNewRound) && firstImportNum !== expectedStart) {
    msgEl.className = 'import-err'
    msgEl.textContent = '导入失败：起始桌号不对'
    return
  }

  if (isNewRound) {
    // 缺桌号意味着分页/筛选提取可能不完整，不能以此缩减全场桌台。
    const complete = importMax - importMin + 1 === entries.length
    if (!complete) {
      msgEl.className = 'import-err'
      msgEl.textContent = '新一轮桌号不连续，无法确认提取完整；请检查源页面后重新导入'
      return
    }
    const next = entries.map(e => ({ ...newTable(e.tableNumber), p1: e.p1 || '', p2: e.p2 || '',
      playerId1: e.playerId1, playerId2: e.playerId2,
      playerIdNamespace1: e.playerIdNamespace1, playerIdNamespace2: e.playerIdNamespace2 }))
      .sort((a, b) => currentTournament.tableReversed ? b.number - a.number : a.number - b.number)
    const oldCount = tableData.length
    if (next.length < oldCount && !window.confirm(`新一轮将桌数由 ${oldCount} 减至 ${next.length}，确认提取结果完整并继续？${currentTournament.layoutRows ? ' 自定义桌位布局将恢复默认。' : ''}`)) return
    if (requestRoundStart('import', next, expectedStart,
      `已开始 R${(currentTournament.roundNumber || 1) + 1}，桌数 ${next.length}，计时已重置${currentTournament.layoutRows && next.length !== oldCount ? '，桌位布局已恢复默认' : ''}`)) {
      closeImportModal()
    }
    return
  }

  if (firstImport) {
    const oldCount = tableData.length
    tableData = tablesForFirstImport(tableData, importNums, newTable, !!currentTournament.tableReversed)
    currentTournament.maxTables = tableData.length
    if (tableData.length !== oldCount && currentTournament.layoutRows) {
      currentTournament.layoutRows = null
      currentTournament.layoutCode = null
    }
  } else {
    const existingNumbers = new Set(tableData.map(table => table.number))
    const unknown = importNums.filter(number => !existingNumbers.has(number))
    if (unknown.length) {
      msgEl.className = 'import-err'
      msgEl.textContent = `本轮桌数已由首次导入锁定；桌号 ${unknown.slice(0, 5).join('、')} 不在现有桌台中，请检查 JSON 或开始下一轮`
      return
    }
  }
  currentTournament.tables = tableData

  const isFab = currentTournament.game === 'FAB'

  for (const e of entries) {
    const t = tableData.find(x => x.number === e.tableNumber)
    if (!t) continue
    if (e.p1) {
      if (t.p1 !== e.p1 && !e.playerId1) { t.playerId1 = null; t.playerIdNamespace1 = null }
      t.p1 = e.p1
    }
    if (e.p2) {
      if (t.p2 !== e.p2 && !e.playerId2) { t.playerId2 = null; t.playerIdNamespace2 = null }
      t.p2 = e.p2
    }
    if (e.playerId1) { t.playerId1 = e.playerId1; t.playerIdNamespace1 = e.playerIdNamespace1 }
    if (e.playerId2) { t.playerId2 = e.playerId2; t.playerIdNamespace2 = e.playerIdNamespace2 }

    // 有成绩才覆盖成绩和颜色；空成绩记录保留巡场状态。
    if (e.result) {
      t.outcomeType = e.outcomeType
      if (isFab) {
        t.result = (e.result === '1WIN' || e.result === 'BYE') ? 'p1'
          : e.result === '2WIN' ? 'p2' : e.result === 'DRAW' ? 'draw' : null
      } else {
        t.result = mtgResultFromImport(e)
      }
      if (t.result !== null) {
        t.color = 'green'
        t.resultSource = 'import'
        t.greenManual = false
        t.greenAt = null
      }
      if (e.result === 'LOSSALL') {
        t.color = 'green'
        t.resultSource = 'import'
        t.greenManual = false
        t.greenAt = null
      }
    }
    if (e.result) {
      t.drop1 = e.dropped1
      t.drop2 = e.dropped2
    } else {
      if (e.dropped1) t.drop1 = true
      if (e.dropped2) t.drop2 = true
    }
    if (e.timeExt !== null && (e.result || e.timeExt > 0)) t.timeExt = Math.max(t.timeExt || 0, e.timeExt)
    if (t.drop1 && t.drop2) {
      if (t.color !== 'black') {
        t.color = 'green'
        t.greenManual = false
        t.greenAt = null
        t.resultSource = 'import'
      }
    } else if (t.color === 'black') {
      t.color = 'white'
    }
  }

  renderTables()
  if (pushTables(headerMismatch ? null : (currentTournament.roundNumber || 1))) {
    pendingOperation.successMessage = `已导入 ${entries.length} 桌数据${firstImport ? `，本轮桌数已设为 ${tableData.length}` : ''}`
    closeImportModal()
  }
}

// ---------- 重置全部桌子：只清桌台状态，不改变轮数或比赛设置 ----------
export function resetAllTables() {
  if (!currentTournament || !canManage(currentTournament) || !readyForOperation()) return
  if (!window.confirm('是否要重置所有桌子方块？此操作不可逆。')) return

  for (const t of tableData) {
    resetTableState(t)
  }
  renderTables()
  pushTables()
}

// ---------- 批量标红：把所有白色的桌设为红色 ----------
export function markAllRed() {
  if (!currentTournament || !canManage(currentTournament) || !readyForOperation()) return
  for (const t of tableData) {
    if (t.color === 'white') t.color = 'red'
  }
  renderTables()
  pushTables()
}

export function startNextRound() {
  if (!currentTournament || !canManage(currentTournament) || !readyForOperation()) return
  requestRoundStart('manual', null, currentTournament.startTable || 1,
    `已结算 R${currentTournament.roundNumber || 1}，开始 R${(currentTournament.roundNumber || 1) + 1}，计时已重置`)
}

function requestRoundStart(mode, tables, startTable, successMessage) {
  if (!readyForOperation()) return false
  const stateRevision = confirmedSnapshot?.stateRevision ?? currentTournament.stateRevision ?? 0
  pendingRoundStart = { mode, tables, startTable, stateRevision, successMessage, preview: null }
  if (!ws.previewRound(stateRevision)) { pendingRoundStart = null; return false }
  return true
}

export function closeSettlementModal() {
  document.getElementById('settlement-modal').classList.add('hidden')
  pendingRoundStart = null
}

export function confirmSettlement() {
  const pending = pendingRoundStart
  if (!pending?.preview || !currentTournament || !readyForOperation()) return
  const preview = pending.preview
  const error = document.getElementById('settlement-error')
  if (preview.unresolved.length) { error.textContent = '请先处理无法结算的桌台'; return }
  if (!preview.policySaved && !document.getElementById('settlement-policy-confirm').checked) {
    error.textContent = '请先确认本场积分规则'; return
  }
  if (preview.baselineMissing && !document.getElementById('settlement-baseline-confirm').checked) {
    error.textContent = '请导入上一轮积分，或确认从本轮起累计'; return
  }
  const ids = { win: 'win', draw: 'draw', loss: 'loss', bye: 'bye', doubleLoss: 'double-loss' }
  const policy = {}
  for (const [field, id] of Object.entries(ids)) {
    const raw = document.getElementById(`settlement-${id}`).value.trim()
    if (!/^\d+$/.test(raw) || Number(raw) > 100) { error.textContent = '积分规则须填写 0–100 的整数'; return }
    policy[field] = Number(raw)
  }
  const settlement = {
    previewRevision: preview.stateRevision, scoringPolicy: policy,
    policyConfirmed: preview.policySaved || document.getElementById('settlement-policy-confirm').checked,
    partialBaselineConfirmed: !preview.baselineMissing || document.getElementById('settlement-baseline-confirm').checked,
  }
  if (beginOperation(opId => ws.startRound(pending.mode, pending.tables, pending.startTable,
    pending.stateRevision, opId, settlement))) {
    pendingOperation.successMessage = pending.successMessage
    closeSettlementModal()
  }
}

export function copyEventCode() {
  const code = document.getElementById('detail-event-code-text').textContent
  if (code) navigator.clipboard.writeText(code).then(() => alert('已复制：' + code))
}
