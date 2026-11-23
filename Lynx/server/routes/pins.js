// routes/pins.js — 顶部保留入口（跟随权限密码）
// 对齐前端 web/src/api.js：
//   GET /api/pins  -> number[]        (pins for the authenticated session)
//   PUT /api/pins  body: number[]     （整体覆盖保存）
const express = require('express')
const { pinStmts } = require('../db')
const { attachAuth, requirePrivileged } = require('../auth')

const router = express.Router()

// GET /api/pins — 返回比赛 id 数组
router.get('/', attachAuth, requirePrivileged, (req, res) => {
  const ids = pinStmts.list.all(req.auth.credential).map(r => r.tournamentId)
  res.json(ids)
})

// PUT /api/pins — body 为 id 数组，整体覆盖
router.put('/', attachAuth, requirePrivileged, (req, res) => {
  const ids = Array.isArray(req.body) ? req.body : []
  pinStmts.removeByCredential.run(req.auth.credential)
  for (const id of ids) {
    const tid = Number(id)
    if (!isNaN(tid)) pinStmts.add.run(req.auth.credential, tid)
  }
  res.json(ids)
})

module.exports = router
