import test from 'node:test'
import assert from 'node:assert/strict'
import { hasReportedResult, mtgResultFromImport, tablesForFirstImport } from '../src/import-utils.js'

const table = number => ({ number, color: 'white', p1: '', p2: '', result: null,
  timeExt: 0, watchedBy: null, drop1: false, drop2: false, greenManual: false, focus: false })

test('first import 100→50 uses exactly 50 imported tables, including unreported rows', () => {
  const tables = Array.from({ length: 100 }, (_, i) => table(i + 1))
  const imported = Array.from({ length: 50 }, (_, i) => i + 1)
  const result = tablesForFirstImport(tables, imported, table)
  assert.equal(result.length, 50)
  assert.equal(result.at(-1).number, 50)
  assert.equal(result[0], tables[0])
})

test('first import 100→200 adds every imported table', () => {
  const tables = Array.from({ length: 100 }, (_, i) => table(i + 1))
  const imported = Array.from({ length: 200 }, (_, i) => i + 1)
  const result = tablesForFirstImport(tables, imported, table)
  assert.equal(result.length, 200)
  assert.equal(result.at(-1).number, 200)
  assert.equal(result[99], tables[99])
})

test('first import follows exact non-contiguous JSON table list and reverse order', () => {
  const result = tablesForFirstImport([table(20), table(19), table(18)], [20, 17], table, true)
  assert.deepEqual(result.map(item => item.number), [20, 17])
})

test('EventLink imported 0:0 draw is reported, but an empty manual score is not', () => {
  const result = mtgResultFromImport({ result: 'DRAW', p1Wins: 0, p2Wins: 0, draws: 0 })
  assert.deepEqual(result, { p1: 0, p2: 0, draws: 0 })
  assert.equal(hasReportedResult({ result, resultSource: 'import', color: 'green' }), true)
  assert.equal(hasReportedResult({ result, resultSource: 'manager', color: 'white' }), false)
})
