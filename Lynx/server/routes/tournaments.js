// routes/tournaments.js — 比赛 CRUD
// 对齐前端 web/src/api.js：
//   GET    /api/tournaments
//   POST   /api/tournaments
//   GET    /api/tournaments/:id   （含 tables/timer 快照）
//   PATCH  /api/tournaments/:id
//   DELETE /api/tournaments/:id
const express = require('express')
const {
  tStmts, rowToTournament, nextEventNum,
  getTables, saveTables, getTimer,
  touchAccess, touchOp, clearUserCacheForTournament,
  getReportHistory,
} = require('../db')
const {
  attachAuth, requirePrivileged, requireEventPriv,
  canDeleteTournament, isEventPriv,
} = require('../auth')
const { initialRoundMinutes } = require('../fab-formats')

const router = express.Router()

function randomCode(len) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let s = ''
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s
}

/** 比赛 + 桌子 + 计时器 完整快照 */
function fullTournament(t) {
  return { ...t, tables: getTables(t.id), timer: getTimer(t.id) }
}

// GET /api/tournaments/:id/reports — 该场全部回报历史（历史弹窗用；仅本场有管理权者）
// 注意：要放在 GET /:id 之前注册，避免被详情路由吃掉
router.get('/:id/reports', attachAuth, requireEventPriv, (req, res) => {
  const tid = Number(req.params.id)
  if (!tStmts.byId.get(tid)) return res.status(404).json({ error: '比赛不存在' })
  res.json(getReportHistory(tid))
})

// GET /api/tournaments — 列表
router.get('/', attachAuth, (req, res) => {
  const list = tStmts.all.all().map(rowToTournament)
  const priv = isEventPriv(req.auth.role)
  // 游客不返回敏感字段
  const safe = list.map(t => ({
    ...t,
    password: priv ? t.password : undefined,
    eventCode: priv ? t.eventCode : undefined,
  }))
  res.json(safe)
})

// GET /api/tournaments/:id — 详情（含 tables/timer）
router.get('/:id', attachAuth, (req, res) => {
  const t = rowToTournament(tStmts.byId.get(Number(req.params.id)))
  if (!t) return res.status(404).json({ error: '比赛不存在' })
  touchAccess(t.id) // 规则 2：查看详情 = 访问
  const full = fullTournament(t)
  if (!isEventPriv(req.auth.role)) {
    full.password = undefined
    full.eventCode = undefined
  }
  res.json(full)
})

// POST /api/tournaments — 创建（权限用户）
// body: { name, game, date, format, password, maxTables?, startTable?, withEventCode?, roundMinutes? }
router.post('/', attachAuth, requirePrivileged, (req, res) => {
  const b = req.body || {}
  const name = String(b.name || '').trim()
  const password = String(b.password || '').trim()
  if (!name) return res.status(400).json({ error: '比赛名称不能为空' })
  if (!password) return res.status(400).json({ error: '进入密码不能为空' })
  if (tStmts.byName.get(name)) return res.status(409).json({ error: '已有同名比赛，不能创建' })

  const id = Date.now()
  const withEventCode = !!(b.withEventCode || b.eventCode)
  const t = {
    id,
    name,
    date: b.date ? String(b.date).split('T')[0] : '待定',
    game: b.game === 'MTG' ? 'MTG' : 'FAB',
    format: String(b.format || '').trim() || '未指定',
    status: 'upcoming',
    password,
    players: 0,
    maxTables: b.maxTables ? Math.max(1, Math.min(999, parseInt(b.maxTables))) : null,
    startTable: parseInt(b.startTable) || 1,
    roundNumber: 1,
    eventCode: withEventCode ? randomCode(6) : null,
    eventNum: withEventCode ? nextEventNum() : null,
    tableReversed: !!b.tableReversed,
    layoutCode: null,
    layoutRows: null,
    manualOnly: false,
  }

  tStmts.insert.run(
    t.id, t.name, t.date, t.game, t.format, t.status, t.password, t.players,
    t.maxTables, t.startTable, t.roundNumber, t.eventCode, t.eventNum,
    t.tableReversed ? 1 : 0, t.layoutCode, t.layoutRows, 0
  )

  // 初始化桌子
  const count = t.maxTables || 8
  const tables = []
  for (let i = 0; i < count; i++) {
    tables.push({
      number: t.tableReversed ? t.startTable - i : t.startTable + i,
      color: 'white', p1: '', p2: '', result: null,
      timeExt: 0, watchedBy: null, drop1: false, drop2: false,
    })
  }
  saveTables(id, tables)
  // Beta FAB 赛制自动轮计时：SA/Sealed/Draft 35 分钟，其余 FAB 55 分钟；MTG 保持原默认 50 分钟。
  getTimer(id, initialRoundMinutes(t.game, t.format))

  if (req.app.locals.broadcastLobby) req.app.locals.broadcastLobby()

  res.status(201).json(fullTournament(rowToTournament(tStmts.byId.get(id))))
})

// PATCH /api/tournaments/:id — 更新设置（比赛权限，部分字段）
router.patch('/:id', attachAuth, requireEventPriv, (req, res) => {
  const tid = Number(req.params.id)
  const old = rowToTournament(tStmts.byId.get(tid))
  if (!old) return res.status(404).json({ error: '比赛不存在' })

  const b = req.body || {}
  const name = b.name != null ? String(b.name).trim() : old.name
  const password = b.password != null ? String(b.password).trim() : old.password
  if (!name || !password) return res.status(400).json({ error: '比赛名称和进入密码不能为空' })
  const dup = tStmts.byName.get(name)
  if (dup && dup.id !== tid) return res.status(409).json({ error: '已有同名比赛' })

  // 特定权限密码：withEventCode/eventCode 语义
  let eventCode = old.eventCode, eventNum = old.eventNum
  const wantCode = b.withEventCode !== undefined ? !!b.withEventCode
    : b.eventCode !== undefined ? !!b.eventCode : undefined
  if (wantCode === true && !old.eventCode) {
    eventCode = randomCode(6)
    eventNum = nextEventNum()
  } else if (wantCode === false) {
    eventCode = null
    eventNum = null
  }

  const merged = {
    ...old,
    name, password,
    date: b.date != null ? String(b.date).split('T')[0] : old.date,
    game: b.game != null ? (b.game === 'MTG' ? 'MTG' : 'FAB') : old.game,
    format: b.format != null ? (String(b.format).trim() || '未指定') : old.format,
    status: b.status != null && ['upcoming', 'ongoing', 'completed'].includes(b.status) ? b.status : old.status,
    players: b.players != null ? parseInt(b.players) || 0 : old.players,
    maxTables: b.maxTables != null ? Math.max(1, Math.min(999, parseInt(b.maxTables) || 1)) : old.maxTables,
    startTable: b.startTable != null ? parseInt(b.startTable) || 1 : old.startTable,
    roundNumber: b.roundNumber != null ? Math.max(1, parseInt(b.roundNumber) || 1) : old.roundNumber,
    tableReversed: b.tableReversed != null ? !!b.tableReversed : old.tableReversed,
    layoutCode: b.layoutCode !== undefined ? b.layoutCode : old.layoutCode,
    layoutRows: b.layoutRows !== undefined ? b.layoutRows : old.layoutRows,
    manualOnly: b.manualOnly !== undefined ? !!b.manualOnly : old.manualOnly,
    eventCode, eventNum,
  }

  tStmts.update.run(
    merged.name, merged.date, merged.game, merged.format, merged.status, merged.password,
    merged.players, merged.maxTables, merged.startTable, merged.roundNumber,
    merged.eventCode, merged.eventNum, merged.tableReversed ? 1 : 0,
    merged.layoutCode, merged.layoutRows ? JSON.stringify(merged.layoutRows) : null,
    merged.manualOnly ? 1 : 0,
    tid
  )
  if (merged.roundNumber !== old.roundNumber) tStmts.clearImportedRound.run(tid)

  const updated = rowToTournament(tStmts.byId.get(tid))
  touchOp(tid) // 规则 2：改设置 = 操作
  // 规则 4：进入密码被修改 → 清空该场所有免密缓存，之前免密进的人需重新输新密码
  if (password !== old.password) {
    const cleared = clearUserCacheForTournament(tid)
    if (cleared) console.log(`[规则4] 比赛 ${tid} 密码已改，清空 ${cleared} 条免密缓存`)
  }
  if (req.app.locals.broadcastRoom) {
    req.app.locals.broadcastRoom(tid, { type: 'tournament', tournament: updated })
  }
  if (req.app.locals.broadcastLobby) req.app.locals.broadcastLobby()

  res.json(fullTournament(updated))
})

// DELETE /api/tournaments/:id — 删除（super 任意；putong 非进行中）
router.delete('/:id', attachAuth, requirePrivileged, (req, res) => {
  const tid = Number(req.params.id)
  const t = rowToTournament(tStmts.byId.get(tid))
  if (!t) return res.status(404).json({ error: '比赛不存在' })
  if (!canDeleteTournament(req.auth.role, t)) {
    return res.status(403).json({ error: '当前角色不能删除该比赛' })
  }
  tStmts.delete.run(tid)
  if (req.app.locals.broadcastRoom) {
    req.app.locals.broadcastRoom(tid, { type: 'deleted', tournamentId: tid })
  }
  if (req.app.locals.broadcastLobby) req.app.locals.broadcastLobby()
  res.json({ ok: true })
})

module.exports = router
