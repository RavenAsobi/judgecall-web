import test from 'node:test'
import assert from 'node:assert/strict'
import { prepareImportJson, summarizeMatches } from '../src/popup/import-policy.ts'

const row = (tableNumber, result = null) => ({
  game: 'mtg', tableNumber, playerName1: `P${tableNumber}`, playerName2: `Q${tableNumber}`,
  result, dropped1: false, dropped2: false, timeExtension: null,
  p1Wins: result ? 2 : null, p2Wins: result ? 0 : null, draws: 0,
})

test('ordinary first-round export never guesses a new-round header', () => {
  const rows = [row(1), row(2), row(3)]
  assert.deepEqual(prepareImportJson(rows, 'ordinary'), rows)
  assert.equal(prepareImportJson(rows, 'ordinary')[0].__lynxHeader, undefined)
})

test('explicit new round supports both ascending and descending configured starts', () => {
  const rows = [row(100), row(99), row(98)]
  const output = prepareImportJson(rows, 'newRound', 100)
  assert.deepEqual(output[0], { __lynxHeader: true, type: 'newRound', startTable: 100 })
  assert.equal(output.length, 4)
  assert.equal(prepareImportJson([row(1), row(2)], 'newRound', 1)[0].startTable, 1)
})

test('new-round export rejects gaps, scored rows, and mismatched start number', () => {
  assert.throws(() => prepareImportJson([row(1), row(3)], 'newRound', 1), /不连续/)
  assert.throws(() => prepareImportJson([row(1, '1WIN')], 'newRound', 1), /未回报/)
  assert.throws(() => prepareImportJson([row(1), row(2)], 'newRound', 5), /起始桌号/)
  assert.throws(() => prepareImportJson([row(1), row(2)], 'newRound'), /起始桌号/)
})

test('duplicate and invalid table numbers fail before copying', () => {
  assert.throws(() => prepareImportJson([row(1), row(1)], 'ordinary'), /重复/)
  assert.throws(() => prepareImportJson([row(0)], 'ordinary'), /无效/)
  assert.throws(() => prepareImportJson([], 'ordinary'), /未提取/)
})

test('preview reports current DOM count and missing table numbers without claiming completeness', () => {
  assert.deepEqual(summarizeMatches([row(1), row(3)]), { count: 2, min: 1, max: 3, missing: 1 })
  assert.equal(summarizeMatches([]), null)
})
