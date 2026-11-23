// routes/auth.js — 登录与进入比赛
// 对齐前端 web/src/api.js：
//   POST /api/auth/login                { name, password } -> { role, eventTournamentId? }
//   POST /api/tournaments/:id/verify    { password, name } -> { ok } （含 3 天免密缓存）
const express = require('express')
const { resolveCredential, issueSession, revokeSession, isEventPriv, eventCanAccess, attachAuth } = require('../auth')
const { checkUserCache, grantUserCache, tStmts, rowToTournament, recordEntry, getMyEntries } = require('../db')

const router = express.Router()

// POST /api/auth/login — 权限用户登录
router.post('/auth/login', (req, res) => {
  const { name, password } = req.body || {}
  if (!name || !String(name).trim()) return res.status(400).json({ error: '用户名不能为空' })
  if (!password) return res.status(400).json({ error: '权限密码不能为空' })

  const resolved = resolveCredential(password)
  if (!resolved) return res.status(401).json({ error: '权限密码无效或已过期' })

  const token = issueSession(String(name).trim(), resolved)
  res.json({
    token,
    role: resolved.role,
    eventTournamentId: resolved.eventTournamentId || null,
  })
})

// POST /api/tournaments/:id/verify — 校验比赛进入密码（含免密缓存）
// body: { password, name }
// - 权限用户（credential 有效且含比赛权限）→ 直接 ok
// - 用户名在 3 天免密缓存内 → ok（cached:true）
// - 密码正确 → 写入 3 天免密，ok
router.post('/tournaments/:id/verify', attachAuth, (req, res) => {
  const tid = Number(req.params.id)
  const t = rowToTournament(tStmts.byId.get(tid))
  if (!t) return res.status(404).json({ error: '比赛不存在' })

  const { password, name } = req.body || {}
  const username = name ? String(name).trim() : ''

  // An authenticated privileged session may enter without the tournament password.
  if (isEventPriv(req.auth.role) && eventCanAccess(req.auth, tid)) {
    return res.json({ ok: true, via: 'session' })
  }

  // 用户名免密缓存（3 天；<24h 刷新至 24h）
  if (username && checkUserCache(username, tid)) {
    return res.json({ ok: true, via: 'cache' })
  }

  // 比赛进入密码
  if (password != null && String(password) === String(t.password)) {
    if (username) grantUserCache(username, tid)
    return res.json({ ok: true, via: 'password' })
  }

  return res.status(401).json({ error: '密码错误' })
})

// POST /api/tournaments/:id/enter — 记录"进入比赛详情页"（任何身份）
// 用于前端"最近进入靠前"排序；3 天免密/进入记录，每次进入续期到 3 天
router.get('/auth/session', attachAuth, (req, res) => {
  if (req.auth.role === 'judge') return res.status(401).json({ error: 'Login required' })
  res.json({ role: req.auth.role, eventTournamentId: req.auth.eventTournamentId || null })
})

router.post('/auth/logout', attachAuth, (req, res) => {
  revokeSession(req.sessionToken)
  res.status(204).end()
})

router.post('/tournaments/:id/enter', attachAuth, (req, res) => {
  const tid = Number(req.params.id)
  const username = req.auth.username || String((req.body || {}).name || '').trim()
  if (username) recordEntry(username, tid)
  res.json({ ok: true })
})

// GET /api/my-entries — 当前用户未过期的进入记录（按 expiresAt 倒序），仅供前端排序自己的列表
router.get('/my-entries', attachAuth, (req, res) => {
  res.json(getMyEntries(req.auth.username))
})

module.exports = router
