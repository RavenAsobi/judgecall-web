// ==================== WebSocket 封装 ====================
// 一个比赛一个房间。客户端只发指令、接收广播，不做权威状态推算。
//
// 协议（与后端约定，JSON 文本帧）：
//   客户端 -> 服务器：
//     { type:'join', tournamentId, name, token }
//     { type:'leave' }
//     { type:'table:update', opId, baseRevision, table } // 单桌有版本更新
//     { type:'tables:patch', opId, patch }   // 管理权限批量替换，需 stateRevision
//     { type:'round:start', opId, mode, stateRevision, tables? }
//     { type:'timer:cmd', cmd }             // cmd: {action:'start'|'pause'|'reset'|'set', minutes?}
//   服务器 -> 客户端：
//     { type:'snapshot', tables, timer, tournament }   // 加入房间时的全量
//     { type:'table:ack'|'table:updated', table, stateRevision, opId? }
//     { type:'tables:ack'|'round:ack'|'tables', data, opId? }
//     { type:'operation:rejected', opId, message, data }
//     { type:'timer', state }                          // 计时器广播 {configured, remaining, running, updatedAt}
//     { type:'tournament', tournament }                // 比赛元信息变更
//     { type:'error', message }

const WS_URL = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws'

let socket = null
let currentRoom = null
let reconnectTimer = null
let manuallyClosed = false

const handlers = {
  snapshot: new Set(),
  tables: new Set(),
  timer: new Set(),
  tournament: new Set(),
  open: new Set(),
  close: new Set(),
  error: new Set(),
}

function emit(type, payload) {
  for (const fn of handlers[type] || []) {
    try { fn(payload) } catch (e) { console.error('[ws] handler error', e) }
  }
}

function connect() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return
  manuallyClosed = false
  socket = new WebSocket(WS_URL)

  socket.onopen = () => {
    emit('open')
    // 重连后自动重新加入房间
    if (currentRoom) sendJoin(currentRoom)
  }
  socket.onmessage = (ev) => {
    let msg
    try { msg = JSON.parse(ev.data) } catch { return }
    if (!msg || !msg.type) return
    if (msg.type === 'error') {
      emit('error', msg)
      return
    }
    emit(msg.type, msg)
  }
  socket.onclose = () => {
    emit('close')
    socket = null
    if (!manuallyClosed) {
      clearTimeout(reconnectTimer)
      reconnectTimer = setTimeout(connect, 1500)
    }
  }
  socket.onerror = () => {
    // 让 onclose 处理重连
  }
}

function sendJoin(room) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return
  socket.send(JSON.stringify({
    type: 'join',
    tournamentId: room.tournamentId,
    name: room.name,
    token: room.token,
  }))
}

/** 加入比赛房间（离开之前的房间） */
export function joinRoom(tournamentId) {
  const name = sessionStorage.getItem('adminName') || sessionStorage.getItem('guestName') || '匿名'
  const token = sessionStorage.getItem('sessionToken') || ''
  currentRoom = { tournamentId, name, token }
  connect()
  if (socket && socket.readyState === WebSocket.OPEN) sendJoin(currentRoom)
}

/** 离开当前房间 */
export function leaveRoom() {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: 'leave' }))
  }
  currentRoom = null
}

/** 推送桌子全量（demo 的 pushTables 语义：全量覆盖 + 元数据） */
export function isReady() {
  return !!socket && socket.readyState === WebSocket.OPEN && !!currentRoom
}

export function pushTables(payload, opId) {
  if (!isReady()) return false
  socket.send(JSON.stringify({ type: 'tables:patch', patch: payload, opId }))
  return true
}

export function updateTable(table, baseRevision, opId) {
  if (!isReady()) return false
  socket.send(JSON.stringify({ type: 'table:update', table, baseRevision, opId }))
  return true
}

export function previewRound(stateRevision) {
  if (!isReady()) return false
  socket.send(JSON.stringify({ type: 'round:preview', stateRevision }))
  return true
}

export function startRound(mode, tables, startTable, stateRevision, opId, settlement) {
  if (!isReady()) return false
  socket.send(JSON.stringify({ type: 'round:start', mode, tables, startTable, stateRevision, opId,
    previewRevision: settlement.previewRevision, scoringPolicy: settlement.scoringPolicy,
    policyConfirmed: settlement.policyConfirmed, partialBaselineConfirmed: settlement.partialBaselineConfirmed }))
  return true
}

export function importStandings(payload, opId) {
  if (!isReady()) return false
  socket.send(JSON.stringify({ type: 'standings:import', payload, opId }))
  return true
}

export function commitJudgeRecord(payload, opId) {
  if (!isReady()) return false
  socket.send(JSON.stringify({ type: 'judge:commit', payload, opId }))
  return true
}

/** 发送计时器指令（服务器权威） */
export function sendTimerCmd(cmd) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return
  socket.send(JSON.stringify({ type: 'timer:cmd', cmd }))
}

/** 提交一条成绩/Drop 回报（任何身份；kind:'score'|'drop'，body 如 "张三 Win 2:0"） */
export function sendReport(tableNo, kind, body) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return
  socket.send(JSON.stringify({ type: 'report', tableNo, kind, body }))
}

/** 确认一条回报（从自己消息框清除） */
export function ackReport(id) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return
  socket.send(JSON.stringify({ type: 'report:ack', id }))
}

/** 清除所有回报（只清自己消息框） */
export function clearReports() {
  if (!socket || socket.readyState !== WebSocket.OPEN) return
  socket.send(JSON.stringify({ type: 'report:clear' }))
}

/** 导入新一轮：清掉全场所有人消息框里的回报（历史保留） */
export function roundClearReports() {
  if (!socket || socket.readyState !== WebSocket.OPEN) return
  socket.send(JSON.stringify({ type: 'report:roundclear' }))
}

/** 订阅事件，返回取消订阅函数 */
export function on(type, fn) {
  if (!handlers[type]) handlers[type] = new Set()
  handlers[type].add(fn)
  return () => handlers[type].delete(fn)
}

/** 完全关闭连接（不重连） */
export function close() {
  manuallyClosed = true
  clearTimeout(reconnectTimer)
  if (socket) socket.close()
  socket = null
  currentRoom = null
}
