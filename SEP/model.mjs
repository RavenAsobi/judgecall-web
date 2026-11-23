import { randomUUID } from 'node:crypto'
import { translate } from './src/i18n.mjs'
import { CORNERS, FORMATS, LIMITS, TABLE_STATES, allocateTables, colorFor, currentRange, currentRound, generateLayout, localNow, tablesIn, tablesFor } from './src/planner.mjs'

export class Fault extends Error {
  constructor(status, key, values) {
    super(translate('zh', key, values))
    this.status = status
    this.key = key
    this.values = values
  }
}

export function requireThat(condition, key, status = 400, values) {
  if (!condition) throw new Fault(status, key, values)
}

export function requireDeleteConfirmation(confirmation) {
  requireThat(typeof confirmation === 'string' && /^(删除|delete)$/i.test(confirmation.trim()), '请输入「删除」或「DELETE」。')
}

function label(value, field) {
  requireThat(typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 100, '{field}须为 1 至 100 字。', 400, { field })
  return value.trim()
}

function whole(value, min, max, label) {
  requireThat(Number.isInteger(value) && value >= min && value <= max, '{field}须为 {min} 至 {max} 的整数。', 400, { field: label, min, max })
  return value
}

function dateOnly(value) {
  requireThat(typeof value === 'string' && /^\d{4}-\d\d-\d\d$/.test(value), '请选择比赛日期。')
  const date = new Date(value)
  requireThat(Number.isFinite(+date) && date.toISOString().slice(0, 10) === value, '比赛日期无效。')
  return value
}

function clock(value) {
  requireThat(typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value), '请选择有效时间。')
  return value
}

function eventInfo(input, existing) {
  requireThat(Object.hasOwn(FORMATS, input.game), '请选择 FAB 或 MTG。')
  requireThat(existing?.game === input.game || !existing?.days.some(day => day.matches.length), '已有子赛事时不能切换游戏。')
  try {
    Intl.DateTimeFormat('zh-Hans', { timeZone: input.timeZone })
    requireThat(typeof input.timeZone === 'string' && input.timeZone.length <= 80, '请选择有效的赛事时区。')
  } catch {
    throw new Fault(400, '请选择有效的赛事时区。')
  }
  requireThat(existing?.timeZone === input.timeZone || !existing?.days.some(day => day.matches.some(match => match.actualStart || match.history.length || match.endedAt)), '已登记现场操作时不能切换赛事时区。')
  return { name: label(input.name, '赛事名称'), lead: label(input.lead, '总负责人'), game: input.game, timeZone: input.timeZone }
}

function dayInfo(input, existing) {
  const tables = whole(input.tables, 1, LIMITS.tables, '总桌数')
  const seats = whole(input.seats, 1, 100, '每桌人数')
  const date = dateOnly(input.date)
  const hasRounds = existing?.matches.some(match => match.history.length)
  requireThat(!hasRounds || seats === existing.seats, '已记录轮次的比赛日不能修改每桌人数。')
  requireThat(date === existing?.date || !existing?.matches.some(match => match.actualStart || match.history.length || match.endedAt), '已登记现场操作的比赛日不能修改日期。')
  const activeTail = Math.max(0, ...(existing?.matches ?? []).filter(match => !match.endedAt)
    .map(match => currentRange(match, existing)?.last ?? 0))
  requireThat(tables >= activeTail, '当前仍占用到第 {table} 桌。请先释放这些桌位。', 400, { table: activeTail })
  if (tables === existing?.tables) return { date, tables, seats, zones: existing.zones }
  const tableStates = Object.fromEntries(Object.entries(existing?.tableStates ?? {}).filter(([table]) => +table <= tables))
  return { date, tables, seats, zones: generateLayout(tables, Math.min(existing?.zones.length ?? 1, tables)), tableStates, layoutSaved: false }
}

function numberEntries(value, tables) {
  requireThat(value && typeof value === 'object' && !Array.isArray(value), '桌位资料无效。')
  return Object.entries(value).filter(([table]) => {
    requireThat(/^[1-9]\d*$/.test(table) && +table <= LIMITS.tables, '桌位资料无效。')
    return +table <= tables
  })
}

function decisions(value, day) {
  return Object.fromEntries(numberEntries(value, day.tables).map(([table, item]) => {
    requireThat(item && ['skip', 'include'].includes(item.choice) && typeof item.state === 'string' && item.state.length <= 130, '桌位资料无效。')
    return [table, { choice: item.choice, state: item.state }]
  }))
}

function matchInfo(input, game, day, existing) {
  requireThat(FORMATS[game].includes(input.format), '请选择有效赛制。')
  return {
    name: label(input.name, '子赛事名称'),
    lead: label(input.lead, '主裁判 / 负责人'),
    time: clock(input.time),
    capacity: whole(input.capacity, 1, LIMITS.players, '赛事容量'),
    players: whole(input.players, 0, LIMITS.players, '赛事人数'),
    first: input.first == null ? null : whole(input.first, 1, Math.max(day.tables, existing?.first ?? 0), '起始桌号'),
    format: input.format,
    minutes: whole(input.minutes, 1, LIMITS.roundMinutes, '每轮标准时间'),
    rounds: whole(input.rounds, 1, LIMITS.rounds, '瑞士轮数量'),
    ...(input.planChoices == null ? {} : { planChoices: decisions(input.planChoices, day) }),
  }
}

function setLayout(day, input) {
  const tables = whole(input.tables, 1, LIMITS.tables, '总桌数')
  requireThat(Array.isArray(input.zones) && input.zones.length >= 1 && input.zones.length <= Math.min(tables, LIMITS.zones), '分区数量无效。')
  const seen = new Set()
  let cells = 0
  const zones = input.zones.map(zone => {
    requireThat(zone && typeof zone === 'object', '分区无效。')
    const rows = whole(zone.rows, 1, LIMITS.dimension, '排数')
    const columns = whole(zone.columns, 1, LIMITS.dimension, '每排桌数')
    cells += rows * columns
    requireThat(cells <= 8192, '布局最多支持 8192 个格位。')
    requireThat(CORNERS.some(([key]) => key === zone.corner) && Array.isArray(zone.tiles) && zone.tiles.length === rows * columns, '分区布局无效。')
    for (const table of zone.tiles) {
      if (table === null) continue
      whole(table, 1, tables, '桌号')
      requireThat(!seen.has(table), '第 {table} 桌重复。', 400, { table })
      seen.add(table)
    }
    return { rows, columns, corner: zone.corner, tiles: zone.tiles }
  })
  requireThat(seen.size === tables, '布局须包含所有桌号。')
  requireThat(day.matches.every(match => match.endedAt || (currentRange(match, day)?.last ?? 0) <= tables), '请先释放超出新桌数范围的桌位。')
  const tableStates = Object.fromEntries(numberEntries(input.tableStates ?? day.tableStates ?? {}, tables).map(([table, state]) => {
    requireThat(state && Object.hasOwn(TABLE_STATES, state.kind) && state.kind !== 'free', '桌位资料无效。')
    const tag = state.label ? label(state.label, '状态标签') : ''
    return [table, { kind: state.kind, ...(tag ? { label: tag } : {}) }]
  }))
  Object.assign(day, { tables, zones, tableStates, layoutSaved: true })
}

export function makeEvent(input) {
  const info = eventInfo(input)
  requireThat(Array.isArray(input.days) && input.days.length >= 1 && input.days.length <= LIMITS.days, '请选择 1 至 7 个比赛日。')
  const days = input.days.map(day => ({ ...dayInfo(day), id: randomUUID(), matches: [] }))
  requireThat(new Set(days.map(day => day.date)).size === days.length, '比赛日期不能重复。')
  return { ...info, days }
}

export function changeEvent(event, input) {
  if (input.action === 'editEvent') {
    Object.assign(event, eventInfo(input, event))
    return
  }
  if (input.action === 'addDay') {
    requireThat(event.days.length < LIMITS.days, '每项赛事最多 7 个比赛日。')
    requireThat(!event.days.some(day => day.date === input.date), '比赛日期不能重复。')
    event.days.push({ ...dayInfo(input), id: randomUUID(), matches: [] })
    return
  }
  const day = event.days.find(day => day.id === input.dayId)
  requireThat(day, '未找到比赛日。', 404)
  if (input.action === 'deleteDay') {
    requireDeleteConfirmation(input.confirmation)
    event.days = event.days.filter(item => item.id !== day.id)
    return
  }
  if (input.action === 'editDay') {
    requireThat(!event.days.some(other => other !== day && other.date === input.date), '比赛日期不能重复。')
    Object.assign(day, dayInfo(input, day))
    return
  }
  if (input.action === 'layout') {
    setLayout(day, input)
    return
  }
  if (input.action === 'addMatch') {
    requireThat(day.matches.length < LIMITS.matches, '每个比赛日最多 48 项子赛事。')
    const usedColors = new Set(day.matches.map(match => match.color))
    let colorIndex = 0
    while (usedColors.has(colorFor(colorIndex))) colorIndex++
    day.matches.push({
      ...matchInfo(input, event.game, day), id: randomUUID(), color: colorFor(colorIndex),
      history: [], actualStart: null, endedAt: null,
    })
    return
  }
  const index = day.matches.findIndex(match => match.id === input.matchId)
  const match = day.matches[index]
  requireThat(match, '未找到子赛事。', 404)
  if (input.action === 'deleteMatch') {
    requireThat(match.endedAt, '只有已结束的子赛事可以删除。', 409)
    day.matches.splice(index, 1)
    return
  }
  requireThat(!match.endedAt, '这场赛事已经结束。', 409)
  if (input.action === 'editMatch') {
    const updated = matchInfo(input, event.game, day, match)
    requireThat(match.history.every(round => round.players <= updated.players), '报名人数不能少于已记录的参赛人数。')
    requireThat(updated.rounds >= currentRound(match), '瑞士轮数量不能少于已开始的轮次。')
    Object.assign(match, updated)
    return
  }
  if (input.action === 'plan') {
    match.planChoices = decisions(input.planChoices, day)
    return
  }
  const now = localNow(event.timeZone)
  if (input.action === 'actualStart') {
    requireThat(typeof input.start === 'string' && input.start.length === 16 && input.start[10] === 'T', '请选择实际开赛日期和时间。')
    const start = `${dateOnly(input.start.slice(0, 10))}T${clock(input.start.slice(11))}`
    requireThat(start <= now, '实际开赛时间不能晚于当前时间。')
    match.actualStart = start
    return
  }
  if (input.action === 'end') {
    requireThat(typeof input.confirmation === 'string' && /^(结束|end)$/i.test(input.confirmation.trim()), '请输入「结束」或「End」。')
    match.endedAt = now
    return
  }
  const correcting = input.action === 'correctRound'
  requireThat(correcting || input.action === 'round', '未知操作。')
  const next = currentRound(match) + 1
  const latest = match.history.at(-1)
  if (correcting) {
    requireThat(latest, '没有可更正的轮次。', 409)
    requireThat(input.previousRound === currentRound(match), '该轮已变更，请重新打开轮次。', 409)
    const minimum = (match.history.at(-2)?.round ?? Math.max(0, match.history.length - 1)) + 1
    whole(input.round, minimum, match.rounds, '轮次')
  } else {
    requireThat(input.round === next && next <= match.rounds, '该轮已经登记，或已达到瑞士轮数量。', 409)
  }
  const first = whole(input.first, 1, day.tables, '实际起始桌号')
  const priorCounts = correcting ? match.history.slice(0, -1).map(round => round.players) : []
  const registered = correcting && input.registered != null
    ? whole(input.registered, Math.max(0, ...priorCounts), LIMITS.players, '赛事人数') : match.players
  const players = !correcting && next === 1
    ? registered : whole(input.players, 0, registered, '当前比赛人数')
  const choices = decisions(input.choices ?? {}, day)
  const allocation = allocateTables(day, first, tablesFor(players, day), choices, 'ask')
  requireThat(!allocation.warning, '请先处理已标记的桌位。', 409)
  const { last, skipped } = allocation
  if (last !== null) {
    requireThat(last <= day.tables, '需要占用到第 {table} 桌，超出本日总桌数。', 400, { table: last })
    const assigned = new Set(tablesIn(allocation))
    for (const other of day.matches) {
      if (other === match || other.endedAt) continue
      const range = currentRange(other, day)
      if ([...tablesIn(range)].some(table => assigned.has(table))) {
        throw new Fault(409, '桌号与「{name}」的 {first}–{last} 桌重叠。', { name: other.name, ...range })
      }
    }
  }
  const record = { round: input.round, first, players, at: correcting ? latest.at : now, included: allocation.included ?? [],
    ...(skipped.length ? { skipped } : {}), ...(Object.keys(choices).length ? { choices } : {}) }
  if (correcting) {
    match.players = registered
    match.history[match.history.length - 1] = record
  } else match.history.push(record)
}
