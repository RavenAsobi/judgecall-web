// routes/grants.js — 权限密码管理
// 对齐前端 web/src/api.js：
//   GET   /api/grants           -> Grant[]
//   POST  /api/grants           { note, durationDays } -> Grant
//   PATCH /api/grants/:code     { note? } 或 { expiry }（取消激活传昨天日期）
const express = require('express')
const {
  grantStmts, grantNum, grantActive, purgeExpiredGrants,
  daysFromNow, localDateStr, tStmts, rowToTournament,
} = require('../db')
const { attachAuth, requireCanGrant, requireSuper } = require('../auth')

const router = express.Router()

function randomCode(len) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let s = ''
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s
}

function grantView(g) {
  return {
    code: g.code, num: g.num, level: g.level, note: g.note,
    expiry: g.expiry, active: grantActive(g), by: g.by, fromCode: g.fromCode,
  }
}

// GET /api/grants — super 看全部（canGrant 只含 super，putong 403）
router.get('/', attachAuth, requireCanGrant, (req, res) => {
  purgeExpiredGrants()
  const all = grantStmts.all.all()
  const list = req.auth.role === 'super'
    ? all
    : all.filter(g => g.by === req.auth.username)
  res.json(list.map(grantView))
})

// POST /api/grants — 发放普通权限密码（仅 super）
// body: { note?, durationDays? }，durationDays 任意（默认 7）
router.post('/', attachAuth, requireCanGrant, (req, res) => {
  const b = req.body || {}
  const note = String(b.note || '').trim() || '未备注'

  const days = parseInt(b.durationDays) || 7
  if (days < 1 || days > 3650) return res.status(400).json({ error: '有效期天数不合法' })

  const code = randomCode(6)
  const g = {
    code,
    num: grantNum(2),
    level: 2,
    note,
    expiry: daysFromNow(days),
    by: req.auth.username,
    fromCode: null, // 只有 super 发密码，恒为 null
  }
  grantStmts.insert.run(g.code, g.num, g.level, g.note, g.expiry, g.by, g.fromCode)

  res.status(201).json(grantView({ ...g, active: 1 }))
})

// GET /api/grants/event-codes — 所有单场权限密码（super）
// 注意：必须放在 /:code 之前注册，否则会被 :code 匹配
router.get('/event-codes', attachAuth, requireSuper, (req, res) => {
  const list = tStmts.all.all().map(rowToTournament).filter(t => t.eventCode)
  res.json(list.map(t => ({
    tournamentId: t.id, name: t.name, game: t.game, date: t.date,
    eventCode: t.eventCode, eventNum: t.eventNum,
  })))
})

// PATCH /api/grants/:code — 改备注 {note} 或取消激活 {expiry: 昨天}
// 只有 super 能访问（canGrant 只含 super）
router.patch('/:code', attachAuth, requireCanGrant, (req, res) => {
  const g = grantStmts.byCode.get(String(req.params.code).toLowerCase())
  if (!g) return res.status(404).json({ error: '密码不存在' })

  const b = req.body || {}
  if (b.note !== undefined) {
    grantStmts.updateNote.run(String(b.note).trim(), g.code)
    g.note = String(b.note).trim()
  }
  if (b.expiry !== undefined) {
    // 取消激活 = 有效期立即归零
    grantStmts.updateExpiry.run(String(b.expiry), g.code)
    g.expiry = String(b.expiry)
  }
  res.json(grantView(g))
})

module.exports = router
