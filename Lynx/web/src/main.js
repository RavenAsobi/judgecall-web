// ==================== 入口 ====================
import * as api from './api.js'
import * as nav from './nav.js'
import * as login from './pages/login.js'
import * as admin from './pages/admin.js'
import * as tour from './pages/tournaments.js'
import * as detail from './pages/detail.js'
import * as judge from './pages/judge-tools.js'
import { getAuth, clearAuth } from './auth.js'
import { tournaments } from './state.js'

// ---------- 暴露给 inline onclick 的全局函数 ----------
Object.assign(window, {
  // nav
  goTo: nav.goTo,
  logout: nav.logout,
  togglePin: nav.togglePin,
  quickEnter: nav.quickEnter,
  // login
  switchTab: login.switchTab,
  guestLogin: login.guestLogin,
  adminLogin: login.adminLogin,
  // admin
  switchAdminTab: admin.switchAdminTab,
  selectGame: admin.selectGame,
  selectFabFormat: admin.selectFabFormat,
  selectDuration: admin.selectDuration,
  createTournament: admin.createTournament,
  generateGrant: admin.generateGrant,
  copyGrantCode: admin.copyGrantCode,
  editGrantNote: admin.editGrantNote,
  deactivateGrant: admin.deactivateGrant,
  // tournaments
  renderTournaments: tour.renderTournaments,
  setGameFilter: tour.setGameFilter,
  openPasswordModal: tour.openPasswordModal,
  closePasswordModal: tour.closePasswordModal,
  verifyTournamentPassword: tour.verifyTournamentPassword,
  openDeleteModal: tour.openDeleteModal,
  closeDeleteModal: tour.closeDeleteModal,
  confirmDelete: tour.confirmDelete,
  deleteCurrentTournament: tour.deleteCurrentTournament,
  // detail
  leaveTournament: detail.leaveTournament,
  toggleFilter: detail.toggleFilter,
  searchTables: detail.searchTables,
  clearTableSearch: detail.clearTableSearch,
  togglePlayerNames: detail.togglePlayerNames,
  setBlocks: detail.setBlocks,
  openZoneFilter: detail.openZoneFilter,
  closeZoneFilter: detail.closeZoneFilter,
  clearZoneFilter: detail.clearZoneFilter,
  applyZoneFilter: detail.applyZoneFilter,
  pressStart: detail.pressStart,
  pressMove: detail.pressMove,
  pressEnd: detail.pressEnd,
  pressCancel: detail.pressCancel,
  changeTableCount: detail.changeTableCount,
  openTableSettings: detail.openTableSettings,
  closeTableModal: detail.closeTableModal,
  setFabResult: detail.setFabResult,
  onWinsChange: detail.onWinsChange,
  applyMtgResult: detail.applyMtgResult,
  onTimeExtInput: detail.onTimeExtInput,
  onDropChange: detail.onDropChange,
  toggleGhostTable: detail.toggleGhostTable,
  setSpecialOutcome: detail.setSpecialOutcome,
  watchTable: detail.watchTable,
  toggleFocusTable: detail.toggleFocusTable,
  openTimerSettings: detail.openTimerSettings,
  applyTimerMinutes: detail.applyTimerMinutes,
  timerToggle: detail.timerToggle,
  timerReset: detail.timerReset,
  openTournamentSettings: detail.openTournamentSettings,
  selectSettingsGame: detail.selectSettingsGame,
  selectSettingsFabFormat: detail.selectSettingsFabFormat,
  closeTournamentSettings: detail.closeTournamentSettings,
  saveTournamentSettings: detail.saveTournamentSettings,
  openOrderModal: detail.openOrderModal,
  closeOrderModal: detail.closeOrderModal,
  applyTableOrder: detail.applyTableOrder,
  clearTableOrder: detail.clearTableOrder,
  resetTable: detail.resetTable,
  openImportModal: detail.openImportModal,
  closeImportModal: detail.closeImportModal,
  readClipboard: detail.readClipboard,
  applyImport: detail.applyImport,
  resetAllTables: detail.resetAllTables,
  startNextRound: detail.startNextRound,
  closeSettlementModal: detail.closeSettlementModal,
  confirmSettlement: detail.confirmSettlement,
  markAllRed: detail.markAllRed,
  copyEventCode: detail.copyEventCode,
  openDrawer: detail.openDrawer,
  closeDrawer: detail.closeDrawer,
  toggleJudgeMode: judge.toggleJudgeMode,
  setDeckFilter: judge.setDeckFilter,
  pickDeckTables: judge.pickDeckTables,
  openStandingsModal: judge.openStandingsModal,
  closeStandingsModal: judge.closeStandingsModal,
  submitStandings: judge.submitStandings,
  openPenaltyModal: judge.openPenaltyModal,
  closePenaltyModal: judge.closePenaltyModal,
  submitPenalty: judge.submitPenalty,
  openDeckModal: judge.openDeckModal,
  closeDeckModal: judge.closeDeckModal,
  toggleDeckMark: judge.toggleDeckMark,
  submitDeckCheck: judge.submitDeckCheck,
  // 成绩回报面板
  ackReportItem: detail.ackReportItem,
  clearAllReports: detail.clearAllReports,
  openReportHistory: detail.openReportHistory,
  closeReportHistory: detail.closeReportHistory,
  toggleSortOrder: detail.toggleSortOrder,
})

// ---------- 启动 ----------
// 规则 5：启动时若登录态未过期（3 天滑动续期），静默恢复并回到上次停留页面；
// 比赛被删 / 该场密码变化 / 权限密码失效 → 清登录态，回登录页或比赛列表页。
async function boot() {
  // 未登录时不要请求仅原初管理员可访问的 grants，避免登录页产生预期外的 403 控制台错误。
  // 进入管理后台时 nav.goTo('page-admin') 会按当前权限刷新 grants。
  await Promise.all([nav.refreshTournaments(), nav.loadPins()])

  const auth = getAuth()
  if (!auth) { nav.updateNav(); return } // 未登录 / 已过期 → 停留登录页

  // 权限用户：验证存的 credential 是否仍有效（失效则清登录态回登录页）
  if (auth.token) {
    try {
      sessionStorage.setItem('sessionToken', auth.token)
      const res = await api.restoreSession()
      if (!res || !res.role) throw new Error('invalid')
      // credential 有效：以服务器最新角色为准（可能已被升降级）
      sessionStorage.setItem('adminName', auth.name)
      sessionStorage.setItem('userRole', res.role)
      if (res.eventTournamentId) sessionStorage.setItem('eventTournamentId', String(res.eventTournamentId))
    } catch {
      clearAuth() // 密码失效
      nav.updateNav()
      return
    }
  } else {
    // 游客：直接恢复用户名
    sessionStorage.setItem('guestName', auth.name)
    sessionStorage.setItem('userRole', 'judge')
  }

  await nav.loadPins() // 恢复身份后再拉一次 pins（依赖 credential）

  // 恢复到上次停留页面
  const lp = auth.lastPage
  const role = sessionStorage.getItem('userRole') || 'judge'
  const eventTid = sessionStorage.getItem('eventTournamentId')

  // event 用户优先进入对应比赛（demo 原有逻辑）
  if (role === 'event' && eventTid) {
    const t = tournaments.find(x => String(x.id) === String(eventTid))
    if (t) { detail.showTournamentDetail(t); return }
  }

  if (lp && lp.page === 'detail' && lp.tournamentId) {
    const t = tournaments.find(x => String(x.id) === String(lp.tournamentId))
    if (t) {
      // 比赛还在：密码变化对权限用户无碍，对游客需重新验证（verify 走缓存/密码）
      detail.showTournamentDetail(t)
      return
    }
    // 比赛已被删除 → 兜底回比赛列表页
  }

  if (lp && lp.page === 'admin' && ['super', 'putong'].includes(role)) {
    nav.goTo('page-admin')
    return
  }

  // 默认 / 兜底：比赛列表页
  nav.goTo('page-tournaments')
}
boot().catch((error) => {
  nav.updateNav()
  if (location.protocol === 'file:') {
    const errEl = document.getElementById('login-error')
    if (errEl) {
      errEl.textContent = '这是前端单文件，不能直接读取权限数据库。请双击项目根目录（web 的上一级目录）的“启动Lynx-Beta.cmd”，然后在自动打开的 http://127.0.0.1:3000/ 中登录。'
      errEl.classList.remove('hidden')
    }
  } else {
    console.error('[lynx] startup failed', error)
  }
})
