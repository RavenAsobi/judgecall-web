// ==================== REST API 封装 ====================
// 后端基础路径：开发环境走 vite proxy（/api -> http://localhost:3000）
// 生产环境由部署层决定，保持同源 /api 即可

const BASE = '/api'

/** 通用请求封装，返回解析后的 JSON；失败时抛错 */
async function request(path, { method = 'GET', body, headers } = {}) {
  const opts = { method, headers: { ...(headers || {}) } }
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json'
    opts.body = JSON.stringify(body)
  }
  // 登录态：把 sessionStorage 里的凭据附带过去（后端用来识别用户角色）
  const sessionToken = sessionStorage.getItem('sessionToken')
  if (sessionToken) opts.headers['X-Session-Token'] = sessionToken
  // 用户名头：权限用户取 adminName，游客取 guestName（my-entries 等接口需要识别游客自己）
  const userName = sessionStorage.getItem('adminName') || sessionStorage.getItem('guestName')
  if (userName) opts.headers['X-User-Name'] = encodeURIComponent(userName)

  const res = await fetch(BASE + path, opts)
  if (!res.ok) {
    let msg = `HTTP ${res.status}`
    try {
      const data = await res.json()
      if (data && data.error) msg = data.error
    } catch {}
    const err = new Error(msg)
    err.status = res.status
    throw err
  }
  if (res.status === 204) return null
  return res.json()
}

// ---------- 认证 ----------
// POST /api/auth/login  { name, password }
//   -> { role: 'super'|'putong'|'event'|'judge', eventTournamentId? }
export function login(name, password) {
  return request('/auth/login', { method: 'POST', body: { name, password } })
}
export function restoreSession() {
  return request('/auth/session')
}
export function logout() {
  return request('/auth/logout', { method: 'POST' })
}

// ---------- 比赛 ----------
// GET    /api/tournaments            -> Tournament[]
// POST   /api/tournaments            -> Tournament
// GET    /api/tournaments/:id        -> Tournament（含 tables/layout/timer 初始快照）
// PATCH  /api/tournaments/:id        -> Tournament
// DELETE /api/tournaments/:id
// POST   /api/tournaments/:id/verify { password } -> { ok, name3days? }
export const tournaments = {
  list: () => request('/tournaments'),
  create: (payload) => request('/tournaments', { method: 'POST', body: payload }),
  get: (id) => request(`/tournaments/${id}`),
  update: (id, patch) => request(`/tournaments/${id}`, { method: 'PATCH', body: patch }),
  remove: (id) => request(`/tournaments/${id}`, { method: 'DELETE' }),
  verify: (id, password, name) =>
    request(`/tournaments/${id}/verify`, { method: 'POST', body: { password, name } }),
}

// ---------- 成绩回报历史 ----------
// GET /api/tournaments/:id/reports -> Report[]（该场全部历史，含已确认/已轮清，新的在前；仅本场有管理权者）
export function getReports(id) {
  return request(`/tournaments/${id}/reports`)
}

// ---------- 权限密码 ----------
// GET    /api/grants            -> Grant[]
// POST   /api/grants            -> Grant    { note, durationDays }
// PATCH  /api/grants/:code      -> Grant    { note?, expiry? }（取消激活传 expiry=昨天）
export const grants = {
  list: () => request('/grants'),
  create: (payload) => request('/grants', { method: 'POST', body: payload }),
  update: (code, patch) => request(`/grants/${encodeURIComponent(code)}`, { method: 'PATCH', body: patch }),
}

// ---------- 顶部保留入口（跟随权限密码） ----------
// GET /api/pins            -> number[]   （当前 credential 的 pins）
// PUT /api/pins            -> number[]   body: number[]
export const pins = {
  list: () => request('/pins'),
  save: (ids) => request('/pins', { method: 'PUT', body: ids }),
}

// ---------- 最近进入记录（前端"最近进入靠前"排序用） ----------
// POST /api/tournaments/:id/enter   记录进入比赛详情（3天续期）
// GET  /api/my-entries              -> [{ tournamentId, expiresAt }]（按 expiresAt 倒序，仅当前用户）
export function recordEnter(id, name) {
  return request(`/tournaments/${id}/enter`, { method: 'POST', body: { name } })
}
export function myEntries() {
  return request('/my-entries')
}
