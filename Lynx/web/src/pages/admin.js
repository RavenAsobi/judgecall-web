// ==================== 界面2：管理后台 ====================
import * as api from '../api.js'
import {
  tournaments, grants, setGrants,
  selectedGame, setSelectedGame,
  selectedDuration, setSelectedDuration,
  ROLE_MAP, ROLE_CLS,
  getRole, canGrant, grantActive, grantExpiryLabel, grantPurgeDate, localDateStr,
} from '../state.js'
import { goTo } from '../nav.js'
import { FAB_FORMATS, fabRoundMinutes } from '../fab-formats.js'

export function switchAdminTab(tab) {
  document.getElementById('atab-create').classList.toggle('active', tab === 'create')
  document.getElementById('atab-grant').classList.toggle('active', tab === 'grant')
  document.getElementById('atab-passwords').classList.toggle('active', tab === 'passwords')
  document.getElementById('admin-create').classList.toggle('hidden', tab !== 'create')
  document.getElementById('admin-grant').classList.toggle('hidden', tab !== 'grant')
  document.getElementById('admin-passwords').classList.toggle('hidden', tab !== 'passwords')
  if (tab === 'grant') renderGrants()
  if (tab === 'passwords') renderPasswordManager()
}

/** 从服务器拉取最新权限密码列表（同步层改动②） */
export async function refreshGrants() {
  try { setGrants(await api.grants.list() || []) } catch {}
}

// ---------- 密码管理（仅原初权限用户） ----------
export function renderPasswordManager() {
  // 同步层改动②：过期清理由后端自动执行（启动时 + 每次列出 grants 时）
  renderPwList(2, 'pw-list-2')
  renderEventPwList()
}

function renderPwList(level, elId) {
  const list = grants.filter(g => g.level === level)
  const el = document.getElementById(elId)
  if (!list.length) {
    el.innerHTML = '<p class="text-sm text-gray-4" style="text-align:center;padding:12px 0">暂无</p>'
    return
  }
  el.innerHTML = list.map(g => {
    const active = grantActive(g)
    return `<div class="grant-item">
      <div class="flex items-center gap-3" style="flex-wrap:wrap">
        <span class="badge badge-amber">${g.num || ''}</span>
        <code>${g.code}</code>
        <span class="text-gray">${g.note || '未备注'}</span>
        <button class="pw-note-btn" onclick="editGrantNote('${g.code}')">备注</button>
      </div>
      <div class="flex items-center gap-3">
        <span class="text-xs text-gray-4">有效期：${grantExpiryLabel(g)}</span>
        ${active
          ? `<span class="badge badge-green">生效中</span>
             <button class="pw-cancel-btn" onclick="deactivateGrant('${g.code}')">取消激活</button>`
          : `<span class="badge badge-gray">已过期 · ${grantPurgeDate(g)} 删除</span>`}
      </div>
    </div>`
  }).join('')
}

function renderEventPwList() {
  const list = tournaments.filter(t => t.eventCode)
  const el = document.getElementById('pw-list-event')
  if (!list.length) {
    el.innerHTML = '<p class="text-sm text-gray-4" style="text-align:center;padding:12px 0">暂无</p>'
    return
  }
  el.innerHTML = list.map(t => `
    <div class="grant-item">
      <div class="flex items-center gap-3" style="flex-wrap:wrap">
        <span class="badge badge-rose">${t.eventNum || ''}</span>
        <code>${t.eventCode}</code>
        <span class="badge ${t.game === 'MTG' ? 'badge-blue' : 'badge-rose'}">${t.game}</span>
        <span class="text-gray">${t.name}</span>
      </div>
      <div class="flex items-center gap-3">
        <span class="text-xs text-gray-4">比赛时间 ${t.date}</span>
      </div>
    </div>`).join('')
}

export async function editGrantNote(code) {
  const g = grants.find(x => x.code === code)
  if (!g) return
  const note = prompt('编辑备注', g.note || '')
  if (note === null) return
  // 同步层改动②：PATCH /api/grants/:code
  try { await api.grants.update(code, { note: note.trim() }) } catch {}
  await refreshGrants()
  renderPasswordManager()
}

/** 取消激活：有效期立即归零（原初权限用户） */
export async function deactivateGrant(code) {
  const g = grants.find(x => x.code === code)
  if (!g) return
  if (!confirm(`确定取消密码 ${g.num || ''}（${code}）的激活状态吗？有效期将立即归零。`)) return
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  // 同步层改动②：PATCH /api/grants/:code 传 expiry=昨天
  try { await api.grants.update(code, { expiry: localDateStr(yesterday) }) } catch {}
  await refreshGrants()
  renderPasswordManager()
}

export function updateAdminInfo() {
  const name = sessionStorage.getItem('adminName') || '管理员'
  const role = getRole()
  document.getElementById('admin-display-name').textContent = name
  const badge = document.getElementById('admin-role-badge')
  badge.textContent = ROLE_MAP[role]
  badge.className = 'badge ml-2 ' + ROLE_CLS[role]

  const permDesc = document.getElementById('perm-desc')
  if (role === 'super') {
    permDesc.textContent = '拥有全部权限：创建/删除所有比赛，发放任意有效期的权限密码'
  } else if (role === 'putong') {
    permDesc.textContent = '可创建比赛，不能删除已开始的比赛，不能发放权限密码'
  } else {
    permDesc.textContent = '可创建比赛，不能删除任何比赛，不能发放权限密码'
  }

  document.getElementById('atab-grant').classList.toggle('hidden', !canGrant())
  document.getElementById('atab-passwords').classList.toggle('hidden', role !== 'super')
  if (!canGrant() && role !== 'super') switchAdminTab('create')

  const durationSection = document.getElementById('duration-section')
  const grantDesc = document.getElementById('grant-desc')
  durationSection.classList.remove('hidden')
  grantDesc.textContent = '生成普通权限密码，使用者将成为普通权限用户'
}

let createFabFormat = 'Classic Constructed'
let createMtgFormat = ''

function syncCreateFormatControl(game) {
  const control = document.getElementById('t-format')
  if (!control || !control.hasAttribute('data-beta-format')) {
    if (control) control.placeholder = game === 'FAB' ? '例如：CC / SA' : '例如：T2 / 摩登'
    return
  }

  const isFab = game === 'FAB'
  let next = control
  if (isFab && control.tagName !== 'SELECT') {
    next = document.createElement('select')
    next.innerHTML = FAB_FORMATS.map(format => `<option>${format}</option>`).join('')
    next.addEventListener('change', () => selectFabFormat(next.value))
    control.replaceWith(next)
  } else if (!isFab && control.tagName !== 'INPUT') {
    next = document.createElement('input')
    next.placeholder = '例如：T2 / 摩登'
    next.addEventListener('input', () => { createMtgFormat = next.value })
    control.replaceWith(next)
  }

  next.id = 't-format'
  next.className = 'input-field'
  next.setAttribute('data-beta-format', '')
  next.value = isFab ? createFabFormat : createMtgFormat

  const hint = document.getElementById('t-format-timer-hint')
  if (hint) {
    hint.classList.toggle('hidden', !isFab)
    if (isFab) hint.textContent = `每轮计时将自动设置为 ${fabRoundMinutes(next.value)} 分钟`
  }
}

export function selectFabFormat(format) {
  createFabFormat = FAB_FORMATS.includes(format) ? format : 'Other'
  const hint = document.getElementById('t-format-timer-hint')
  if (hint) hint.textContent = `每轮计时将自动设置为 ${fabRoundMinutes(createFabFormat)} 分钟`
}

export function selectGame(game) {
  const control = document.getElementById('t-format')
  if (control && control.hasAttribute('data-beta-format')) {
    if (selectedGame === 'FAB') createFabFormat = control.value || createFabFormat
    else createMtgFormat = control.value
  }
  setSelectedGame(game)
  document.getElementById('game-fab').className = game === 'FAB' ? 'active-fab' : ''
  document.getElementById('game-mtg').className = game === 'MTG' ? 'active-mtg' : ''
  syncCreateFormatControl(game)
}

export function selectDuration(btn, val) {
  document.querySelectorAll('#duration-btns button').forEach(b => b.classList.remove('active'))
  btn.classList.add('active')
  setSelectedDuration(val)
}

export async function createTournament() {
  const name = document.getElementById('t-name').value.trim()
  const pass = document.getElementById('t-pass').value.trim()
  const date = document.getElementById('t-date').value
  const format = document.getElementById('t-format').value.trim()
  const maxTables = parseInt(document.getElementById('t-max-tables').value) || null
  const startTable = parseInt(document.getElementById('t-start-table').value) || 1
  const withEventCode = document.getElementById('t-event-code').checked
  const btn = document.getElementById('create-btn')
  const errEl = document.getElementById('create-error')

  // 重名检查：赛事列表（服务器）中已有同名比赛则不能创建
  if (tournaments.some(t => t.name === name)) {
    errEl.textContent = '已有同名比赛，不能创建'
    errEl.classList.remove('hidden')
    return
  }
  errEl.classList.add('hidden')

  btn.disabled = true
  btn.textContent = '创建中...'

  try {
    // 同步层改动②：POST /api/tournaments（编号分配 eventNum 在服务端完成）
    const tournament = await api.tournaments.create({
      name, game: selectedGame,
      date: date ? date.split('T')[0] : '待定',
      format: format || '未指定',
      password: pass,
      maxTables,
      startTable,
      withEventCode,
      roundMinutes: selectedGame === 'FAB' ? fabRoundMinutes(format) : undefined,
    })
    tournaments.unshift(tournament)

    alert('比赛「' + name + '」创建成功！' + (tournament.eventCode ? `\n比赛权限密码：${tournament.eventCode}` : ''))
    document.getElementById('t-name').value = ''
    document.getElementById('t-pass').value = ''
    document.getElementById('t-date').value = ''
    const formatControl = document.getElementById('t-format')
    if (formatControl.tagName === 'SELECT') {
      createFabFormat = 'Classic Constructed'
      formatControl.value = createFabFormat
      selectFabFormat(createFabFormat)
    } else {
      createMtgFormat = ''
      formatControl.value = ''
    }
    document.getElementById('t-max-tables').value = ''
    document.getElementById('t-start-table').value = ''
    document.getElementById('t-event-code').checked = false
    goTo('page-tournaments')
  } catch (e) {
    errEl.textContent = (e && e.message) || '创建失败'
    errEl.classList.remove('hidden')
  } finally {
    btn.disabled = false
    btn.textContent = '创建比赛'
  }
}

export async function generateGrant() {
  const note = document.getElementById('g-note').value.trim()
  const btn = document.getElementById('grant-btn')

  btn.disabled = true
  btn.textContent = '生成中...'

  try {
    // 同步层改动②：POST /api/grants（编号分配 grantNum 在服务端完成）
    const g = await api.grants.create({ note: note || '未备注', durationDays: selectedDuration })
    await refreshGrants()

    document.getElementById('grant-result').classList.remove('hidden')
    document.getElementById('grant-code').textContent = g.code
    document.getElementById('grant-expiry').textContent = grantExpiryLabel(g)
    document.getElementById('g-note').value = ''

    renderGrants()
  } finally {
    btn.disabled = false
    btn.textContent = '生成权限密码'
  }
}

export function renderGrants() {
  const myName = sessionStorage.getItem('adminName') || 'admin'
  const myGrants = getRole() === 'super' ? grants : grants.filter(g => g.by === myName)
  const el = document.getElementById('grant-list')
  if (myGrants.length === 0) {
    el.innerHTML = '<p class="text-sm text-gray-4" style="text-align:center;padding:16px 0">暂无发放记录</p>'
    return
  }
  el.innerHTML = myGrants.map(g => `
    <div class="grant-item">
      <div class="flex items-center gap-3">
        <span class="badge badge-amber">${g.num || '普通'}</span>
        <code>${g.code}</code>
        <span class="text-gray">${g.note}</span>
      </div>
      <div class="flex items-center gap-3">
        <span class="text-xs text-gray-4">${grantExpiryLabel(g)}</span>
        <span class="badge ${grantActive(g) ? 'badge-green' : 'badge-gray'}">${grantActive(g) ? '生效中' : '已过期'}</span>
      </div>
    </div>
  `).join('')
}

export function copyGrantCode() {
  const code = document.getElementById('grant-code').textContent
  navigator.clipboard.writeText(code).then(() => alert('已复制：' + code))
}
