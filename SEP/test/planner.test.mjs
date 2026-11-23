import { test } from 'node:test'
import assert from 'node:assert/strict'
import { changeEvent, makeEvent } from '../model.mjs'
import { allocateTables, applyZoneRanges, currentRange, currentRound, dropTable, forecastsFor, generateLayout, hasSavedLayout, localNow, occupiedTables, parseTableNumbers, plansFor, roundMinutes, roundRange, snake, stateSignature, tablesIn, zoneRange } from '../src/planner.mjs'

const eventInfo = { name: 'Test open', lead: 'Head judge', game: 'FAB', timeZone: 'Asia/Hong_Kong' }
const dayInfo = { date: '2026-11-19', seats: 2, tables: 12 }
const matchInfo = { name: 'Constructed', lead: 'Judge', time: '09:00', capacity: 12, players: 9, first: null, format: 'Classic Constructed', minutes: 55, rounds: 3 }

function fixture() {
  const event = makeEvent({ ...eventInfo, days: [dayInfo] })
  const day = event.days[0]
  function apply(action, values) { return changeEvent(event, { action, dayId: day.id, ...values }) }
  return { event, day, apply }
}

test('format defaults, ceil division, midnight and creation order for equal start times', () => {
  const { day, apply } = fixture()
  for (const time of ['09:00', '09:00', '23:50']) apply('addMatch', { ...matchInfo, time })
  const [first, same, late] = day.matches
  const plans = plansFor(day)
  assert.equal(roundMinutes('FAB', 'Living Legend'), 55)
  assert.equal(roundMinutes('FAB', 'Silver Age'), 35)
  assert.equal(roundMinutes('MTG', 'Commander'), 50)
  assert.equal(plans.get(first.id).last, 5)
  assert.equal(plans.get(same.id).first, 6)
  assert.equal(plans.get(late.id).first, 11)
  assert.equal(plans.get(late.id).end, '2026-11-20T03:05')
})

test('same-time suggestions follow the highest preceding tail, including live allocations', () => {
  const { day, apply } = fixture()
  apply('editDay', { ...dayInfo, tables: 128 })
  apply('addMatch', { ...matchInfo, players: 89, capacity: 224 })
  apply('round', { matchId: day.matches[0].id, first: 1, round: 1 })
  apply('addMatch', { ...matchInfo, players: 18, capacity: 32 })
  apply('addMatch', { ...matchInfo, players: 4, first: 10 })
  apply('addMatch', { ...matchInfo, players: 7 })
  const [, second, manual, last] = day.matches
  const plans = plansFor(day)
  assert.deepEqual([plans.get(second.id).first, plans.get(second.id).last], [46, 54])
  assert.equal(plans.get(manual.id).first, 10)
  assert.equal(plans.get(last.id).first, 55)
  apply('round', { matchId: second.id, first: 46, round: 1 })
  assert.equal(occupiedTables(day).size, 54)
})

test('a zero-player event does not reset the suggested start for a later event', () => {
  const { day, apply } = fixture()
  apply('editDay', { ...dayInfo, tables: 128 })
  apply('addMatch', { ...matchInfo, time: '09:00', players: 32, capacity: 32 })
  apply('addMatch', { ...matchInfo, name: 'Silver Age - Double Prize', time: '11:00', players: 0, capacity: 16 })
  apply('addMatch', { ...matchInfo, name: 'Sealed Deck', time: '12:00', players: 8, capacity: 16 })
  const [, silverAge, sealed] = day.matches
  const plans = plansFor(day)
  assert.deepEqual([plans.get(silverAge.id).first, plans.get(silverAge.id).last], [17, null])
  assert.deepEqual([plans.get(sealed.id).first, plans.get(sealed.id).last], [17, 20])
  assert.equal(forecastsFor(day, plans).get(sealed.id).playersShort, false)
})

test('a later low-table assignment does not erase a higher tail from an earlier round', () => {
  const { day, apply } = fixture()
  apply('editDay', { ...dayInfo, tables: 128 })
  apply('addMatch', { ...matchInfo, time: '09:00', players: 20, capacity: 20 })
  const [early] = day.matches
  apply('round', { matchId: early.id, first: 50, round: 1 })
  apply('addMatch', { ...matchInfo, time: '11:00', first: 6, players: 10 })
  apply('addMatch', { ...matchInfo, time: '12:00', players: 8 })
  const [, manual, later] = day.matches
  assert.equal(plansFor(day).get(manual.id).first, 6)
  assert.equal(plansFor(day).get(later.id).first, 60)
  apply('end', { matchId: early.id, confirmation: 'End' })
  assert.equal(plansFor(day).get(later.id).first, 11)
})

test('capacity, registrations, and releases use actual starts and finishes', () => {
  const { day, apply } = fixture()
  apply('addMatch', matchInfo)
  apply('addMatch', { ...matchInfo, time: '14:00', first: 1, players: 2 })
  const [first, later] = day.matches
  const forecast = now => forecastsFor(day, plansFor(day), now).get(later.id)
  assert.equal(forecast().salesLimit, 0)
  assert.equal(forecast().bestLimit, 12)
  first.actualStart = '2026-11-19T09:00'
  assert.equal(forecast('2026-11-19T12:00').salesLimit, 24)
  assert.equal(forecast('2026-11-19T13:00').salesLimit, 0)
  first.endedAt = '2026-11-19T12:30'
  assert.equal(forecast('2026-11-19T13:00').salesLimit, 24)
  later.capacity = 26
  assert.equal(forecast().capacityShort, true)
  assert.equal(forecast().playersShort, false)
})

test('ended side events release tables and stop pushing later start-table suggestions forward', () => {
  const { day, apply } = fixture()
  apply('addMatch', { ...matchInfo, players: 24, capacity: 24 })
  apply('addMatch', { ...matchInfo, time: '10:00' })
  const [first, later] = day.matches
  apply('round', { matchId: first.id, first: 1, round: 1 })
  assert.equal(plansFor(day).get(later.id).first, 13)
  first.endedAt = '2026-11-19T10:45'
  const plans = plansFor(day)
  assert.equal(plans.get(later.id).first, 1)
  for (const time of [null, '2026-11-19T10:10', '2026-11-19T10:50']) {
    const forecast = forecastsFor(day, plans, time).get(later.id)
    assert.equal(forecast.salesLimit, 24)
    assert.equal(forecast.playersShort, false)
    assert.equal(forecast.capacityShort, false)
  }
  assert.equal(occupiedTables(day).size, 0)
})

test('unfilled registrations affect capacity risk separately and identify a usable alternative', () => {
  const { day, apply } = fixture()
  apply('addMatch', { ...matchInfo, players: 2, capacity: 16 })
  apply('addMatch', { ...matchInfo, time: '10:00', players: 8, capacity: 8 })
  const [first, later] = day.matches
  const now = '2026-11-19T09:45'
  const warning = () => forecastsFor(day, plansFor(day), now).get(later.id)
  assert.equal(plansFor(day).get(later.id).first, 2)
  assert.equal(warning().registeredLimit, 22)
  assert.equal(warning().salesLimit, 0)
  assert.equal(warning().playersShort, false)
  assert.equal(warning().capacityShort, true)
  assert.equal(warning().alternativeFirst, 9)
  first.actualStart = '2026-11-19T09:30'
  assert.equal(warning().salesLimit, 22)
  assert.equal(warning().alternativeFirst, null)
})

test('a real assignment obstruction suggests a range that allows for marked tables', () => {
  const { day, apply } = fixture()
  apply('addMatch', { ...matchInfo, players: 6, capacity: 6 })
  apply('addMatch', { ...matchInfo, time: '10:00', first: 1, players: 16, capacity: 16 })
  const [first, later] = day.matches
  apply('round', { matchId: first.id, first: 1, round: 1 })
  day.tableStates[4] = { kind: 'maintenance' }
  const forecast = forecastsFor(day, plansFor(day), '2026-11-19T10:00').get(later.id)
  assert.equal(forecast.registeredLimit, 0)
  assert.equal(forecast.playersShort, true)
  assert.equal(forecast.alternativeFirst, 5)
})

test('only ended side events can be deleted and replacement side events retain distinct colors', () => {
  const { day, apply } = fixture()
  for (const name of ['Keep A', 'Delete', 'Keep B']) apply('addMatch', { ...matchInfo, name })
  const [first, target, last] = day.matches
  assert.throws(() => apply('deleteMatch', { matchId: target.id }), /只有已结束/)
  apply('end', { matchId: target.id, confirmation: '结束' })
  apply('deleteMatch', { matchId: target.id })
  assert.deepEqual(day.matches.map(match => match.id), [first.id, last.id])
  apply('addMatch', { ...matchInfo, name: 'New' })
  assert.equal(new Set(day.matches.map(match => match.color)).size, 3)
})

test('deleting a day requires a confirmation and preserves the other event days', () => {
  const { event, day, apply } = fixture()
  apply('addMatch', matchInfo)
  apply('addDay', { ...dayInfo, date: '2026-11-20' })
  const other = event.days[1]
  assert.throws(() => apply('deleteDay', { confirmation: 'Delete this day' }), { status: 400 })
  assert.deepEqual(event.days, [day, other])
  apply('deleteDay', { confirmation: 'dElEtE' })
  assert.deepEqual(event.days, [other])
  assert.throws(() => apply('deleteDay', { confirmation: '删除' }), { status: 404 })
  changeEvent(event, { action: 'deleteDay', dayId: other.id, confirmation: '删除' })
  assert.deepEqual(event.days, [])
  apply('addDay', dayInfo)
  assert.equal(event.days.length, 1)
  assert.equal(event.days[0].date, day.date)
  assert.deepEqual(event.days[0].matches, [])
})

test('rounds reject overlap, use latest range for suggestion and release dropped players and finished tables', () => {
  const { event, day, apply } = fixture()
  apply('addMatch', matchInfo)
  apply('addMatch', { ...matchInfo, time: '11:00' })
  const [first, second] = day.matches
  apply('round', { matchId: first.id, first: 4, players: 2, round: 1 })
  assert.deepEqual(currentRange(first, day), { first: 4, last: 8 })
  assert.equal(plansFor(day).get(second.id).first, 9)
  assert.throws(() => apply('round', { matchId: second.id, first: 7, round: 1 }), /重叠/)
  assert.throws(() => apply('round', { matchId: first.id, first: 4, round: 1 }), /该轮/)
  assert.throws(() => apply('actualStart', { matchId: first.id, start: '2099-01-01T08:00' }), /不能晚于/)
  apply('actualStart', { matchId: first.id, start: localNow(event.timeZone) })
  apply('round', { matchId: first.id, first: 4, players: 3, round: 2 })
  assert.equal(occupiedTables(day).size, 2)
  assert.equal(plansFor(day).get(second.id).first, 6)
  assert.throws(() => apply('end', { matchId: first.id, confirmation: 'yes' }), /请输入/)
  apply('end', { matchId: first.id, confirmation: 'eNd' })
  assert.equal(occupiedTables(day).size, 0)
  assert.ok(first.endedAt)
})

test('balanced zones, four corners, drag into empty cell and unique table numbers', () => {
  const { day, apply } = fixture()
  const zones = generateLayout(128, 4)
  assert.deepEqual(zones.map(zone => zone.tiles.length), [32, 32, 32, 32])
  assert.equal(generateLayout(2048, 1)[0].rows, 128)
  assert.deepEqual(snake([1, 2, 3, 4, 5], 2, 3, 'br'), [4, 5, null, 3, 2, 1])
  const unequal = generateLayout(13, 2)
  assert.deepEqual(unequal.map(zone => zone.tiles.length), [7, 6])
  unequal[1].tiles = snake(unequal[1].tiles, 2, 6, 'tl')
  unequal[1].rows = 2
  const moved = dropTable(unequal, { zone: 0, cell: 0 }, { zone: 1, cell: 11 })
  assert.equal(unequal[0].tiles[0], 1)
  assert.equal(moved[0].tiles[0], null)
  assert.equal(moved[1].tiles[11], 1)
  apply('layout', { tables: 13, zones: moved })
  assert.equal(day.tables, 13)
  moved[0].tiles[0] = 1
  assert.throws(() => apply('layout', { tables: 13, zones: moved }), /重复/)
})

test('uneven ranges resize zones, retain untouched layouts and reject duplicate or missing tables', () => {
  const layout = { tables: 128, zones: generateLayout(128, 4) }
  layout.zones[0].corner = 'br'
  const zones = applyZoneRanges(layout, { 0: { first: 1, last: 40 }, 1: { first: 41, last: 64 } })
  assert.deepEqual(zones.map(zoneRange), [{ first: 1, last: 40 }, { first: 41, last: 64 }, { first: 65, last: 96 }, { first: 97, last: 128 }])
  assert.equal(zones[0].rows, 5)
  assert.equal(zones[0].tiles.at(-1), 1)
  assert.equal(zones[1].rows, 3)
  assert.equal(zones[2], layout.zones[2])
  assert.throws(() => applyZoneRanges(layout, { 0: { first: 1, last: 40 } }), { message: 'duplicateTable' })
  assert.throws(() => applyZoneRanges(layout, { 0: { first: 1, last: 30 } }), { message: 'missingTable' })
  assert.throws(() => applyZoneRanges(layout, { 0: { first: 40, last: 39 } }), { message: 'invalidRange' })
})

test('status review extends the range, honors include, and invalidates decisions when a mark changes', () => {
  const { day, apply } = fixture()
  const unavailable = { kind: 'unavailable', label: 'Calling Top 8' }
  const maintenance = { kind: 'maintenance' }
  assert.equal(hasSavedLayout(day), false)
  apply('layout', { tables: day.tables, zones: day.zones, tableStates: { 5: unavailable, 9: maintenance } })
  assert.equal(hasSavedLayout(day), true)
  assert.deepEqual(allocateTables(day, 1, 8, {}, 'ask').warning, { table: 5, state: unavailable })
  const skip5 = { 5: { choice: 'skip', state: stateSignature(unavailable) } }
  assert.equal(allocateTables(day, 1, 8, skip5, 'ask').warning.table, 9)
  const include5 = { 5: { choice: 'include', state: stateSignature(unavailable) } }
  assert.equal(allocateTables(day, 1, 8, include5, 'ask').last, 8)
  const choices = { ...skip5, 9: { choice: 'include', state: stateSignature(maintenance) } }
  const expected = [1, 2, 3, 4, 6, 7, 8, 9]
  assert.deepEqual([...tablesIn(allocateTables(day, 1, 8, choices, 'ask'))], expected)
  apply('addMatch', { ...matchInfo, players: 16, planChoices: choices })
  const matchId = day.matches[0].id
  assert.equal(plansFor(day).get(matchId).last, 9)
  assert.throws(() => apply('round', { matchId, first: 1, round: 1 }), /先处理/)
  apply('round', { matchId, first: 1, round: 1, choices })
  assert.deepEqual([...occupiedTables(day).keys()], expected)
  day.tableStates[5] = { kind: 'fixed' }
  assert.equal(allocateTables(day, 1, 8, choices, 'ask').warning.table, 5)
  assert.deepEqual([...occupiedTables(day).keys()], expected)
})

test('correcting a round updates the round number, player counts and live allocations atomically', () => {
  const { day, apply } = fixture()
  apply('addMatch', matchInfo)
  apply('addMatch', { ...matchInfo, name: 'Other', players: 4 })
  const [first, second] = day.matches
  apply('round', { matchId: first.id, first: 1, round: 1 })
  apply('round', { matchId: second.id, first: 9, round: 1 })
  const initial = first.history[0]
  const correction = { matchId: first.id, first: 6, round: 2, previousRound: 1, players: 11, registered: 11 }
  assert.throws(() => apply('correctRound', correction), /重叠/)
  assert.equal(first.history[0], initial)
  assert.equal(first.players, 9)
  apply('correctRound', { ...correction, first: 2 })
  assert.equal(currentRound(first), 2)
  assert.equal(first.history.length, 1)
  assert.equal(first.history[0].at, initial.at)
  assert.equal(first.players, 11)
  assert.deepEqual(currentRange(first, day), { first: 2, last: 7 })
  assert.throws(() => apply('round', { matchId: first.id, first: 2, round: 2, players: 11 }), /该轮/)
  apply('round', { matchId: first.id, first: 2, round: 3, players: 8 })
  assert.equal(currentRound(first), 3)
})

test('round correction can replace skipped Feature Match tables with included tables and retain their label', () => {
  const { day, apply } = fixture()
  const featureMatch = { kind: 'unavailable', label: 'Feature Match' }
  const featureTables = [1, 2, 3, 4, 5, 6, 7, 8]
  const choicesFor = choice => Object.fromEntries(featureTables.map(table => [table, { choice, state: stateSignature(featureMatch) }]))
  const tableStates = Object.fromEntries(featureTables.map(table => [table, featureMatch]))
  apply('layout', { tables: 142, zones: generateLayout(142, 1), tableStates })
  assert.deepEqual(allocateTables(day, 1, 128, {}, 'ask').warning, { table: 1, through: 8, state: featureMatch })
  apply('addMatch', { ...matchInfo, name: 'Showdown', players: 256, capacity: 256 })
  const [showdown] = day.matches
  apply('round', { matchId: showdown.id, round: 1, first: 1, choices: choicesFor('skip') })

  const original = showdown.history[0]
  const skippedRange = currentRange(showdown, day)
  assert.equal(original.first, 1)
  assert.equal(skippedRange.first, 9)
  assert.equal(skippedRange.last, 136)
  assert.deepEqual(skippedRange.skipped, featureTables)
  assert.equal(occupiedTables(day).size, 128)
  assert.equal(occupiedTables(day).has(8), false)
  assert.equal(occupiedTables(day).get(9).id, showdown.id)

  apply('addMatch', { ...matchInfo, name: 'Other match', players: 2 })
  const other = day.matches[1]
  const include = choicesFor('include')
  apply('round', { matchId: other.id, round: 1, first: 1, choices: { 1: include[1] } })
  const correction = { matchId: showdown.id, previousRound: 1, round: 1, first: 1, players: 256, registered: 256, choices: include }
  assert.throws(() => apply('correctRound', correction), /重叠/)
  assert.equal(showdown.history[0], original)
  assert.equal(occupiedTables(day).get(1).id, other.id)

  apply('end', { matchId: other.id, confirmation: 'END' })
  apply('correctRound', correction)
  const includedRange = currentRange(showdown, day)
  assert.equal(includedRange.first, 1)
  assert.equal(includedRange.last, 128)
  assert.deepEqual(includedRange.skipped ?? [], [])
  const included = [{ first: 1, last: 8, ...featureMatch }]
  assert.deepEqual(includedRange.included, included)
  assert.equal(occupiedTables(day).size, 128)
  assert.equal(occupiedTables(day).get(1).id, showdown.id)
  assert.equal(occupiedTables(day).has(129), false)
  assert.equal(showdown.history.length, 1)
  assert.equal(showdown.history[0].at, original.at)

  apply('layout', { tables: day.tables, zones: day.zones, tableStates: {} })
  assert.deepEqual(currentRange(showdown, day).included, included)
})

test('round ranges show the first assigned table for saved rounds with leading and interior skips', () => {
  const { day } = fixture()
  const skipped = [1, 2, 5]
  const recordedStatus = { kind: 'unavailable', label: 'Feature Match: Stream' }
  const include = { choice: 'include', state: stateSignature(recordedStatus) }
  const saved = { first: 1, players: 8, skipped, choices: { 3: include, 4: include, 6: include } }
  const range = roundRange(saved, day)
  assert.equal(range.first, 3)
  assert.equal(range.last, 7)
  assert.deepEqual(range.skipped, skipped)
  assert.deepEqual([...tablesIn(range)], [3, 4, 6, 7])
  assert.deepEqual(range.included, [{ first: 3, last: 4, ...recordedStatus }, { first: 6, last: 6, ...recordedStatus }])
  assert.equal(saved.first, 1)
})

test('batch table status input supports comma-separated ranges and bounds', () => {
  assert.deepEqual(parseTableNumbers('1-3, 2, 6，8–9', 12), [1, 2, 3, 6, 8, 9])
  for (const value of ['', '8-1', '1,13', '1,', '0', '2x']) assert.throws(() => parseTableNumbers(value, 12), /invalidTableNumbers/)
})

test('enforces day and match counts, date validity, format and distinct event colors', () => {
  assert.throws(() => makeEvent({ ...eventInfo, days: [{ ...dayInfo, date: '2026-02-30' }] }), /日期无效/)
  const { day, apply } = fixture()
  for (let i = 20; i <= 25; i++) apply('addDay', { ...dayInfo, date: `2026-11-${i}` })
  assert.throws(() => apply('addDay', { ...dayInfo, date: '2026-11-26' }), /最多 7/)
  assert.throws(() => apply('addMatch', { ...matchInfo, format: 'Standard' }), /赛制/)
  for (let i = 0; i < 48; i++) apply('addMatch', matchInfo)
  assert.equal(new Set(day.matches.map(match => match.color)).size, 48)
  assert.throws(() => apply('addMatch', matchInfo), /最多 48/)
})
