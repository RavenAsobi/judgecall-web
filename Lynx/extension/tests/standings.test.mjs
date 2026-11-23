import test from 'node:test'
import assert from 'node:assert/strict'
import { parseCsv, suggestColumns, suggestIdNamespace, prepareStandings } from '../src/popup/standings.ts'

test('Melee standings CSV maps exact points and keeps Wizards Account ID separate', () => {
  const grid = parseCsv('First Name,Last Name,Final Points,Wizards Account ID,Final Rank\r\n"Ada, Jr",Lovelace,9,W-42,2\r\nBob,Smith,6,W-43,5\r\n')
  const columns = suggestColumns(grid.headers)
  assert.deepEqual(columns, { name: 0, lastName: 1, id: 3, points: 2, rank: 4 })
  const namespace = suggestIdNamespace('melee', grid.headers[columns.id])
  assert.equal(namespace, 'wizards-account')
  const output = prepareStandings(grid, columns, 'melee', 3, namespace)
  assert.equal(output.schema, 'lynx-standings-v1')
  assert.equal(output.roundCompleted, 3)
  assert.deepEqual(output.rows[0], { name: 'Ada, Jr Lovelace', playerId: 'W-42', points: 9, rank: 2 })
})

test('visible table can provide ID from name link without ID column', () => {
  const grid = { headers: ['Player', 'Points'], rows: [{ cells: ['Alice', '4'], ids: ['12345', null] }] }
  const output = prepareStandings(grid, suggestColumns(grid.headers), 'gem', 4, 'gem-player-id')
  assert.equal(output.rows[0].playerId, '12345')
})

test('missing ID is preserved as null rather than fabricated from a name', () => {
  const grid = { headers: ['姓名', '积分'], rows: [{ cells: ['张三', '0'] }] }
  const output = prepareStandings(grid, suggestColumns(grid.headers), 'eventlink', 0, 'eventlink-player-id')
  assert.equal(output.rows[0].playerId, null)
  assert.equal(output.rows[0].points, 0)
})

test('invalid points, duplicate IDs and wrong round are rejected', () => {
  const grid = parseCsv('Name,Points,ID\nAlice,3,x\nBob,6,x\n')
  const columns = suggestColumns(grid.headers)
  assert.throws(() => prepareStandings(grid, columns, 'melee', 1, 'melee-player-card'), /重复/)
  assert.throws(() => prepareStandings(grid, columns, 'melee', -1, 'melee-player-card'), /轮次/)
  const unique = parseCsv('Name,Points,ID\nAlice,3,x\nBob,6,y\n')
  assert.throws(() => prepareStandings(unique, columns, 'melee', 1, ''), /命名空间/)
  const bad = parseCsv('Name,Points\nAlice,3.5\n')
  assert.throws(() => prepareStandings(bad, suggestColumns(bad.headers), 'gem', 1, 'gem-player-id'), /积分/)
})

test('CSV parser handles quoted line breaks and rejects an unclosed quote', () => {
  const grid = parseCsv('Name,Points\n"Alice\nSmith",3\n')
  assert.equal(grid.rows[0].cells[0], 'Alice\nSmith')
  assert.throws(() => parseCsv('Name,Points\n"Alice,3'), /引号/)
})
