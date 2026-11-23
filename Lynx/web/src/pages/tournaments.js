// ==================== 界面3：赛事列表 ====================
import * as api from '../api.js'
import {
  tournaments, setTournaments,
  currentTournament, setCurrentTournament,
  deleteTarget, setDeleteTarget,
  STATUS_MAP, STATUS_CLS,
  getRole, canDelete,
} from '../state.js'
import { showTournamentDetail, clearTimerInt } from './detail.js'
import { goTo } from '../nav.js'

// ---------- 游戏类型筛选（任何权限可用，纯前端） ----------
let gameFilter = 'ALL' // ALL | FAB | MTG
export function setGameFilter(g) {
  gameFilter = g
  ;['ALL','FAB','MTG'].forEach(x => {
    const btn = document.getElementById('filter-' + x.toLowerCase())
    if (btn) btn.classList.toggle('active', x === g)
  })
  renderTournaments()
}

// ---------- 我的最近进入记录（纯前端排序自己的列表，不影响他人） ----------
let myEntriesMap = new Map() // tournamentId -> expiresAt
export async function refreshMyEntries() {
  const name = sessionStorage.getItem('adminName') || sessionStorage.getItem('guestName')
  if (!name) { myEntriesMap = new Map(); return }
  try {
    const list = await api.myEntries() || []
    myEntriesMap = new Map(list.map(e => [Number(e.tournamentId), e.expiresAt]))
  } catch { /* 失败则不排序 */ }
}

/** 排序：我进入过(未过期)的靠前，按进入到期时间倒序；其余保持创建时间序 */
function sortWithMyEntries(list) {
  const mine = [], rest = []
  for (const t of list) {
    if (myEntriesMap.has(Number(t.id))) mine.push(t)
    else rest.push(t)
  }
  mine.sort((a, b) => (myEntriesMap.get(Number(b.id)) || 0) - (myEntriesMap.get(Number(a.id)) || 0))
  // rest 已是后端按 createdAt 倒序，无需重排
  return mine.concat(rest)
}

export function renderTournaments() {
  const q = (document.getElementById('search-input').value || '').toLowerCase()
  const guest = sessionStorage.getItem('guestName')
  const admin = sessionStorage.getItem('adminName')
  const greeting = document.getElementById('tournament-greeting')
  const displayName = admin || guest || ''
  greeting.textContent = (displayName ? '你好，' + displayName + '，' : '你好，') + '点击比赛输入密码进入'

  let filtered = q ? tournaments.filter(t => t.name.toLowerCase().includes(q)) : tournaments.slice()
  // 游戏类型筛选
  if (gameFilter !== 'ALL') filtered = filtered.filter(t => t.game === gameFilter)
  // 最近进入靠前（纯前端，只影响当前用户自己看到的顺序）
  filtered = sortWithMyEntries(filtered)
  const el = document.getElementById('tournament-list')

  if (filtered.length === 0) {
    el.innerHTML = '<div class="card" style="grid-column:1/-1"><div class="empty-state"><div class="icon"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"/></svg></div><p class="text-gray text-sm">暂无比赛</p></div></div>'
    return
  }

  el.innerHTML = filtered.map(t => `
    <div class="tournament-card game-${t.game.toLowerCase()}" onclick="openPasswordModal(${t.id})">
      ${canDelete(t) ? `<button class="btn-danger delete-btn" onclick="event.stopPropagation();openDeleteModal(${t.id})">删除</button>` : ''}
      <div class="flex items-center justify-between mb-2" style="padding-right:${canDelete(t) ? '48px' : '0'}">
        <div style="flex:1;min-width:0">
          <h3>${t.name}</h3>
          <p class="date">${t.date}</p>
        </div>
        <span class="badge ${STATUS_CLS[t.status]}">${STATUS_MAP[t.status]}</span>
      </div>
      <div class="tags">
        <span class="badge ${t.game === 'MTG' ? 'badge-blue' : 'badge-rose'}">${t.game}</span>
        <span class="plain">${t.format}</span>
        <span class="plain">${t.players} 人</span>
      </div>
      <div class="lock">
        <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
        需要密码进入
      </div>
    </div>
  `).join('')
}

export function openPasswordModal(id) {
  setCurrentTournament(tournaments.find(t => t.id === id))
  if (!currentTournament) return
  // 比赛权限用户进入对应比赛免密码
  if (getRole() === 'event' && sessionStorage.getItem('eventTournamentId') === String(id)) {
    showTournamentDetail(currentTournament)
    return
  }
  document.getElementById('modal-title').textContent = currentTournament.name
  document.getElementById('modal-password').value = ''
  document.getElementById('modal-error').classList.add('hidden')
  document.getElementById('password-modal').classList.remove('hidden')
  setTimeout(() => document.getElementById('modal-password').focus(), 100)
}

export function closePasswordModal() {
  document.getElementById('password-modal').classList.add('hidden')
  setCurrentTournament(null)
}

export async function verifyTournamentPassword() {
  const pass = document.getElementById('modal-password').value
  const errEl = document.getElementById('modal-error')
  const btn = document.getElementById('modal-verify-btn')

  btn.disabled = true
  btn.textContent = '验证中...'
  errEl.classList.add('hidden')

  try {
    // 同步层改动②：POST /api/tournaments/:id/verify
    // （权限用户 / 免密缓存 / 比赛密码三种途径由后端判定）
    const name = sessionStorage.getItem('adminName') || sessionStorage.getItem('guestName') || ''
    await api.tournaments.verify(currentTournament.id, pass, name)
    const t = currentTournament
    closePasswordModal()
    showTournamentDetail(t)
  } catch {
    errEl.classList.remove('hidden')
  } finally {
    btn.disabled = false
    btn.textContent = '进入比赛'
  }
}

// ==================== 删除比赛 ====================
export function openDeleteModal(id) {
  setDeleteTarget(tournaments.find(t => t.id === id))
  if (!deleteTarget) return
  document.getElementById('delete-msg').textContent = `确定要删除比赛「${deleteTarget.name}」吗？此操作不可撤销。`
  document.getElementById('delete-modal').classList.remove('hidden')
}

export function closeDeleteModal() {
  document.getElementById('delete-modal').classList.add('hidden')
  setDeleteTarget(null)
}

export async function confirmDelete() {
  if (!deleteTarget) return
  const deletedId = deleteTarget.id
  // 同步层改动②：DELETE /api/tournaments/:id（广播 deleted 由后端发出）
  try { await api.tournaments.remove(deletedId) } catch {}
  setTournaments(tournaments.filter(t => t.id !== deletedId))
  closeDeleteModal()
  if (document.getElementById('page-tournament-detail').classList.contains('active')) {
    clearTimerInt()
    setCurrentTournament(null)
  }
  renderTournaments()
  goTo('page-tournaments')
}

export function deleteCurrentTournament() {
  if (currentTournament) openDeleteModal(currentTournament.id)
}
