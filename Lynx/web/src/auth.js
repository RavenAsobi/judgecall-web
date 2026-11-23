// ==================== 登录态持久化（规则 5） ====================
// 用户名 3 天免输 + 记住权限密码 + 记住上次停留页面 + 3 天滑动续期。
// 存 localStorage（关浏览器不丢），key = 'lynxAuth'。
// 过期 / 密码失效 / 点右上角退出 → 清除，回登录页。

const KEY = 'lynxAuth'
const THREE_DAYS_MS = 3 * 24 * 3600 * 1000

/** 读取并校验登录态；每次读取都把有效期滑动续到 3 天后（每次进入刷新到 3 天） */
export function getAuth() {
  let a = null
  try { a = JSON.parse(localStorage.getItem(KEY)) } catch { a = null }
  if (!a || !a.name) return null
  if (a.credential && !a.token) { clearAuth(); return null } // migrate away from stored plaintext credentials
  if (!a.expiresAt || a.expiresAt < Date.now()) { clearAuth(); return null } // 已过期
  // 滑动续期：每次进入刷新到 3 天
  a.expiresAt = Date.now() + THREE_DAYS_MS
  try { localStorage.setItem(KEY, JSON.stringify(a)) } catch {}
  return a
}

/** 写入/更新登录态（登录成功时调用；3 天有效期） */
export function setAuth(patch) {
  const cur = getAuth() || {}
  const next = { ...cur, ...patch, expiresAt: Date.now() + THREE_DAYS_MS }
  try { localStorage.setItem(KEY, JSON.stringify(next)) } catch {}
  return next
}

/** 仅更新上次停留页面，不动其它字段；未登录则不写 */
export function setLastPage(lastPage) {
  let a = null
  try { a = JSON.parse(localStorage.getItem(KEY)) } catch { a = null }
  if (!a || !a.name) return
  a.lastPage = lastPage
  try { localStorage.setItem(KEY, JSON.stringify(a)) } catch {}
}

/** 清除登录态（退出 / 过期 / 密码失效） */
export function clearAuth() {
  try { localStorage.removeItem(KEY) } catch {}
}

/** 当前是否已登录（未过期） */
export function isLoggedIn() { return !!getAuth() }
