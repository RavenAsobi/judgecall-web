const test = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const WebSocket = require('ws')

process.env.DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lynx-judge-test-')), 'test.db')
const { db, tStmts, sessionStmts, saveTables, getTable, getJudgeState } = require('../db')
const { setupWebSocket } = require('../ws')

function waitFor(socket, type) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off('message', onMessage); reject(new Error(`Timed out waiting for ${type}`)) }, 4000)
    function onMessage(raw) {
      const msg = JSON.parse(raw)
      if (msg.type !== type) return
      clearTimeout(timer)
      socket.off('message', onMessage)
      resolve(msg)
    }
    socket.on('message', onMessage)
  })
}

test('standings, penalty and deck check persist with revisions and duplicate protection', async () => {
  const tid = Date.now()
  const eventCode = '987654'
  const token = 'isolated-test-token'
  tStmts.insert.run(tid, '隔离测试赛事', '待定', 'FAB', 'Silver Age', 'ongoing', 'test', 4, 2, 1, 2,
    eventCode, 'D999', 0, null, null, 0)
  sessionStmts.insert.run(crypto.createHash('sha256').update(token).digest('hex'),
    '测试裁判', 'event', eventCode, tid, Date.now() + 3600000, Date.now())
  saveTables(tid, [
    { number: 1, p1: 'Alice', p2: 'Bob', playerId1: 'a', playerId2: 'b', playerIdNamespace1: 'gem-player-id', playerIdNamespace2: 'gem-player-id' },
    { number: 2, p1: 'Carol', p2: 'Dan', playerId1: 'c', playerId2: 'd', playerIdNamespace1: 'gem-player-id', playerIdNamespace2: 'gem-player-id' },
  ])
  const server = http.createServer()
  setupWebSocket(server)
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const socket = new WebSocket(`ws://127.0.0.1:${server.address().port}/ws`)
  try {
    await new Promise(resolve => socket.once('open', resolve))
    const snapshot = waitFor(socket, 'snapshot')
    socket.send(JSON.stringify({ type: 'join', tournamentId: tid, name: '测试裁判', token }))
    assert.equal((await snapshot).judge.roundCompleted, 1)

    const importAck = waitFor(socket, 'judge:ack')
    socket.send(JSON.stringify({ type: 'standings:import', opId: 'import-1', payload: {
      schema: 'lynx-standings-v1', source: 'gem', roundCompleted: 1, idNamespace: 'gem-player-id',
      rows: [
        { name: 'Alice', playerId: 'a', points: 3, rank: 1 },
        { name: 'Bob', playerId: 'b', points: 0, rank: 2 },
      ],
    } }))
    assert.equal((await importAck).judge.standings.length, 2)

    const commitAck = waitFor(socket, 'judge:ack')
    socket.send(JSON.stringify({ type: 'judge:commit', opId: 'record-1', payload: {
      tableNo: 1, round: 2, baseRevision: 0, addMinutes: 5,
      checks: [{ seat: 1 }], notes: [{ seat: 2, note: '牌套待复查' }],
      penalties: [{ seat: 1, infraction: 'Slow Play', penalty: 'Caution', note: '首次提醒' }],
    } }))
    const saved = await commitAck
    assert.equal(saved.table.timeExt, 5)
    assert.equal(saved.judge.records.length, 4)
    assert.equal(saved.judge.records.find(r => r.kind === 'timeext').minutes, 5)
    assert.equal(getTable(tid, 1).revision, 1)
    assert.equal(getJudgeState(tid, 2).records.filter(r => r.kind === 'deckcheck').length, 1)

    const duplicate = waitFor(socket, 'operation:rejected')
    socket.send(JSON.stringify({ type: 'judge:commit', opId: 'duplicate', payload: {
      tableNo: 1, round: 2, baseRevision: 1, addMinutes: 0, checks: [{ seat: 1 }],
    } }))
    assert.match((await duplicate).message, /已标记套牌检查/)
    assert.equal(getJudgeState(tid, 2).records.length, 4)

    const stale = waitFor(socket, 'operation:rejected')
    socket.send(JSON.stringify({ type: 'judge:commit', opId: 'stale', payload: {
      tableNo: 1, round: 2, baseRevision: 0, addMinutes: 3,
    } }))
    assert.match((await stale).message, /其他设备更新/)
    assert.equal(getTable(tid, 1).timeExt, 5)

    const mtgTid = tid + 1
    const mtgToken = 'isolated-mtg-token'
    const mtgCode = '456789'
    tStmts.insert.run(mtgTid, '隔离 MTG 测试', '待定', 'MTG', 'Modern', 'ongoing', 'test', 2, 1, 1, 1,
      mtgCode, 'D997', 0, null, null, 0)
    sessionStmts.insert.run(crypto.createHash('sha256').update(mtgToken).digest('hex'),
      'MTG 裁判', 'event', mtgCode, mtgTid, Date.now() + 3600000, Date.now())
    saveTables(mtgTid, [{ number: 1, p1: 'Eve', p2: 'Frank' }])
    const mtgSnapshot = waitFor(socket, 'snapshot')
    socket.send(JSON.stringify({ type: 'join', tournamentId: mtgTid, name: 'MTG 裁判', token: mtgToken }))
    assert.equal((await mtgSnapshot).tournament.game, 'MTG')
    const mtgAck = waitFor(socket, 'judge:ack')
    socket.send(JSON.stringify({ type: 'judge:commit', opId: 'mtg-penalty', payload: {
      tableNo: 1, round: 1, baseRevision: 0, addMinutes: 0,
      penalties: [{ seat: 1, infraction: '2.1 遗漏触发', penalty: '警告', note: '测试' }],
    } }))
    assert.equal((await mtgAck).judge.records[0].penalty, '警告')
    const invalidPenalty = waitFor(socket, 'operation:rejected')
    socket.send(JSON.stringify({ type: 'judge:commit', opId: 'mtg-invalid', payload: {
      tableNo: 1, round: 1, baseRevision: 1, addMinutes: 0,
      penalties: [{ seat: 1, infraction: '2.1 遗漏触发', penalty: 'Caution' }],
    } }))
    assert.match((await invalidPenalty).message, /判罚无效/)
  } finally {
    socket.close()
    await new Promise(resolve => server.close(resolve))
    db.close()
  }
})
