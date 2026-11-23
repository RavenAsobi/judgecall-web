// ==================== 界面1：登录 ====================
import * as api from '../api.js'
import { tournaments } from '../state.js'
import { goTo } from '../nav.js'
import { showTournamentDetail } from './detail.js'
import { setAuth } from '../auth.js'

export function switchTab(mode) {
  document.getElementById('tab-guest').classList.toggle('active', mode === 'guest')
  document.getElementById('tab-admin').classList.toggle('active', mode === 'admin')
  document.getElementById('form-guest').classList.toggle('hidden', mode !== 'guest')
  document.getElementById('form-admin').classList.toggle('hidden', mode !== 'admin')
}

export function guestLogin() {
  const name = document.getElementById('guest-name').value.trim()
  if (!name) return
  sessionStorage.setItem('guestName', name)
  sessionStorage.setItem('userRole', 'judge')
  // 规则 5：记住用户名 3 天
  setAuth({ name, role: 'judge', token: '', eventTournamentId: null })
  goTo('page-tournaments')
}

export async function adminLogin() {
  const name = document.getElementById('admin-name').value.trim()
  const pass = document.getElementById('admin-pass').value.trim()
  const errEl = document.getElementById('login-error')
  const btn = document.getElementById('admin-login-btn')

  btn.disabled = true
  btn.textContent = '验证中...'
  errEl.classList.add('hidden')
  errEl.textContent = '密码无效或已过期'

  try {
    // 同步层改动②：登录验证走 POST /api/auth/login
    const res = await api.login(name, pass)
    const role = res && res.role
    const token = res && res.token
    const eventTournamentId = res && res.eventTournamentId

    if (role && token) {
      sessionStorage.setItem('adminName', name)
      sessionStorage.setItem('userRole', role)
      sessionStorage.setItem('sessionToken', token)
      // Store only the opaque server session; never persist the permission password.
      setAuth({ name, role, token, eventTournamentId: eventTournamentId || null })
      if (eventTournamentId) {
        sessionStorage.setItem('eventTournamentId', String(eventTournamentId))
        // 比赛权限用户直接进入对应比赛
        const t = tournaments.find(t => t.id === eventTournamentId)
        if (t) { showTournamentDetail(t); return }
      }
      goTo('page-admin')
    } else {
      errEl.classList.remove('hidden')
    }
  } catch (error) {
    if (location.protocol === 'file:') {
      errEl.textContent = '直接打开 HTML 无法连接权限数据库。请双击项目根目录的“启动Lynx-Beta.cmd”，再从 http://127.0.0.1:3000/ 登录。'
    } else if (error && error.status === 401) {
      errEl.textContent = error.message || '密码无效或已过期'
    } else if (error && error.status === 429) {
      errEl.textContent = '登录尝试次数过多，请稍后再试'
    } else {
      errEl.textContent = '无法连接 Lynx 服务器，请确认服务已启动后重试'
    }
    errEl.classList.remove('hidden')
  } finally {
    btn.disabled = false
    btn.textContent = '登录管理后台'
  }
}
