// ==================== 数据 ====================
// 与 demo 保持一致的全局常量、共享可变状态与工具函数，供各 page 模块读写

export const STATUS_MAP = { upcoming:'即将开始', ongoing:'进行中', completed:'已完成' }
export const STATUS_CLS = { upcoming:'badge-blue', ongoing:'badge-green', completed:'badge-gray' }
export const ROLE_MAP = { super:'原初权限用户', putong:'普通权限用户', event:'比赛权限用户' }
export const ROLE_CLS = { super:'badge-red', putong:'badge-amber', event:'badge-gray' }
export const PERMANENT_GRANT_EXPIRY = '9999-12-31'

// 比赛列表（启动时从服务器拉取）
export let tournaments = []
export function setTournaments(list) { tournaments = list }

// 权限密码记录：仅 super 可发放普通权限密码
export let grants = []
export function setGrants(list) { grants = list }

export function localDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function daysFromNow(n) {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return localDateStr(d)
}

/** 密码是否生效（按有效期动态判断） */
export function grantActive(g) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return new Date(g.expiry) >= today
}

export function grantExpiryLabel(g) {
  return g && g.expiry === PERMANENT_GRANT_EXPIRY ? '无限期' : (g && g.expiry) || ''
}

/** 过期密码的删除日期 = 过期 + 30 天 */
export function grantPurgeDate(g) {
  const d = new Date(g.expiry)
  d.setDate(d.getDate() + 30)
  return d.toLocaleDateString('zh-CN')
}

export let currentTournament = null
export function setCurrentTournament(t) { currentTournament = t }

export let selectedGame = 'FAB'
export function setSelectedGame(g) { selectedGame = g }

export let selectedDuration = 7
export function setSelectedDuration(d) { selectedDuration = d }

export let deleteTarget = null
export function setDeleteTarget(t) { deleteTarget = t }

// ==================== 工具函数 ====================
export function getRole() { return sessionStorage.getItem('userRole') || 'judge' }
export function isPrivileged() { return ['super','putong'].includes(getRole()) }
export function canGrant() { return ['super'].includes(getRole()) }
export function canDelete(t) {
  const r = getRole()
  if (r === 'super') return true
  if (r === 'putong') return t.status !== 'ongoing'
  return false
}

/** 对某场比赛是否有"管理权"（显示导入/批量标红/比赛设置/计时器设置等操作按钮）
 *  super / putong → 任何场都有
 *  event          → 仅自己那场（eventTournamentId === t.id）；其他场视作 judge，无管理权
 *  judge          → 无
 */
export function canManage(t) {
  const r = getRole()
  if (r === 'super' || r === 'putong') return true
  if (r === 'event') return !!t && sessionStorage.getItem('eventTournamentId') === String(t.id)
  return false
}

export function randomCode(len) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let code = ''
  for (let i = 0; i < len; i++) code += chars.charAt(Math.floor(Math.random() * chars.length))
  return code
}
