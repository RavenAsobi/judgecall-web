export const FORMATS = {
  FAB: ['Classic Constructed', 'Silver Age', 'Sealed', 'Draft', 'Living Legend', 'Others'],
  MTG: ['Sealed', 'Draft', 'Standard', 'Pioneer', 'Modern', 'Legacy', 'Vintage', 'Commander', '1v1 Commander', 'Pre-Modern', 'Others'],
}
export const CORNERS = [['tl', '左上'], ['tr', '右上'], ['bl', '左下'], ['br', '右下']]
export const TABLE_STATES = { free: '空闲', fixed: '固定座位', maintenance: '维护中', unavailable: '不可用' }
export const LIMITS = { days: 7, matches: 48, tables: 2048, zones: 32, dimension: 128, players: 100000, roundMinutes: 1440, rounds: 99 }

export const roundMinutes = (game, format) =>
  game === 'MTG' ? 50 : ['Classic Constructed', 'Living Legend'].includes(format) ? 55 : 35

export const colorFor = index => [
  '#2563c9', '#b45c13', '#804cc4', '#087663', '#b32849', '#625222',
  '#34769c', '#985c83', '#4f7b24', '#604bcc', '#b34735', '#257b88',
][index] ?? `hsl(${Math.round((index * 137.508 + 17) % 360)} ${[55, 78, 94][Math.floor(index / 12) - 1]}% ${[31, 42, 54][index % 3]}%)`

export const tablesFor = (players, day) => Math.ceil(players / day.seats)
export const tailFor = (first, tables) => tables > 0 ? first + tables - 1 : null
export const plannedStart = (day, match) => `${day.date}T${match.time}`
export const ordered = day => [...day.matches].sort((a, b) => a.time.localeCompare(b.time))

export function addMinutes(localTime, minutes) {
  return new Date(Date.parse(localTime + 'Z') + minutes * 60000).toISOString().slice(0, 16)
}

export function estimate(start, match) {
  return addMinutes(start, (match.minutes + 10) * match.rounds)
}

export function localNow(timeZone) {
  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone, dateStyle: 'short', timeStyle: 'short', hourCycle: 'h23',
  })
  return formatter.format(new Date()).replace(' ', 'T')
}

export function formatTime(localTime, date) {
  if (!localTime) return '—'
  return localTime.startsWith(date + 'T') ? localTime.slice(11) : localTime.replace('T', ' ')
}

export function currentRange(match, day) {
  const round = match.history.at(-1)
  return round ? roundRange(round, day) : null
}

export const currentRound = match => match.history.at(-1)?.round ?? match.history.length

export function firstAssignedTable(range) {
  if (range?.last == null) return null
  let first = range.first
  for (const table of range.skipped ?? []) {
    if (table > first) break
    if (table === first) first++
  }
  return first <= range.last ? first : null
}

export function formatTableRange(range) {
  const first = firstAssignedTable(range)
  return first == null ? '—' : `${first}–${range.last}`
}

export function roundRange(round, day) {
  const skipped = round.skipped ?? []
  const range = {
    first: round.first, last: tailFor(round.first, tablesFor(round.players, day) + skipped.length),
    ...(skipped.length ? { skipped } : {}),
  }
  range.first = firstAssignedTable(range) ?? round.first
  const included = round.included ?? legacyIncludedTables(round.choices, range)
  if (included.length) range.included = included
  return range
}

export function* tablesIn(range) {
  if (!range || range.last == null) return
  const skipped = new Set(range.skipped)
  for (let table = range.first; table <= range.last; table++) if (!skipped.has(table)) yield table
}

export const stateSignature = state => `${state.kind}:${state.label ?? ''}`

function appendIncluded(included, table, state) {
  const previous = included.at(-1)
  const label = state.label || undefined
  if (previous?.last === table - 1 && previous.kind === state.kind && previous.label === label) {
    previous.last = table
  } else {
    included.push({ first: table, last: table, kind: state.kind, ...(label ? { label } : {}) })
  }
}

function legacyIncludedTables(choices, range) {
  const included = []
  if (!choices) return included
  for (const table of tablesIn(range)) {
    const selected = choices[table]
    if (selected?.choice !== 'include') continue
    const separator = selected.state.indexOf(':')
    if (separator < 0) continue
    const kind = selected.state.slice(0, separator)
    if (kind === 'free' || !Object.hasOwn(TABLE_STATES, kind)) continue
    appendIncluded(included, table, { kind, label: selected.state.slice(separator + 1) })
  }
  return included
}

export function tableDecision(day, table, choices) {
  const state = day.tableStates?.[table]
  if (!state) return 'include'
  const selected = choices?.[table]
  return selected?.state === stateSignature(state) ? selected.choice : null
}

export function allocateTables(day, first, count, choices, mode = 'include') {
  const skipped = []
  const included = []
  let last = tailFor(first, count)
  if (last == null) return { first, last, skipped }
  for (let table = first; table <= Math.min(last, day.tables); table++) {
    const state = day.tableStates?.[table]
    const decision = tableDecision(day, table, choices)
    if (!decision && mode === 'ask') {
      const signature = stateSignature(state)
      let through = table
      const limit = Math.min(last, day.tables)
      while (through < limit) {
        const next = day.tableStates[through + 1]
        if (!next || stateSignature(next) !== signature || tableDecision(day, through + 1, choices)) break
        through++
      }
      return { warning: { table, state, ...(through > table ? { through } : {}) } }
    }
    if ((decision ?? mode) === 'skip') {
      skipped.push(table)
      last++
    } else if (decision === 'include' && state) {
      appendIncluded(included, table, state)
    }
  }
  return { first, last, skipped, ...(included.length ? { included } : {}) }
}

export function parseTableNumbers(value, total) {
  const result = new Set()
  for (const group of value.split(/[,，]/)) {
    const match = /^(\d+)(?:\s*[-–—]\s*(\d+))?$/.exec(group.trim())
    const first = Number(match?.[1])
    const last = Number(match?.[2] ?? match?.[1])
    if (!match || first < 1 || first > last || last > total) throw new RangeError('invalidTableNumbers')
    for (let table = first; table <= last; table++) result.add(table)
  }
  return [...result]
}

export function hasSavedLayout(day) {
  return day.layoutSaved ?? (day.zones.length !== 1 || JSON.stringify(day.zones) !== JSON.stringify(generateLayout(day.tables, 1)))
}

export function plansFor(day) {
  const result = new Map()
  let lastReservedTable = 0
  for (const match of ordered(day)) {
    const fallback = match.endedAt ? match.history[0]?.first ?? 1 : lastReservedTable + 1
    const first = match.first ?? fallback
    const tables = tablesFor(match.players, day)
    const allocation = allocateTables(day, first, tables, match.planChoices)
    result.set(match.id, {
      ...allocation, tables, end: estimate(plannedStart(day, match), match),
      firstFrom: match.first != null ? '指定桌号' : first === 1 ? '首桌' : '接续已排桌号',
    })
    if (match.endedAt) continue
    const current = currentRange(match, day)
    const reservedLast = current ? current.last : allocation.last
    lastReservedTable = Math.max(lastReservedTable, reservedLast ?? 0)
  }
  return result
}

export function occupiedTables(day) {
  const occupied = new Map()
  for (const match of day.matches) {
    const range = currentRange(match, day)
    if (match.endedAt) continue
    for (const table of tablesIn(range)) occupied.set(table, match)
  }
  return occupied
}

function reserve(blocked, range, total) {
  if (range.last == null || range.first > total) return
  const last = Math.min(range.last, total)
  if (range.skipped?.length) {
    for (const table of tablesIn({ ...range, last })) blocked[table] = 1
  } else blocked.fill(1, range.first, last + 1)
}

function scanTables(day, match, first, blocked) {
  let atFirst = 0
  let available = 0
  let segment = 0
  let segmentFirst = 0
  let best = { first: null, count: 0 }
  let scanning = false
  for (let table = 1; table <= day.tables; table++) {
    if (table === first) scanning = true
    if (tableDecision(day, table, match.planChoices) !== 'include') continue
    if (blocked[table]) {
      segment = 0
      scanning = false
      continue
    }
    if (segment === 0) segmentFirst = table
    segment++
    if (segment > best.count) best = { first: segmentFirst, count: segment }
    available++
    if (scanning) atFirst++
  }
  return { atFirst, available, best }
}

// Pending events reserve tables in schedule order under two attendance scenarios.
// Live events use their current assignment and only project release from a confirmed start.
export function forecastsFor(day, plans, now = null) {
  const warnings = new Map()
  const matches = ordered(day)
  for (const [index, match] of matches.entries()) {
    if (match.history.length || match.endedAt) continue
    const scheduled = plannedStart(day, match)
    const start = now && now > scheduled ? now : scheduled
    const registered = new Uint8Array(day.tables + 1)
    const soldOut = new Uint8Array(day.tables + 1)
    for (const [otherIndex, other] of matches.entries()) {
      if (other === match || other.endedAt) continue
      const active = currentRange(other, day)
      const intended = plannedStart(day, other)
      const firstRound = other.history[0]?.at
      const begins = other.actualStart ?? (firstRound && firstRound < intended ? firstRound : intended)
      const estimated = other.actualStart ? estimate(other.actualStart, other) : null
      const release = estimated && (!now || estimated > now) ? estimated : null
      if (begins > start || (release && release <= start)) continue
      if (!active && !other.actualStart && otherIndex >= index) continue
      const { first } = plans.get(other.id)
      const current = active ?? allocateTables(day, first, tablesFor(other.players, day), other.planChoices, 'skip')
      const full = !active && !other.actualStart
        ? allocateTables(day, first, tablesFor(Math.max(other.players, other.capacity), day), other.planChoices, 'skip')
        : current
      reserve(registered, current, day.tables)
      reserve(soldOut, full, day.tables)
    }
    const first = plans.get(match.id).first
    const current = scanTables(day, match, first, registered)
    const full = scanTables(day, match, first, soldOut)
    const registeredLimit = current.atFirst * day.seats
    const salesLimit = full.atFirst * day.seats
    const playersShort = match.players > registeredLimit
    const capacityShort = match.capacity > salesLimit
    const best = playersShort ? current.best : full.best
    const needed = playersShort ? match.players : match.capacity
    warnings.set(match.id, {
      registeredLimit, salesLimit, playersShort, capacityShort,
      bestLimit: full.best.count * day.seats,
      available: full.available,
      alternativeFirst: (playersShort || capacityShort) && best.count * day.seats >= needed ? best.first : null,
    })
  }
  return warnings
}

export function snake(tiles, rows, columns, corner) {
  const numbers = tiles.filter(Boolean).toSorted((a, b) => a - b)
  const grid = Array(rows * columns).fill(null)
  numbers.forEach((table, index) => {
    const row = Math.floor(index / columns)
    const col = index % columns
    const y = corner[0] === 'b' ? rows - 1 - row : row
    const reverse = (row % 2 === 1) !== (corner[1] === 'r')
    const x = reverse ? columns - 1 - col : col
    grid[y * columns + x] = table
  })
  return grid
}

export function generateLayout(total, zones) {
  let next = 1
  return Array.from({ length: zones }, (_, index) => {
    const count = Math.floor(total / zones) + Number(index < total % zones)
    const columns = Math.min(count, Math.max(8, Math.ceil(count / LIMITS.dimension)))
    const rows = Math.ceil(count / columns)
    const tiles = Array.from({ length: count }, () => next++)
    return { rows, columns, corner: 'tl', tiles: snake(tiles, rows, columns, 'tl') }
  })
}

export function resizeZone(zone, rows, columns, corner) {
  return { rows, columns, corner, tiles: snake(zone.tiles, rows, columns, corner) }
}

export function zoneRange(zone) {
  const numbers = zone.tiles.filter(Boolean)
  const first = Math.min(...numbers)
  const last = Math.max(...numbers)
  return numbers.length && last - first + 1 === numbers.length ? { first, last } : { first: '', last: '' }
}

export function applyZoneRanges(layout, ranges) {
  const claimed = new Uint8Array(layout.tables + 1)
  let cells = 0
  const zones = layout.zones.map((zone, index) => {
    const current = zone.tiles.filter(Boolean)
    const range = ranges[index]
    if (range && (
      !Number.isInteger(range.first) || !Number.isInteger(range.last) ||
      range.first < 1 || range.last > layout.tables || range.first > range.last
    )) {
      throw new RangeError('invalidRange', { cause: { index, max: layout.tables } })
    }
    const numbers = range
      ? Array.from({ length: range.last - range.first + 1 }, (_, offset) => range.first + offset)
      : current
    for (const table of numbers) {
      if (claimed[table]) throw new RangeError('duplicateTable', { cause: { table, index, other: claimed[table] - 1 } })
      claimed[table] = index + 1
    }
    const existing = new Set(current)
    const changed = numbers.length !== existing.size || numbers.some(table => !existing.has(table))
    const columns = Math.max(zone.columns, Math.ceil(numbers.length / LIMITS.dimension))
    const extraRows = Math.max(0, zone.rows - Math.ceil(current.length / zone.columns))
    const rows = Math.min(LIMITS.dimension, Math.ceil(numbers.length / columns) + extraRows)
    const result = changed ? resizeZone({ tiles: numbers }, rows, columns, zone.corner) : zone
    cells += result.tiles.length
    if (cells > 8192) throw new RangeError('tooManyCells')
    return result
  })
  const missing = claimed.indexOf(0, 1)
  if (missing !== -1) throw new RangeError('missingTable', { cause: { table: missing } })
  return zones
}

export function dropTable(zones, source, target) {
  if (source.zone === target.zone && source.cell === target.cell) return zones
  const result = zones.map((zone, index) => [source.zone, target.zone].includes(index)
    ? { ...zone, tiles: [...zone.tiles] } : zone)
  const before = result[source.zone].tiles
  const after = result[target.zone].tiles
  ;[before[source.cell], after[target.cell]] = [after[target.cell], before[source.cell]]
  return result
}
