const test = require('node:test')
const assert = require('node:assert/strict')
const { normalizePolicy, settleTables, cumulativeStandings } = require('../round-settlement')

const policy = { win: 3, draw: 1, loss: 0, bye: 3, doubleLoss: 0 }
const table = (number, p1, p2, result, extra = {}) => ({ number, p1, p2, result, ...extra })

test('settles match outcomes, preserving special result types', () => {
  const input = [
    table(1, 'Alice', 'Bob', 'p1', { playerId1: 'a', playerId2: 'b', playerIdNamespace1: 'gem', playerIdNamespace2: 'gem' }),
    table(2, 'Carol', 'Dan', 'draw'),
    table(3, 'Eve', '', 'p1', { outcomeType: 'BYE' }),
    table(4, 'Frank', 'Grace', null, { outcomeType: 'LOSSALL' }),
    table(5, 'Heidi', 'Ivan', null, { outcomeType: 'GHOST', color: 'black', drop1: true, drop2: true }),
    table(6, '', '', null),
    table(7, 'Judy', 'Karl', { p1: 2, p2: 1, draws: 0 }),
  ]
  const result = settleTables(input, policy)
  assert.deepEqual(result.counts, { win: 2, draw: 1, bye: 1, double_loss: 1, ghost: 1, empty: 1 })
  assert.deepEqual(result.unresolved, [])
  assert.equal(result.entries.find(entry => entry.playerName === 'Eve').outcome, 'bye')
  assert.equal(result.entries.find(entry => entry.playerName === 'Alice').playerKey, 'id:gem:a')
  assert.equal(result.entries.find(entry => entry.playerName === 'Frank').points, 0)
  assert.equal(result.entries.find(entry => entry.playerName === 'Heidi').outcome, 'ghost')
})

test('does not turn color, drop, incomplete score or an untyped bye into points', () => {
  const result = settleTables([
    table(1, 'A', 'B', null, { color: 'green', drop1: true }),
    table(2, 'C', '', 'p1'),
    table(3, 'D', 'E', { p1: 0, p2: 0, draws: 0 }),
  ], policy)
  assert.equal(result.unresolved.length, 3)
  assert.throws(() => normalizePolicy({ ...policy, win: -1 }), /积分规则/)
})

test('explicit imported 0:0 MTG draw counts, but manual empty score does not', () => {
  const result = settleTables([
    table(1, 'A', 'B', { p1: 0, p2: 0, draws: 0 }, { outcomeType: 'DRAW', resultSource: 'import' }),
    table(2, 'C', 'D', { p1: 0, p2: 0, draws: 0 }, { outcomeType: 'DRAW', resultSource: 'manager' }),
    table(3, 'E', 'F', { p1: 0, p2: 0, draws: 0 }, { outcomeType: 'DRAW', resultSource: 'import', drop1: true, drop2: true }),
  ], policy)
  assert.equal(result.entries.filter(entry => entry.outcome === 'draw').length, 2)
  assert.equal(result.unresolved.length, 2)
})

test('cumulative standings carry dropped players and uniquely match legacy names', () => {
  const previous = [
    { playerKey: 'name:alice', name: 'Alice', points: 6, rank: 1 },
    { playerKey: 'name:bob', name: 'Bob', points: 3, rank: 2 },
  ]
  const entries = [{ playerKey: 'id:gem:a', playerName: 'Alice', points: 3 }]
  const rows = cumulativeStandings(previous, entries)
  assert.equal(rows.find(row => row.playerKey === 'id:gem:a').points, 9)
  assert.equal(rows.find(row => row.playerKey === 'name:bob').points, 3)
  assert.equal(rows.some(row => row.playerKey === 'name:alice'), false)
  assert.equal(rows.every(row => row.rank === null), true)
})
