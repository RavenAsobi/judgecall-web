// ws.js — WebSocket 实时同步
// 挂在 HTTP 服务同端口 /ws 路径。一个比赛一个房间。
// 协议（与前端 web/src/ws.js 对齐，JSON 文本帧）：
//   客户端 -> 服务器：
//     { type:'join', tournamentId, name, token }
//     { type:'leave' }
//     { type:'table:update', opId, baseRevision, table } // 单桌更新
//     { type:'tables:patch', opId, patch }   // 管理权限批量替换 + 版本
//     { type:'round:start', opId, mode, stateRevision, tables? }
//     { type:'timer:cmd', cmd }             // {action:'start'|'pause'|'reset'|'set', minutes?}
//     { type:'report', tableNo, kind, body } // 成绩/Drop 回报（任何身份；kind:'score'|'drop'）
//     { type:'report:ack', id }             // 确认一条（仅权限用户，只影响自己消息框）
//     { type:'report:clear' }               // 清除所有（仅权限用户，只影响自己消息框）
//     { type:'report:roundclear' }          // 导入新一轮清场（仅权限用户，全场生效）
//   服务器 -> 客户端：
//     { type:'snapshot', tables, timer, tournament }
//     { type:'table:ack'|'table:updated', table, stateRevision, opId? }
//     { type:'tables:ack'|'round:ack'|'tables', data, opId? }
//     { type:'operation:rejected', opId, message, data }
//     { type:'timer', state }               // {configured, remaining, running, updatedAt}
//     { type:'tournament', tournament }
//     { type:'deleted', tournamentId }
//     { type:'reports', list }              // 消息框全量（join 后及任何回报变化时推给各管理权连接）
//     { type:'reports:roundclear' }         // 新一轮清场：所有人清空消息框
//     { type:'error', message }
const { WebSocketServer } = require('ws')
const config = require('./config')
const { resolveSession, isEventPriv, eventCanAccess } = require('./auth')
const {
  db, tStmts, rowToTournament, getTables, getTable, saveTable, saveTables, getTimer, saveTimer,
  touchAccess, touchOp,
  addReport, getReportFeed, ackReport, ackAllReports, roundClearReports,
  playerKey, judgeStmts, getJudgeState,
  roundStmts,
} = require('./db')
const { normalizePolicy, settleTables, cumulativeStandings } = require('./round-settlement')

const SUGGESTED_POLICY = Object.freeze({ win: 3, draw: 1, loss: 0, bye: 3, doubleLoss: 0 })

/** rooms: Map<tournamentId, Set<ws>> */
const rooms = new Map()
/** lobby: 未进房间的连接（接收比赛列表变更通知） */
const lobby = new Set()

function send(ws, obj) {
  if (ws.readyState === 1) ws.send(JSON.stringify(obj))
}

function broadcastRoom(tournamentId, obj, except) {
  const set = rooms.get(Number(tournamentId))
  if (!set) return
  const msg = JSON.stringify(obj)
  for (const ws of set) {
    if (ws !== except && ws.readyState === 1) ws.send(msg)
  }
}

function broadcastLobby(obj) {
  const msg = JSON.stringify(obj || { type: 'lobby' })
  for (const ws of lobby) {
    if (ws.readyState === 1) ws.send(msg)
  }
}

function joinRoom(ws, tid) {
  tid = Number(tid)
  if (!rooms.has(tid)) rooms.set(tid, new Set())
  rooms.get(tid).add(ws)
  ws.roomId = tid
}

function leaveRoom(ws) {
  if (ws.roomId != null && rooms.has(ws.roomId)) {
    rooms.get(ws.roomId).delete(ws)
    if (rooms.get(ws.roomId).size === 0) rooms.delete(ws.roomId)
  }
  ws.roomId = null
}

/** 服务器权威剩余秒数（可为负：归零后进入正计时，负值表示超时） */
function currentRemaining(timer) {
  if (!timer.running) return timer.remaining
  const elapsed = Math.floor((Date.now() - timer.updatedAt) / 1000)
  return timer.remaining - elapsed
}

/** 组装 tables 广播数据（与前端 applySyncData 对齐） */
function tablesPayload(tid) {
  const t = rowToTournament(tStmts.byId.get(tid))
  return {
    tables: getTables(tid),
    layoutCode: t ? t.layoutCode : null,
    layoutRows: t ? t.layoutRows : null,
    maxTables: t ? t.maxTables : null,
    startTable: t ? t.startTable : 1,
    tableReversed: t ? t.tableReversed : false,
    roundNumber: t ? (t.roundNumber || 1) : 1,
    lastImportRound: t ? t.lastImportRound : 0,
    stateRevision: t ? t.stateRevision : 0,
    scoringPolicy: t ? t.scoringPolicy : null,
  }
}

function rejectOperation(ws, tid, opId, message) {
  send(ws, { type: 'operation:rejected', opId, message, data: tablesPayload(tid), timer: getTimer(tid) })
}

function validTableList(list) {
  return Array.isArray(list) && list.length >= 1 && list.length <= 999 &&
    list.every(t => Number.isInteger(t.number) && t.number >= 1 && t.number <= 9999) &&
    new Set(list.map(t => t.number)).size === list.length
}

function nextTableState(old, incoming, manager) {
  const resultChanged = incoming.result !== undefined && JSON.stringify(incoming.result) !== JSON.stringify(old.result)
  const next = {
    ...old,
    color: ['white', 'red', 'yellow', 'green', 'black'].includes(incoming.color) ? incoming.color : old.color,
    p1: String(incoming.p1 ?? old.p1).slice(0, 120),
    p2: String(incoming.p2 ?? old.p2).slice(0, 120),
    result: incoming.result === undefined ? old.result : incoming.result,
    outcomeType: incoming.outcomeType === undefined ? (resultChanged ? null : old.outcomeType) :
      ['BYE', 'LOSSALL', 'GHOST', '1WIN', '2WIN', 'DRAW'].includes(incoming.outcomeType) ? incoming.outcomeType : null,
    timeExt: Math.max(0, Math.min(999, Number(incoming.timeExt) || 0)),
    watchedBy: incoming.watchedBy ? String(incoming.watchedBy).slice(0, 120) : null,
    drop1: !!incoming.drop1,
    drop2: !!incoming.drop2,
    greenManual: !!incoming.greenManual,
    greenAt: incoming.greenAt == null ? null : Number(incoming.greenAt),
    focus: manager ? !!incoming.focus : old.focus,
    revision: old.revision + 1,
  }
  if (resultChanged ||
      (next.result != null && incoming.resultSource !== old.resultSource)) {
    next.resultSource = next.result == null ? null : (manager ? 'manager' : 'judge')
  }
  if (next.outcomeType === 'LOSSALL') next.resultSource = manager ? 'manager' : 'judge'
  if (next.color === 'black') {
    next.drop1 = true
    next.drop2 = true
    next.result = null
    next.resultSource = null
    next.greenManual = false
    next.greenAt = null
    next.outcomeType = 'GHOST'
  }
  return next
}

/** 是否对本场有管理权（super/putong 任意场；event 仅自己场）——回报面板可见性 = 此判定 */
function canManageRoom(auth, tid) {
  return isEventPriv(auth.role) && eventCanAccess(auth, tid)
}

function roundPreviewData(tid, tournament) {
  const policy = tournament.scoringPolicy || SUGGESTED_POLICY
  const calculated = settleTables(getTables(tid), policy)
  const previous = tournament.roundNumber > 1
    ? judgeStmts.standings.all(tid, tournament.roundNumber - 1) : []
  try { cumulativeStandings(previous, calculated.entries) }
  catch (error) { calculated.unresolved.push({ tableNo: null, reason: error.message }) }
  return {
    round: tournament.roundNumber,
    stateRevision: tournament.stateRevision,
    policy, policySaved: !!tournament.scoringPolicy,
    counts: calculated.counts,
    participantCount: calculated.entries.length,
    unresolved: calculated.unresolved,
    baselineMissing: tournament.roundNumber > 1 && previous.length === 0 && calculated.entries.length > 0,
    baselineIncomplete: previous.some(row => row.baselineIncomplete),
    priorPlayers: previous.length,
  }
}

/**
 * 给房间内每个管理权连接推送其个性化消息框（服务器已排除：自己提交的/已确认的/已轮清的/重复的）。
 * 任何回报状态变化（新回报/旧消息被冲突标红）都全量重推——消息框很小，成本可忽略。
 */
function pushReportFeeds(tid) {
  const set = rooms.get(Number(tid))
  if (!set) return
  for (const ws of set) {
    if (ws.readyState !== 1) continue
    const a = ws.auth || { role: 'judge', credential: null }
    if (!canManageRoom(a, tid)) continue
    ws.send(JSON.stringify({ type: 'reports', list: getReportFeed(tid, a.credential || '') }))
  }
}

function setupWebSocket(server) {
  const wss = new WebSocketServer({
    server,
    path: '/ws',
    verifyClient: info => config.isOriginAllowed(info.origin, info.req),
  })

  wss.on('connection', (ws) => {
    lobby.add(ws)
    ws.roomId = null
    ws.auth = null
    ws.isAlive = true
    ws.messageWindowAt = Date.now()
    ws.messageCount = 0
    ws.on('pong', () => { ws.isAlive = true })

    ws.on('message', (raw) => {
      const now = Date.now()
      if (now - ws.messageWindowAt >= 1000) {
        ws.messageWindowAt = now
        ws.messageCount = 0
      }
      ws.messageCount++
      if (ws.messageCount > 20 || raw.length > (String(raw).includes('"type":"standings:import"') ? 1024 * 1024 : 256 * 1024)) {
        ws.close(1008, 'Rate or payload limit exceeded')
        return
      }
      let msg
      try { msg = JSON.parse(raw) } catch { return }
      handleMessage(ws, msg)
    })

    ws.on('close', () => {
      lobby.delete(ws)
      leaveRoom(ws)
    })
  })

  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) {
        ws.terminate()
        continue
      }
      ws.isAlive = false
      ws.ping()
    }
  }, 30000)
  heartbeat.unref()
  wss.on('close', () => clearInterval(heartbeat))

  return { broadcastRoom, broadcastLobby }
}

function handleMessage(ws, msg) {
  const { type } = msg || {}

  // ---------- 加入比赛房间 ----------
  // { type:'join', tournamentId, name, token }
  if (type === 'join') {
    const tid = Number(msg.tournamentId)
    const t = rowToTournament(tStmts.byId.get(tid))
    if (!t) return send(ws, { type: 'error', message: '比赛不存在' })

    // 身份鉴定（游客也可进房，credential 为空即游客 judge）
    const name = String(msg.name || '匿名').trim() || '匿名'
    let auth = { username: name, role: 'judge', credential: null }
    const token = String(msg.token || '').trim()
    if (token) {
      const resolved = resolveSession(token)
      if (!resolved) return send(ws, { type: 'error', message: 'Login session is invalid or expired' })
      auth = resolved
    }
    ws.auth = auth

    lobby.delete(ws)
    leaveRoom(ws)
    joinRoom(ws, tid)
    touchAccess(tid) // 规则 2：进入房间 = 访问

    send(ws, {
      type: 'snapshot',
      tables: tablesPayload(tid),
      timer: getTimer(tid),
      tournament: t,
      judge: getJudgeState(tid, t.roundNumber || 1),
    })
    // 有管理权的用户：补推回报消息框（自己的/已确认的/已被新一轮清掉的不在内）
    if (canManageRoom(auth, tid)) {
      send(ws, { type: 'reports', list: getReportFeed(tid, auth.credential || '') })
    }
    return
  }

  // ---------- 离开房间 ----------
  if (type === 'leave') {
    leaveRoom(ws)
    lobby.add(ws)
    return
  }

  // 以下消息要求已加入房间
  const tid = ws.roomId
  if (tid == null) return send(ws, { type: 'error', message: '未加入房间' })
  const auth = ws.auth || { role: 'judge', username: '匿名' }

  if (type === 'round:preview') {
    if (!canManageRoom(auth, tid)) return send(ws, { type: 'round:preview', error: '结算需要比赛权限' })
    const tournament = rowToTournament(tStmts.byId.get(tid))
    if (!tournament || Number(msg.stateRevision) !== tournament.stateRevision) {
      return send(ws, { type: 'round:preview', error: '桌台已被其他设备更新，请重试' })
    }
    return send(ws, { type: 'round:preview', data: roundPreviewData(tid, tournament) })
  }

  // 积分榜由管理权限导入，仅接受当前轮之前一轮的完整快照。
  if (type === 'standings:import') {
    const opId = String(msg.opId || '').slice(0, 80)
    if (!canManageRoom(auth, tid)) return rejectOperation(ws, tid, opId, '导入积分需要比赛权限')
    const payload = msg.payload || {}
    const tournament = rowToTournament(tStmts.byId.get(tid))
    const completed = (tournament.roundNumber || 1) - 1
    const sourceAllowed = tournament.game === 'FAB' ? payload.source === 'gem' : ['melee', 'eventlink'].includes(payload.source)
    if (payload.schema !== 'lynx-standings-v1' || !Array.isArray(payload.rows) || !payload.rows.length || payload.rows.length > 5000 ||
      Number(payload.roundCompleted) !== completed || completed < 1 || !sourceAllowed) {
      return rejectOperation(ws, tid, opId, `请导入第 ${completed} 轮结束时的 lynx-standings-v1 积分榜`)
    }
    const rows = []
    const seen = new Set()
    if (String(payload.idNamespace || '').length > 80) return rejectOperation(ws, tid, opId, '玩家 ID 类型过长')
    for (const row of payload.rows) {
      const name = String(row.name || '').trim().slice(0, 120)
      const points = Number(row.points)
      if (row.playerId && !payload.idNamespace) return rejectOperation(ws, tid, opId, '玩家 ID 缺少类型标识')
      const key = playerKey(payload.idNamespace, row.playerId, name)
      if (!name || row.points === '' || row.points == null || !Number.isSafeInteger(points) || points < 0 || points > 10000 || seen.has(key)) {
        return rejectOperation(ws, tid, opId, '积分榜存在空姓名、无效积分或重复玩家，请检查源数据')
      }
      seen.add(key)
      rows.push({ key, name, points, rank: Number.isInteger(Number(row.rank)) && Number(row.rank) > 0 ? Number(row.rank) : null })
    }
    try {
      db.transaction(() => {
        const latest = rowToTournament(tStmts.byId.get(tid))
        if ((latest.roundNumber || 1) - 1 !== completed) throw new Error('轮次已变化，请重试')
        const before = judgeStmts.standings.all(tid, completed)
        const oldByKey = new Map(before.map(row => [row.playerKey, row]))
        judgeStmts.clearStandings.run(tid, completed)
        const now = Date.now()
        const batchId = `${now}-${opId}`
        const reporter = String(auth.username || '匿名').slice(0, 120)
        for (const row of rows) {
          judgeStmts.addStanding.run(tid, completed, row.key, row.name, row.points, row.rank, now, 'external', reporter, 0)
          const prior = oldByKey.get(row.key)
          if (!prior || prior.points !== row.points || prior.rank !== row.rank || prior.name !== row.name) {
            judgeStmts.addAudit.run(tid, completed, batchId, row.key, row.name,
              prior?.points ?? null, row.points, prior?.rank ?? null, row.rank, reporter, now)
          }
          oldByKey.delete(row.key)
        }
        for (const prior of oldByKey.values()) {
          judgeStmts.addAudit.run(tid, completed, batchId, prior.playerKey, prior.name,
            prior.points, null, prior.rank, null, reporter, now)
        }
        touchOp(tid)
      })()
    } catch (e) { return rejectOperation(ws, tid, opId, e.message) }
    const judge = getJudgeState(tid, tournament.roundNumber || 1)
    send(ws, { type: 'judge:ack', opId, judge })
    broadcastRoom(tid, { type: 'judge:state', judge }, ws)
    return
  }

  // 判罚、套牌检查、个人备注和补时作为一次事务保存；补时同桌台版本一起校验。
  if (type === 'judge:commit') {
    const opId = String(msg.opId || '').slice(0, 80)
    const payload = msg.payload || {}
    const tableNo = Number(payload.tableNo)
    const baseRevision = Number(payload.baseRevision)
    const round = Number(payload.round)
    const checks = Array.isArray(payload.checks) ? payload.checks : []
    const penalties = Array.isArray(payload.penalties) ? payload.penalties : []
    const notes = Array.isArray(payload.notes) ? payload.notes : []
    const addMinutes = Number(payload.addMinutes || 0)
    const tournament = rowToTournament(tStmts.byId.get(tid))
    const allowed = tournament.game === 'FAB'
      ? ['Caution', 'Warning', 'IP2', 'Game Loss', 'Disqualification']
      : ['警告', '一盘负', '一局负', '取消资格']
    if (!Number.isInteger(tableNo) || !Number.isInteger(baseRevision) || round !== tournament.roundNumber ||
      !Number.isInteger(addMinutes) || addMinutes < 0 || addMinutes > 999 ||
      checks.length > 2 || penalties.length > 2 || notes.length > 2 ||
      !(checks.length || penalties.length || notes.length || addMinutes)) {
      return rejectOperation(ws, tid, opId, '判罚或套牌检查数据无效')
    }
    for (const item of [...checks, ...penalties, ...notes]) {
      if (![1, 2].includes(Number(item.seat)) || String(item.note || '').length > 2000) return rejectOperation(ws, tid, opId, '玩家或备注无效')
    }
    for (const item of penalties) {
      if (!String(item.infraction || '').trim() || !allowed.includes(item.penalty)) return rejectOperation(ws, tid, opId, '违规类型或判罚无效')
    }
    let updated
    try {
      updated = db.transaction(() => {
        const latest = rowToTournament(tStmts.byId.get(tid))
        if (latest.roundNumber !== round) throw new Error('轮次已变化，请刷新后重试')
        const table = getTable(tid, tableNo)
        if (!table || table.revision !== baseRevision) throw new Error('该桌已被其他设备更新，请重试')
        if (table.focus && !canManageRoom(auth, tid)) throw new Error('焦点桌仅管理权限可操作')
        if (table.timeExt + addMinutes > 999) throw new Error('补时总计不可超过 999 分钟')
        const all = getTables(tid)
        for (const item of [...checks, ...penalties, ...notes]) {
          const seat = Number(item.seat)
          const name = String(table[`p${seat}`] || '').trim()
          if (!name) throw new Error('该座位没有玩家')
          const id = table[`playerId${seat}`]
          const namespace = table[`playerIdNamespace${seat}`]
          if (!id && all.reduce((total, t) => total + [t.p1, t.p2].filter(n => n && n.trim().toLocaleLowerCase() === name.toLocaleLowerCase()).length, 0) > 1) {
            throw new Error(`玩家“${name}”缺少唯一 ID 且重名，请先用插件重新导入配对`)
          }
          const key = playerKey(namespace, id, name)
          if (checks.includes(item) && judgeStmts.deckCheckInRound.get(tid, round, key)) throw new Error(`${name} 本轮已标记套牌检查`)
          judgeStmts.insertRecord.run(tid, round, tableNo, key, name,
            checks.includes(item) ? 'deckcheck' : penalties.includes(item) ? 'penalty' : 'note',
            penalties.includes(item) ? String(item.infraction).trim().slice(0, 200) : null,
            penalties.includes(item) ? item.penalty : null,
            String(item.note || '').trim(), 0, String(auth.username || '匿名').slice(0, 120), Date.now())
        }
        if (addMinutes) {
          judgeStmts.insertRecord.run(tid, round, tableNo, `table:${tableNo}`, '', 'timeext',
            null, null, '', addMinutes, String(auth.username || '匿名').slice(0, 120), Date.now())
          table.timeExt += addMinutes
        }
        table.revision++
        saveTable(tid, table)
        tStmts.bumpStateRevision.run(tid)
        touchOp(tid)
        return table
      })()
    } catch (e) { return rejectOperation(ws, tid, opId, e.message) }
    const stateRevision = rowToTournament(tStmts.byId.get(tid)).stateRevision
    const judge = getJudgeState(tid, round)
    send(ws, { type: 'judge:ack', opId, judge, table: updated, stateRevision })
    broadcastRoom(tid, { type: 'judge:state', judge }, ws)
    broadcastRoom(tid, { type: 'table:updated', table: updated, stateRevision })
    return
  }

  // ---------- 单桌更新：服务器确认，逐桌版本防止旧数据覆盖 ----------
  if (type === 'table:update') {
    const opId = String(msg.opId || '').slice(0, 80)
    const incoming = msg.table || {}
    const no = Number(incoming.number)
    const baseRevision = Number(msg.baseRevision)
    const manager = canManageRoom(auth, tid)
    if (!Number.isInteger(no) || !Number.isInteger(baseRevision)) {
      return rejectOperation(ws, tid, opId, '桌号或版本无效')
    }
    let next
    try {
      next = db.transaction(() => {
        const old = getTable(tid, no)
        if (!old) throw new Error('桌台已变更，请重试')
        if (old.focus && !manager) throw new Error('焦点桌仅管理权限可操作')
        if (old.revision !== baseRevision) throw new Error('该桌已被其他设备更新，请重试')
        const updated = nextTableState(old, incoming, manager)
        saveTable(tid, updated)
        tStmts.bumpStateRevision.run(tid)
        touchOp(tid)
        return updated
      })()
    } catch (e) {
      return rejectOperation(ws, tid, opId, e.message)
    }
    const stateRevision = rowToTournament(tStmts.byId.get(tid)).stateRevision
    send(ws, { type: 'table:ack', opId, table: next, stateRevision })
    broadcastRoom(tid, { type: 'table:updated', table: next, stateRevision }, ws)
    return
  }

  // ---------- 管理操作：带全局版本的桌台批量替换 ----------
  // { type:'tables:patch', patch:{ tables, layoutCode, layoutRows, maxTables, startTable, tableReversed, roundNumber, importRound? } }
  if (type === 'tables:patch') {
    const patch = msg.patch || {}
    const opId = String(msg.opId || '').slice(0, 80)
    if (!canManageRoom(auth, tid)) return rejectOperation(ws, tid, opId, '批量操作需要比赛权限，请刷新页面')
    if (patch.importPolicyVersion !== 2) return rejectOperation(ws, tid, opId, '页面版本过旧，请刷新后重试')
    if (!validTableList(patch.tables)) return rejectOperation(ws, tid, opId, '桌台数据不完整或桌号重复')
    if (!Number.isInteger(patch.stateRevision)) return rejectOperation(ws, tid, opId, '页面版本过旧，请刷新后重试')

    // 权限模型（依权限等级.txt）：
    //  - 桌子方块状态：游客(judge)即可调整；event 在别场视作游客，也能调桌态
    //  - 比赛设置（maxTables/startTable/roundNumber/tableReversed/layoutCode/layoutRows）：
    //    属"修改这场比赛"，仅 super/putong 或 event(自己场) 可改
    try {
      db.transaction(() => {
        const t = rowToTournament(tStmts.byId.get(tid))
        if (!t || t.stateRevision !== patch.stateRevision) throw new Error('其他设备已更新赛事，请重试')
        const isImport = patch.importRound !== undefined
        if (isImport && patch.importRound !== t.roundNumber) throw new Error('导入轮数已变化，请刷新后重试')
        if (isImport && patch.roundNumber !== t.roundNumber) throw new Error('导入轮数与赛事不一致')
        if (isImport && t.lastImportRound === t.roundNumber) {
          const existing = getTables(tid)
          const numbers = new Set(existing.map(table => table.number))
          if (patch.tables.length !== existing.length || patch.tables.some(table => !numbers.has(table.number))) {
            throw new Error('本轮桌号已由首次导入锁定，请刷新后重试')
          }
        }
        const list = patch.tables.map(table => {
          const old = getTable(tid, table.number)
          return { ...table, revision: (old?.revision || 0) + 1,
            resultSource: table.resultSource || null, focus: !!table.focus }
        })
        saveTables(tid, list)
        const merged = { ...t }
        if (isImport) merged.maxTables = list.length
        else if (patch.maxTables != null) merged.maxTables = Math.max(1, Math.min(999, parseInt(patch.maxTables) || 1))
        if (patch.startTable != null) merged.startTable = parseInt(patch.startTable) || 1
        if (patch.tableReversed != null) merged.tableReversed = !!patch.tableReversed
        if (patch.roundNumber != null) merged.roundNumber = Math.max(1, parseInt(patch.roundNumber) || 1)
        if (patch.layoutCode !== undefined) merged.layoutCode = patch.layoutCode
        if (patch.layoutRows !== undefined) merged.layoutRows = patch.layoutRows
        tStmts.update.run(
          merged.name, merged.date, merged.game, merged.format, merged.status, merged.password,
          merged.players, merged.maxTables, merged.startTable, merged.roundNumber,
          merged.eventCode, merged.eventNum, merged.tableReversed ? 1 : 0,
          merged.layoutCode, merged.layoutRows ? JSON.stringify(merged.layoutRows) : null,
          merged.manualOnly ? 1 : 0,
          tid
        )
        if (isImport) tStmts.markImportedRound.run(t.roundNumber, tid)
        touchOp(tid)
      })()
    } catch (e) {
      return rejectOperation(ws, tid, opId, e.message)
    }
    const data = tablesPayload(tid)
    send(ws, { type: 'tables:ack', opId, data })
    broadcastRoom(tid, { type: 'tables', data }, ws)
    return
  }

  // ---------- 新一轮：桌台、轮数、计时和回报在同一事务提交 ----------
  if (type === 'round:start') {
    const opId = String(msg.opId || '').slice(0, 80)
    if (!canManageRoom(auth, tid)) return rejectOperation(ws, tid, opId, '开始下一轮需要比赛权限')
    if (!Number.isInteger(msg.stateRevision)) return rejectOperation(ws, tid, opId, '页面版本过旧')
    const mode = msg.mode === 'import' ? 'import' : 'manual'
    if (mode === 'import' && !validTableList(msg.tables)) {
      return rejectOperation(ws, tid, opId, '新一轮桌台数据不完整')
    }
    if (mode === 'import') {
      const numbers = msg.tables.map(table => table.number)
      if (Math.max(...numbers) - Math.min(...numbers) + 1 !== numbers.length) {
        return rejectOperation(ws, tid, opId, '新一轮桌号不连续')
      }
    }
    let timer
    try {
      db.transaction(() => {
        const tournament = rowToTournament(tStmts.byId.get(tid))
        if (!tournament || tournament.stateRevision !== msg.stateRevision) throw new Error('其他设备已更新赛事，请重试')
        if (Number(msg.previewRevision) !== tournament.stateRevision) throw new Error('结算预览已过期，请重新检查')
        if (mode === 'import' && tournament.manualOnly) throw new Error('本场已设置仅手动开始下一轮')
        if (mode === 'import' && Number(msg.startTable) !== tournament.startTable) throw new Error('新一轮起始桌号不匹配')
        const currentTables = getTables(tid)
        const policy = tournament.scoringPolicy || normalizePolicy(msg.scoringPolicy)
        if (!tournament.scoringPolicy && msg.policyConfirmed !== true) throw new Error('请先确认本场积分规则')
        const settlement = settleTables(currentTables, policy)
        if (settlement.unresolved.length) {
          const list = settlement.unresolved.slice(0, 5).map(item => item.tableNo ? `#${item.tableNo}` : '玩家身份').join('、')
          throw new Error(`仍有 ${settlement.unresolved.length} 桌赛果未确认（${list}），请先处理`)
        }
        if (roundStmts.closure.get(tid, tournament.roundNumber)) throw new Error('本轮已结算，请刷新页面')
        const previous = tournament.roundNumber > 1
          ? judgeStmts.standings.all(tid, tournament.roundNumber - 1) : []
        const missingBaseline = tournament.roundNumber > 1 && !previous.length && settlement.entries.length > 0
        if (missingBaseline && msg.partialBaselineConfirmed !== true) {
          throw new Error('缺少上一轮积分；请导入积分榜，或确认从本轮起累计')
        }
        const incomplete = missingBaseline || previous.some(row => row.baselineIncomplete)
        const now = Date.now()
        const reporter = String(auth.username || '匿名').slice(0, 120)
        if (!tournament.scoringPolicy) tStmts.setScoringPolicy.run(JSON.stringify(policy), tid)
        roundStmts.addClosure.run(tid, tournament.roundNumber, JSON.stringify(policy), incomplete ? 1 : 0, reporter, now)
        for (const entry of settlement.entries) {
          roundStmts.addResult.run(tid, tournament.roundNumber, entry.tableNo, entry.seat,
            entry.playerKey, entry.playerName, entry.opponentKey, entry.outcome, entry.points,
            entry.resultSource, entry.rawResult, entry.outcomeType, now)
        }
        const standings = cumulativeStandings(previous, settlement.entries)
        for (const row of standings) {
          judgeStmts.addStanding.run(tid, tournament.roundNumber, row.playerKey, row.name,
            row.points, null, now, 'auto', reporter, incomplete ? 1 : 0)
        }
        const source = mode === 'manual' ? currentTables : msg.tables
        const next = source.map(item => {
          const old = getTable(tid, item.number)
          return {
            ...item,
            color: 'white', p1: mode === 'manual' ? '' : String(item.p1 || '').slice(0, 120),
            p2: mode === 'manual' ? '' : String(item.p2 || '').slice(0, 120),
            playerId1: mode === 'manual' ? null : item.playerId1 || null,
            playerId2: mode === 'manual' ? null : item.playerId2 || null,
            playerIdNamespace1: mode === 'manual' ? null : item.playerIdNamespace1 || null,
            playerIdNamespace2: mode === 'manual' ? null : item.playerIdNamespace2 || null,
            result: null, timeExt: 0, watchedBy: null, drop1: false, drop2: false,
            greenManual: false, greenAt: null, resultSource: null, outcomeType: null, focus: false,
            revision: (old?.revision || 0) + 1,
          }
        })
        if (!validTableList(next)) throw new Error('新一轮桌号不完整')
        const countChangedWithLayout = mode === 'import' && !!tournament.layoutRows && next.length !== currentTables.length
        saveTables(tid, next)
        const roundStatement = countChangedWithLayout ? tStmts.setRoundAndCountClearLayout : tStmts.setRoundAndCount
        roundStatement.run(tournament.roundNumber + 1, next.length, tid)
        if (mode === 'import') tStmts.markImportedRound.run(tournament.roundNumber + 1, tid)
        timer = getTimer(tid)
        timer.remaining = timer.configured * 60
        timer.running = false
        timer.updatedAt = Date.now()
        saveTimer(tid, timer)
        roundClearReports(tid)
        touchOp(tid)
      })()
    } catch (e) {
      return rejectOperation(ws, tid, opId, e.message)
    }
    const data = tablesPayload(tid)
    send(ws, { type: 'round:ack', opId, data, timer })
    broadcastRoom(tid, { type: 'tables', data }, ws)
    broadcastRoom(tid, { type: 'judge:state', judge: getJudgeState(tid, data.roundNumber) })
    broadcastRoom(tid, { type: 'timer', state: timer })
    broadcastRoom(tid, { type: 'reports:roundclear' })
    pushReportFeeds(tid)
    return
  }

  // ---------- 计时器指令（服务器权威） ----------
  // { type:'timer:cmd', cmd:{ action:'start'|'pause'|'reset'|'set', minutes? } }
  if (type === 'timer:cmd') {
    if (!isEventPriv(auth.role) || !eventCanAccess(auth, tid)) {
      return send(ws, { type: 'error', message: '需要比赛权限' })
    }
    const cmd = msg.cmd || {}
    const timer = getTimer(tid)
    const now = Date.now()

    switch (cmd.action) {
      case 'start':
        timer.updatedAt = now
        timer.running = true
        break
      case 'pause':
        timer.remaining = currentRemaining(timer)
        timer.running = false
        timer.updatedAt = now
        break
      case 'reset':
        timer.remaining = timer.configured * 60
        timer.running = false
        timer.updatedAt = now
        break
      case 'set': {
        const mins = parseInt(cmd.minutes)
        if (isNaN(mins) || mins < 0 || mins > 999) {
          return send(ws, { type: 'error', message: '时长不合法' })
        }
        timer.configured = mins
        timer.remaining = mins * 60
        timer.updatedAt = now
        break
      }
      default:
        return send(ws, { type: 'error', message: '未知计时指令' })
    }

    saveTimer(tid, timer)
    touchOp(tid) // 规则 2：动计时器 = 操作
    // 广播给所有人（含发送者，统一以服务器状态为准）
    broadcastRoom(tid, { type: 'timer', state: timer })
    return
  }

  // ---------- 成绩/Drop 回报（任何身份，含游客；每条消息只含一个回报） ----------
  // { type:'report', tableNo, kind, body }  kind:'score'|'drop'；body 例："张三 Win 2:0" / "1:1 Draw" / "李四 Drop"
  if (type === 'report') {
    const tableNo = parseInt(msg.tableNo)
    const kind = msg.kind === 'drop' ? 'drop' : 'score'
    const body = String(msg.body || '').trim()
    if (!Number.isInteger(tableNo) || tableNo < 1 || tableNo > 9999) {
      return send(ws, { type: 'error', message: '桌号不合法' })
    }
    if (!body || body.length > 120) {
      return send(ws, { type: 'error', message: '回报内容为空或过长' })
    }
    // 轮数取服务器当前轮（权威）；文本由服务器统一组装（不含回报人——前端用 reporterName 单独渲染成小字浅色）
    const t = rowToTournament(tStmts.byId.get(tid))
    const round = (t && t.roundNumber) || 1
    const text = `R${round} - 桌号${tableNo} - ${body}`
    const report = addReport(tid, {
      tableNo, round, kind, body,
      reporterName: auth.username, reporterCredential: auth.credential || '', text,
    })
    touchOp(tid) // 规则 2：回报 = 操作
    // 重复成绩回报不入任何消息框；其余（含引发冲突标红）全量重推各管理端
    if (!report.dup) pushReportFeeds(tid)
    return
  }

  // ---------- 确认一条回报（仅管理权用户；只从自己的消息框清除，历史保留） ----------
  if (type === 'report:ack') {
    if (!canManageRoom(auth, tid)) return send(ws, { type: 'error', message: '需要比赛权限' })
    const id = parseInt(msg.id)
    if (!Number.isInteger(id)) return
    ackReport(id, auth.credential || '')
    return
  }

  // ---------- 清除所有（仅管理权用户；只清自己的消息框，历史保留） ----------
  if (type === 'report:clear') {
    if (!canManageRoom(auth, tid)) return send(ws, { type: 'error', message: '需要比赛权限' })
    ackAllReports(tid, auth.credential || '')
    return
  }

  // ---------- 导入新一轮：全场回报从所有人的消息框清除（历史保留） ----------
  if (type === 'report:roundclear') {
    if (!canManageRoom(auth, tid)) return send(ws, { type: 'error', message: '需要比赛权限' })
    roundClearReports(tid)
    broadcastRoom(tid, { type: 'reports:roundclear' })
    pushReportFeeds(tid) // 权威空列表全量重推（客户端无需依赖特殊消息）
    return
  }
}

module.exports = { setupWebSocket, broadcastRoom, broadcastLobby }
