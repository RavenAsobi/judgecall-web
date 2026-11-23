const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const http = require('node:http')
const WebSocket = require('ws')

process.env.DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lynx-round-flow-')), 'flow.db')
const { db, tStmts, sessionStmts, saveTables, getTables, roundStmts, judgeStmts } = require('../db')
const { setupWebSocket } = require('../ws')

function waitFor(socket, type) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off('message', onMessage); reject(new Error(`Timed out: ${type}`)) }, 5000)
    function onMessage(raw) {
      const msg = JSON.parse(raw)
      if (msg.type !== type) return
      clearTimeout(timer); socket.off('message', onMessage); resolve(msg)
    }
    socket.on('message', onMessage)
  })
}

test('round close is atomic, accumulates points, and accepts audited official correction', async () => {
  const tid = Date.now(), token = 'round-flow-token', code = '135790'
  const policy = { win: 3, draw: 1, loss: 0, bye: 3, doubleLoss: 0 }
  tStmts.insert.run(tid, '轮次结算测试', '待定', 'FAB', 'Silver Age', 'ongoing', 'test', 4, 2, 1, 1,
    code, 'D996', 0, null, null, 0)
  sessionStmts.insert.run(crypto.createHash('sha256').update(token).digest('hex'),
    '结算裁判', 'event', code, tid, Date.now() + 3600000, Date.now())
  saveTables(tid, [
    { number: 1, p1: 'Alice', p2: 'Bob', playerId1: 'a', playerId2: 'b',
      playerIdNamespace1: 'gem-player-id', playerIdNamespace2: 'gem-player-id', result: 'p1', outcomeType: '1WIN' },
    { number: 2, p1: 'Carol', p2: 'Dan', playerId1: 'c', playerId2: 'd',
      playerIdNamespace1: 'gem-player-id', playerIdNamespace2: 'gem-player-id' },
  ])
  const server = http.createServer()
  setupWebSocket(server)
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const socket = new WebSocket(`ws://127.0.0.1:${server.address().port}/ws`)
  try {
    await new Promise(resolve => socket.once('open', resolve))
    let reply = waitFor(socket, 'snapshot')
    socket.send(JSON.stringify({ type: 'join', tournamentId: tid, token, name: '结算裁判' }))
    assert.equal((await reply).tournament.roundNumber, 1)

    reply = waitFor(socket, 'round:preview')
    socket.send(JSON.stringify({ type: 'round:preview', stateRevision: 0 }))
    assert.equal((await reply).data.unresolved.length, 1)
    reply = waitFor(socket, 'operation:rejected')
    socket.send(JSON.stringify({ type: 'round:start', opId: 'bad', mode: 'manual', stateRevision: 0,
      previewRevision: 0, scoringPolicy: policy, policyConfirmed: true }))
    assert.match((await reply).message, /赛果未确认/)
    assert.equal(tStmts.byId.get(tid).roundNumber, 1)
    assert.equal(roundStmts.closure.get(tid, 1), undefined)

    reply = waitFor(socket, 'table:ack')
    socket.send(JSON.stringify({ type: 'table:update', opId: 'score', baseRevision: 0,
      table: { ...getTables(tid)[1], result: 'draw', outcomeType: 'DRAW' } }))
    await reply
    reply = waitFor(socket, 'round:preview')
    socket.send(JSON.stringify({ type: 'round:preview', stateRevision: 1 }))
    const preview = (await reply).data
    assert.deepEqual(preview.counts.win, 1)
    assert.deepEqual(preview.counts.draw, 1)
    assert.equal(preview.unresolved.length, 0)
    reply = waitFor(socket, 'round:ack')
    socket.send(JSON.stringify({ type: 'round:start', opId: 'close-1', mode: 'manual', stateRevision: 1,
      previewRevision: 1, scoringPolicy: policy, policyConfirmed: true }))
    const first = await reply
    assert.equal(first.data.roundNumber, 2)
    assert.equal(first.data.scoringPolicy.win, 3)
    assert.equal(getTables(tid)[0].p1, '')
    assert.equal(getTables(tid)[0].result, null)
    assert.equal(roundStmts.stats.all(tid, 1).find(row => row.playerKey === 'id:gem-player-id:a').wins, 1)
    assert.equal(judgeStmts.standings.all(tid, 1).find(row => row.playerKey === 'id:gem-player-id:a').points, 3)

    reply = waitFor(socket, 'judge:ack')
    socket.send(JSON.stringify({ type: 'standings:import', opId: 'official', payload: {
      schema: 'lynx-standings-v1', source: 'gem', roundCompleted: 1, idNamespace: 'gem-player-id',
      rows: [
        { name: 'Alice', playerId: 'a', points: 4, rank: 1 },
        { name: 'Bob', playerId: 'b', points: 0, rank: 4 },
        { name: 'Carol', playerId: 'c', points: 1, rank: 2 },
        { name: 'Dan', playerId: 'd', points: 1, rank: 3 },
      ],
    } }))
    assert.equal((await reply).judge.standings.find(row => row.playerKey === 'id:gem-player-id:a').points, 4)
    assert.equal(judgeStmts.standingsAudit.all(tid).find(row => row.playerKey === 'id:gem-player-id:a').changedBy, '结算裁判')

    const patched = getTables(tid)
    patched[0] = { ...patched[0], p1: 'Alice', p2: 'Carol', playerId1: 'a', playerId2: 'c',
      playerIdNamespace1: 'gem-player-id', playerIdNamespace2: 'gem-player-id', result: 'p2', outcomeType: '2WIN' }
    patched[1] = { ...patched[1], p1: 'Bob', p2: 'Dan', playerId1: 'b', playerId2: 'd',
      playerIdNamespace1: 'gem-player-id', playerIdNamespace2: 'gem-player-id', result: 'draw', outcomeType: 'DRAW' }
    reply = waitFor(socket, 'tables:ack')
    socket.send(JSON.stringify({ type: 'tables:patch', opId: 'r2-results', patch: {
      importPolicyVersion: 2, stateRevision: first.data.stateRevision, tables: patched,
      roundNumber: 2, importRound: 2,
    } }))
    const r2 = await reply
    reply = waitFor(socket, 'round:preview')
    socket.send(JSON.stringify({ type: 'round:preview', stateRevision: r2.data.stateRevision }))
    assert.equal((await reply).data.policySaved, true)
    reply = waitFor(socket, 'round:ack')
    socket.send(JSON.stringify({ type: 'round:start', opId: 'close-2', mode: 'manual',
      stateRevision: r2.data.stateRevision, previewRevision: r2.data.stateRevision }))
    const third = await reply
    assert.equal(third.data.roundNumber, 3)
    const standings = judgeStmts.standings.all(tid, 2)
    assert.equal(standings.find(row => row.playerKey === 'id:gem-player-id:a').points, 4)
    assert.equal(standings.find(row => row.playerKey === 'id:gem-player-id:c').points, 4)
    assert.equal(standings.find(row => row.playerKey === 'id:gem-player-id:b').points, 1)
    assert.equal(roundStmts.stats.all(tid, 2).find(row => row.playerKey === 'id:gem-player-id:a').losses, 1)

    const r3Tables = getTables(tid)
    r3Tables[0] = { ...r3Tables[0], p1: 'Alice', p2: 'Dan', playerId1: 'a', playerId2: 'd',
      playerIdNamespace1: 'gem-player-id', playerIdNamespace2: 'gem-player-id', result: 'p1', outcomeType: '1WIN' }
    r3Tables[1] = { ...r3Tables[1], p1: 'Bob', p2: 'Carol', playerId1: 'b', playerId2: 'c',
      playerIdNamespace1: 'gem-player-id', playerIdNamespace2: 'gem-player-id', result: 'draw', outcomeType: 'DRAW' }
    reply = waitFor(socket, 'tables:ack')
    socket.send(JSON.stringify({ type: 'tables:patch', opId: 'r3-results', patch: {
      importPolicyVersion: 2, stateRevision: third.data.stateRevision, tables: r3Tables,
      roundNumber: 3, importRound: 3,
    } }))
    const r3 = await reply
    reply = waitFor(socket, 'round:preview')
    socket.send(JSON.stringify({ type: 'round:preview', stateRevision: r3.data.stateRevision }))
    assert.equal((await reply).data.unresolved.length, 0)
    const nextPairings = [
      { number: 1, p1: 'Alice', p2: 'Bob', playerId1: 'a', playerId2: 'b',
        playerIdNamespace1: 'gem-player-id', playerIdNamespace2: 'gem-player-id' },
      { number: 2, p1: 'Carol', p2: 'Dan', playerId1: 'c', playerId2: 'd',
        playerIdNamespace1: 'gem-player-id', playerIdNamespace2: 'gem-player-id' },
    ]
    reply = waitFor(socket, 'round:ack')
    socket.send(JSON.stringify({ type: 'round:start', opId: 'close-3-import-4', mode: 'import',
      tables: nextPairings, startTable: 1, stateRevision: r3.data.stateRevision,
      previewRevision: r3.data.stateRevision }))
    assert.equal((await reply).data.roundNumber, 4)
    assert.equal(roundStmts.closure.get(tid, 3).round, 3)
    assert.equal(getTables(tid)[0].p1, 'Alice')
    assert.equal(getTables(tid)[0].result, null)
    assert.equal(judgeStmts.standings.all(tid, 3).find(row => row.playerKey === 'id:gem-player-id:a').points, 7)

    const legacyTid = tid + 1, legacyToken = 'legacy-token', legacyCode = '246801'
    tStmts.insert.run(legacyTid, '旧赛事续算测试', '待定', 'FAB', 'Classic Constructed', 'ongoing', 'test', 2, 1, 1, 2,
      legacyCode, 'D995', 0, null, null, 0)
    sessionStmts.insert.run(crypto.createHash('sha256').update(legacyToken).digest('hex'),
      '旧赛事裁判', 'event', legacyCode, legacyTid, Date.now() + 3600000, Date.now())
    saveTables(legacyTid, [{ number: 1, p1: 'Eve', p2: 'Frank', result: 'p1', outcomeType: '1WIN' }])
    reply = waitFor(socket, 'snapshot')
    socket.send(JSON.stringify({ type: 'join', tournamentId: legacyTid, token: legacyToken, name: '旧赛事裁判' }))
    await reply
    reply = waitFor(socket, 'round:preview')
    socket.send(JSON.stringify({ type: 'round:preview', stateRevision: 0 }))
    assert.equal((await reply).data.baselineMissing, true)
    reply = waitFor(socket, 'operation:rejected')
    socket.send(JSON.stringify({ type: 'round:start', opId: 'legacy-no-confirm', mode: 'manual',
      stateRevision: 0, previewRevision: 0, scoringPolicy: policy, policyConfirmed: true }))
    assert.match((await reply).message, /缺少上一轮积分/)
    reply = waitFor(socket, 'round:ack')
    socket.send(JSON.stringify({ type: 'round:start', opId: 'legacy-confirm', mode: 'manual',
      stateRevision: 0, previewRevision: 0, scoringPolicy: policy, policyConfirmed: true,
      partialBaselineConfirmed: true }))
    assert.equal((await reply).data.roundNumber, 3)
    assert.equal(judgeStmts.standings.all(legacyTid, 2)[0].baselineIncomplete, 1)
  } finally {
    socket.close()
    await new Promise(resolve => server.close(resolve))
    db.close()
  }
})
