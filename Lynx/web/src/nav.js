// ==================== 页面切换 / 导航栏 / 顶部保留比赛 ====================
import * as api from './api.js'
import * as ws from './ws.js'
import {
  tournaments, currentTournament,
  ROLE_MAP, ROLE_CLS,
  getRole, isPrivileged,
} from './state.js'
import { renderTournaments, refreshMyEntries } from './pages/tournaments.js'
import { updateAdminInfo, refreshGrants } from './pages/admin.js'
import { showTournamentDetail, clearTimerInt, formatTimer, renderTables, tableData } from './pages/detail.js'
import { clearAuth, setLastPage } from './auth.js'

// ==================== 页面切换 ====================
export function goTo(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'))
  document.getElementById(pageId).classList.add('active')
  updateNav()
  // 规则 5：记住上次停留页面（detail 页由 showTournamentDetail 单独记，含 tournamentId）
  if (pageId === 'page-tournaments') setLastPage({ page: 'tournaments' })
  else if (pageId === 'page-admin') setLastPage({ page: 'admin' })
  if (pageId === 'page-tournaments') refreshTournaments()
  if (pageId === 'page-admin') { updateAdminInfo(); refreshGrants() }
}

export async function refreshTournaments() {
  try { const list = await api.tournaments.list(); tournaments.length = 0; tournaments.push(...list) } catch {}
  await refreshMyEntries() // 拉"我的最近进入记录"用于排序（纯前端，仅影响自己）
  renderTournaments()
}

export function updateNav() {
  const guest = sessionStorage.getItem('guestName')
  const admin = sessionStorage.getItem('adminName')
  const role = getRole()
  const nameEl = document.getElementById('nav-username')
  const roleBadge = document.getElementById('nav-role-badge')
  const adminBtn = document.getElementById('nav-admin-btn')
  const logoutBtn = document.getElementById('nav-logout-btn')

  if (guest || admin) {
    nameEl.textContent = admin || guest
    nameEl.classList.remove('hidden')
    logoutBtn.classList.remove('hidden')
    adminBtn.classList.toggle('hidden', !isPrivileged())
    if (ROLE_MAP[role]) {
      roleBadge.textContent = ROLE_MAP[role]
      roleBadge.className = 'badge ' + ROLE_CLS[role]
      roleBadge.classList.remove('hidden')
    } else {
      roleBadge.classList.add('hidden')
    }
  } else {
    nameEl.classList.add('hidden')
    roleBadge.classList.add('hidden')
    adminBtn.classList.add('hidden')
    logoutBtn.classList.add('hidden')
  }
  renderNavPins()
}

export function logout() {
  api.logout().catch(() => {})
  sessionStorage.removeItem('guestName')
  sessionStorage.removeItem('adminName')
  sessionStorage.removeItem('userRole')
  sessionStorage.removeItem('eventTournamentId')
  sessionStorage.removeItem('sessionToken')
  clearAuth() // 规则 5：右上角退出 → 忘掉记住的用户名/密码/页面
  ws.leaveRoom()
  goTo('page-login')
}

// ==================== 顶部保留比赛（跟随权限密码） ====================
// 同步层改动②：pins 存服务器（GET/PUT /api/pins），按权限密码关联
let pinsCache = []

export async function loadPins() {
  if (!isPrivileged()) { pinsCache = []; return }
  try { pinsCache = await api.pins.list() || [] } catch { pinsCache = [] }
}

export function getPins() { return pinsCache }

export function isPinned(id) { return pinsCache.includes(id) }

export async function togglePin() {
  const t = currentTournament
  if (!t) return
  if (pinsCache.includes(t.id)) pinsCache = pinsCache.filter(x => x !== t.id)
  else pinsCache.push(t.id)
  try { await api.pins.save(pinsCache) } catch {}
  updatePinButton()
  renderNavPins()
}

export function updatePinButton() {
  const btn = document.getElementById('ts-pin-btn')
  if (!btn || !currentTournament) return
  const pinned = isPinned(currentTournament.id)
  btn.textContent = pinned ? '取消保留' : '保留到顶端'
  btn.className = pinned ? 'btn-primary' : 'btn-secondary'
  btn.style.width = '100%'
}

export function renderNavPins() {
  const wrap = document.getElementById('nav-pins')
  if (!isPrivileged()) { wrap.classList.add('hidden'); wrap.innerHTML = ''; return }
  const pins = pinsCache.map(id => tournaments.find(t => t.id === id)).filter(Boolean)
  wrap.innerHTML = pins.map(t =>
    `<button class="nav-pin" onclick="quickEnter(${t.id})">${t.name}<span class="pin-timer" id="pin-timer-${t.id}"></span></button>`
  ).join('')
  wrap.classList.toggle('hidden', pins.length === 0)
  updatePinTimers()
}

/** 读取某比赛的计时状态并推算当前剩余（可为负） */
// 同步层改动②：计时状态来自服务器（比赛详情内含 timer 快照）
export async function readTournamentTimer(id) {
  try {
    const t = await api.tournaments.get(id)
    const s = t && t.timer
    if (!s || typeof s.remaining !== 'number') return null
    if (!s.running) return s.remaining
    return s.remaining - Math.floor((Date.now() - s.updatedAt) / 1000)
  } catch { return null }
}

/** 刷新所有保留比赛的计时器显示 */
export async function updatePinTimers() {
  for (const id of pinsCache) {
    const el = document.getElementById('pin-timer-' + id)
    if (!el) continue
    const r = await readTournamentTimer(id)
    if (r === null) { el.textContent = ''; el.className = 'pin-timer'; continue }
    const { text, neg } = formatTimer(r)
    el.textContent = text
    el.className = 'pin-timer' + (neg ? ' neg' : '')
  }
}

// 全局每秒刷新保留比赛的计时器
setInterval(() => {
  if (pinsCache.length) updatePinTimers()
}, 1000)

// 每 10 秒刷新桌面（让手动染绿超过 2 分钟的计时自动出现）
setInterval(() => {
  if (document.getElementById('page-tournament-detail').classList.contains('active') &&
      tableData.some(t => t.greenManual && t.color === 'green')) {
    renderTables()
  }
}, 10000)

/** 保留入口快速进入（权限用户免密码） */
export function quickEnter(id) {
  const t = tournaments.find(x => x.id === id)
  if (!t) return
  clearTimerInt()
  showTournamentDetail(t)
}
