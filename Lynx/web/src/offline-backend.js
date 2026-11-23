// Lynx Test offline backend.
// Replaces the REST/WebSocket server with an in-browser data store so the
// generated single HTML file can run without Node.js, SQLite, or a network.

const STORAGE_KEY = 'lynxOfflineTestDatabaseV1'
const SESSION_TTL = 72 * 60 * 60 * 1000
const THREE_DAYS = 3 * 24 * 60 * 60 * 1000
const ONE_DAY = 24 * 60 * 60 * 1000
const PERMANENT_EXPIRY = '9999-12-31'
const SUPER_PASSWORD = 'judgecall2026'
const PUTONG_PASSWORD = '666666'

function defaultDatabase() {
  return {
    version: 1,
    tournaments: [],
    grants: [{
      code: PUTONG_PASSWORD,
      num: 'P001',
      level: 2,
      note: '内置普通权限密码（无限期）',
      expiry: PERMANENT_EXPIRY,
      active: true,
      by: 'offline',
      fromCode: null,
      createdAt: Date.now(),
    }],
    timers: {},
    pins: {},
    userCache: {},
    reports: [],
    reportAcks: [],
    sessions: {},
    nextReportId: 1,
  }
}

let memoryDatabase = null

function readDatabase() {
  let parsed = null
  try {
    parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
  } catch {}
  const fresh = defaultDatabase()
  const db = parsed && typeof parsed === 'object' ? { ...fresh, ...parsed } : fresh
  if (!Array.isArray(db.tournaments)) db.tournaments = []
  if (!Array.isArray(db.grants)) db.grants = []
  if (!Array.isArray(db.reports)) db.reports = []
  if (!Array.isArray(db.reportAcks)) db.reportAcks = []
  if (!db.timers || typeof db.timers !== 'object') db.timers = {}
  if (!db.pins || typeof db.pins !== 'object') db.pins = {}
  if (!db.userCache || typeof db.userCache !== 'object') db.userCache = {}
  if (!db.sessions || typeof db.sessions !== 'object') db.sessions = {}
  if (!db.grants.some(g => g.code === PUTONG_PASSWORD)) {
    db.grants.push(fresh.grants[0])
  }
  memoryDatabase = db
  persistDatabase()
  return db
}

function persistDatabase() {
  if (!memoryDatabase) return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(memoryDatabase))
  } catch {}
}

const database = readDatabase()

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value))
}

function randomCode(length = 6) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  const bytes = new Uint32Array(length)
  if (globalThis.crypto && crypto.getRandomValues) crypto.getRandomValues(bytes)
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 0xffffffff)
  return Array.from(bytes, n => chars[n % chars.length]).join('')
}

function randomToken() {
  return `${randomCode(24)}${Date.now().toString(36)}`
}

function localDateString(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function daysFromNow(days) {
  const date = new Date()
  date.setDate(date.getDate() + Number(days || 0))
  return localDateString(date)
}

function grantIsActive(grant) {
  if (!grant || !grant.active) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return new Date(`${grant.expiry}T23:59:59`) >= today
}

function eventCodeIsActive(tournament) {
  if (!tournament || !tournament.eventCode) return false
  if (!tournament.date || tournament.date === '待定') return true
  const start = new Date(`${tournament.date}T00:00:00`)
  if (Number.isNaN(start.getTime())) return true
  start.setDate(start.getDate() + 7)
  return Date.now() < start.getTime()
}

function resolvePassword(password) {
  const raw = String(password || '').trim()
  if (!raw) return null
  if (raw === SUPER_PASSWORD) {
    return { role: 'super', credential: 'super:offline-test' }
  }
  const normalized = raw.toLowerCase()
  const grant = database.grants.find(g => g.code === normalized)
  if (grant && grant.level === 2 && grantIsActive(grant)) {
    return { role: 'putong', credential: normalized }
  }
  const tournament = database.tournaments.find(t => t.eventCode === normalized)
  if (tournament && eventCodeIsActive(tournament)) {
    return {
      role: 'event',
      credential: normalized,
      eventTournamentId: tournament.id,
    }
  }
  return null
}

function resolveSession(token) {
  const session = database.sessions[String(token || '')]
  if (!session || session.expiresAt < Date.now()) {
    if (token) delete database.sessions[token]
    persistDatabase()
    return null
  }
  if (session.role === 'putong') {
    const grant = database.grants.find(g => g.code === session.credential)
    if (!grant || !grantIsActive(grant)) return null
  }
  if (session.role === 'event') {
    const tournament = database.tournaments.find(t => t.id === session.eventTournamentId)
    if (!tournament || tournament.eventCode !== session.credential || !eventCodeIsActive(tournament)) return null
  }
  if (session.expiresAt - Date.now() < ONE_DAY) {
    session.expiresAt = Date.now() + SESSION_TTL
    persistDatabase()
  }
  return session
}

function issueSession(username, principal) {
  const token = randomToken()
  database.sessions[token] = {
    username: String(username || '').trim(),
    role: principal.role,
    credential: principal.credential,
    eventTournamentId: principal.eventTournamentId || null,
    expiresAt: Date.now() + SESSION_TTL,
  }
  persistDatabase()
  return token
}

function headerValue(options, name) {
  const headers = new Headers((options && options.headers) || {})
  return headers.get(name) || ''
}

function requestAuth(options) {
  let username = headerValue(options, 'X-User-Name')
  try { username = decodeURIComponent(username) } catch {}
  const token = headerValue(options, 'X-Session-Token').trim()
  if (!token) return { username, role: 'judge', credential: null, token: null }
  const session = resolveSession(token)
  if (!session) throw new OfflineHttpError(401, 'Login session is invalid or expired')
  return { ...session, token }
}

function isPrivileged(role) {
  return role === 'super' || role === 'putong'
}

function isEventPrivileged(role) {
  return role === 'super' || role === 'putong' || role === 'event'
}

function canManageTournament(auth, tournamentId) {
  if (!auth || !isEventPrivileged(auth.role)) return false
  return auth.role !== 'event' || String(auth.eventTournamentId) === String(tournamentId)
}

function canDeleteTournament(auth, tournament) {
  if (auth.role === 'super') return true
  return auth.role === 'putong' && tournament.status !== 'ongoing'
}

function requireCondition(condition, status, message) {
  if (!condition) throw new OfflineHttpError(status, message)
}

function findTournament(id) {
  return database.tournaments.find(t => String(t.id) === String(id))
}

function initialMinutes(game, format) {
  if (game === 'MTG') return 50
  return ['Silver Age', 'Sealed Deck', 'Draft'].includes(format) ? 35 : 55
}

function defaultTimer(minutes) {
  return {
    configured: minutes,
    remaining: minutes * 60,
    running: false,
    updatedAt: Date.now(),
  }
}

function getTimer(id, minutes = 50) {
  if (!database.timers[id]) {
    database.timers[id] = defaultTimer(minutes)
    persistDatabase()
  }
  return database.timers[id]
}

function tablesPayload(tournament) {
  return {
    tables: clone(tournament.tables || []),
    layoutCode: tournament.layoutCode || null,
    layoutRows: clone(tournament.layoutRows || null),
    maxTables: tournament.maxTables,
    startTable: tournament.startTable || 1,
    tableReversed: !!tournament.tableReversed,
    roundNumber: tournament.roundNumber || 1,
  }
}

function fullTournament(tournament) {
  if (!tournament) return null
  return {
    ...clone(tournament),
    tables: clone(tournament.tables || []),
    timer: clone(getTimer(tournament.id, initialMinutes(tournament.game, tournament.format))),
  }
}

function safeTournament(tournament, auth) {
  const result = fullTournament(tournament)
  if (!isEventPrivileged(auth.role)) {
    delete result.password
    delete result.eventCode
  }
  return result
}

function nextGrantNumber() {
  const highest = database.grants.reduce((max, grant) => {
    const value = /^P(\d+)$/.test(grant.num || '') ? Number(grant.num.slice(1)) : 0
    return Math.max(max, value)
  }, 0)
  return `P${String(highest + 1).padStart(3, '0')}`
}

function nextEventNumber() {
  const highest = database.tournaments.reduce((max, tournament) => {
    const value = /^D(\d+)$/.test(tournament.eventNum || '') ? Number(tournament.eventNum.slice(1)) : 0
    return Math.max(max, value)
  }, 0)
  return `D${String(highest + 1).padStart(3, '0')}`
}

function createTournament(body) {
  const name = String(body.name || '').trim()
  const password = String(body.password || '').trim()
  requireCondition(name, 400, '比赛名称不能为空')
  requireCondition(password, 400, '进入密码不能为空')
  requireCondition(!database.tournaments.some(t => t.name === name), 409, '已有同名比赛，不能创建')

  let id = Date.now()
  while (findTournament(id)) id++
  const game = body.game === 'MTG' ? 'MTG' : 'FAB'
  const format = String(body.format || '').trim() || '未指定'
  const maxTables = body.maxTables ? Math.max(1, Math.min(999, parseInt(body.maxTables))) : 8
  const startTable = parseInt(body.startTable) || 1
  const tableReversed = !!body.tableReversed
  const withEventCode = !!(body.withEventCode || body.eventCode)
  const tables = []
  for (let index = 0; index < maxTables; index++) {
    tables.push({
      number: tableReversed ? startTable - index : startTable + index,
      color: 'white',
      p1: '',
      p2: '',
      result: null,
      timeExt: 0,
      watchedBy: null,
      drop1: false,
      drop2: false,
      greenManual: false,
      greenAt: null,
    })
  }
  const tournament = {
    id,
    name,
    date: body.date ? String(body.date).split('T')[0] : '待定',
    game,
    format,
    status: 'upcoming',
    password,
    players: 0,
    maxTables,
    startTable,
    roundNumber: 1,
    eventCode: withEventCode ? uniqueEventCode() : null,
    eventNum: withEventCode ? nextEventNumber() : null,
    tableReversed,
    layoutCode: null,
    layoutRows: null,
    tables,
    createdAt: Date.now(),
    lastAccessAt: null,
    lastOpAt: null,
    endedAt: null,
  }
  database.tournaments.unshift(tournament)
  database.timers[id] = defaultTimer(initialMinutes(game, format))
  persistDatabase()
  return tournament
}

function uniqueEventCode() {
  let code
  do { code = randomCode(6) } while (
    database.grants.some(g => g.code === code) ||
    database.tournaments.some(t => t.eventCode === code)
  )
  return code
}

function updateTournament(tournament, body) {
  const oldPassword = tournament.password
  const name = body.name != null ? String(body.name).trim() : tournament.name
  const password = body.password != null ? String(body.password).trim() : tournament.password
  requireCondition(name && password, 400, '比赛名称和进入密码不能为空')
  requireCondition(
    !database.tournaments.some(t => t.id !== tournament.id && t.name === name),
    409,
    '已有同名比赛',
  )

  tournament.name = name
  tournament.password = password
  if (body.date != null) tournament.date = String(body.date).split('T')[0]
  if (body.game != null) tournament.game = body.game === 'MTG' ? 'MTG' : 'FAB'
  if (body.format != null) tournament.format = String(body.format).trim() || '未指定'
  if (['upcoming', 'ongoing', 'completed'].includes(body.status)) tournament.status = body.status
  if (body.players != null) tournament.players = parseInt(body.players) || 0
  if (body.maxTables != null) tournament.maxTables = Math.max(1, Math.min(999, parseInt(body.maxTables) || 1))
  if (body.startTable != null) tournament.startTable = parseInt(body.startTable) || 1
  if (body.roundNumber != null) tournament.roundNumber = Math.max(1, parseInt(body.roundNumber) || 1)
  if (body.tableReversed != null) tournament.tableReversed = !!body.tableReversed
  if (body.layoutCode !== undefined) tournament.layoutCode = body.layoutCode
  if (body.layoutRows !== undefined) tournament.layoutRows = clone(body.layoutRows)

  const wantsCode = body.withEventCode !== undefined
    ? !!body.withEventCode
    : body.eventCode !== undefined ? !!body.eventCode : undefined
  if (wantsCode === true && !tournament.eventCode) {
    tournament.eventCode = uniqueEventCode()
    tournament.eventNum = nextEventNumber()
  } else if (wantsCode === false) {
    tournament.eventCode = null
    tournament.eventNum = null
  }
  tournament.lastOpAt = Date.now()
  if (oldPassword !== password) {
    for (const key of Object.keys(database.userCache)) {
      if (key.endsWith(`|${tournament.id}`)) delete database.userCache[key]
    }
  }
  persistDatabase()
  return tournament
}

function cacheKey(username, tournamentId) {
  return `${String(username || '').trim().toLowerCase()}|${tournamentId}`
}

function cacheEntry(username, tournamentId, duration = THREE_DAYS) {
  if (!username) return
  database.userCache[cacheKey(username, tournamentId)] = Date.now() + duration
  persistDatabase()
}

function hasUserCache(username, tournamentId) {
  const key = cacheKey(username, tournamentId)
  const expiry = Number(database.userCache[key] || 0)
  if (expiry < Date.now()) {
    delete database.userCache[key]
    persistDatabase()
    return false
  }
  if (expiry - Date.now() < ONE_DAY) {
    database.userCache[key] = Date.now() + ONE_DAY
    persistDatabase()
  }
  return true
}

function grantView(grant) {
  return {
    code: grant.code,
    num: grant.num,
    level: grant.level,
    note: grant.note,
    expiry: grant.expiry,
    active: grantIsActive(grant),
    by: grant.by,
    fromCode: grant.fromCode || null,
  }
}

function viewerFeed(tournamentId, credential) {
  const acknowledged = new Set(
    database.reportAcks
      .filter(ack => ack.viewerCredential === credential)
      .map(ack => ack.reportId),
  )
  return database.reports
    .filter(report =>
      String(report.tournamentId) === String(tournamentId) &&
      !report.roundCleared &&
      !report.dup &&
      report.reporterCredential !== credential &&
      !acknowledged.has(report.id))
    .sort((a, b) => a.createdAt - b.createdAt || a.id - b.id)
    .map(clone)
}

function addReport(tournamentId, auth, tableNo, kind, body) {
  const tournament = findTournament(tournamentId)
  const round = tournament ? tournament.roundNumber || 1 : 1
  let dup = false
  let conflict = false
  let group = null
  if (kind === 'score') {
    const previous = [...database.reports].reverse().find(report =>
      String(report.tournamentId) === String(tournamentId) &&
      report.round === round &&
      report.tableNo === tableNo &&
      report.kind === 'score' &&
      !report.dup)
    if (previous && previous.body === body) {
      dup = true
    } else if (previous) {
      conflict = true
      group = `s:${round}:${tableNo}`
      for (const report of database.reports) {
        if (
          String(report.tournamentId) === String(tournamentId) &&
          report.round === round &&
          report.tableNo === tableNo &&
          report.kind === 'score' &&
          !report.dup
        ) {
          report.conflict = true
          report.grp = group
        }
      }
    }
  } else {
    const previous = [...database.reports].reverse().find(report =>
      String(report.tournamentId) === String(tournamentId) &&
      report.round === round &&
      report.tableNo === tableNo &&
      report.kind === 'drop' &&
      report.body === body)
    if (previous) {
      conflict = true
      group = `d:${round}:${tableNo}:${body}`
      for (const report of database.reports) {
        if (
          String(report.tournamentId) === String(tournamentId) &&
          report.round === round &&
          report.tableNo === tableNo &&
          report.kind === 'drop' &&
          report.body === body
        ) report.grp = group
      }
    }
  }
  const report = {
    id: database.nextReportId++,
    tournamentId: Number(tournamentId),
    tableNo,
    round,
    kind,
    body,
    reporterName: auth.username || '匿名',
    reporterCredential: auth.credential || '',
    text: `R${round} - 桌号${tableNo} - ${body}`,
    dup,
    conflict,
    grp: group,
    roundCleared: false,
    createdAt: Date.now(),
  }
  database.reports.push(report)
  persistDatabase()
  return report
}

class OfflineHttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

function jsonResponse(data, status = 200) {
  return new Response(status === 204 ? null : JSON.stringify(data), {
    status,
    headers: status === 204 ? {} : { 'Content-Type': 'application/json; charset=utf-8' },
  })
}

function parseBody(options) {
  if (!options || options.body == null) return null
  if (typeof options.body === 'string') {
    try { return JSON.parse(options.body) } catch { return null }
  }
  return options.body
}

async function handleApi(path, options) {
  const method = String((options && options.method) || 'GET').toUpperCase()
  const body = parseBody(options) || {}

  if (path === '/api/health' && method === 'GET') {
    return { ok: true, offline: true, now: Date.now() }
  }

  if (path === '/api/auth/login' && method === 'POST') {
    const name = String(body.name || '').trim()
    requireCondition(name, 400, '用户名不能为空')
    const principal = resolvePassword(body.password)
    requireCondition(principal, 401, '权限密码无效或已过期')
    return {
      token: issueSession(name, principal),
      role: principal.role,
      eventTournamentId: principal.eventTournamentId || null,
    }
  }

  if (path === '/api/auth/session' && method === 'GET') {
    const auth = requestAuth(options)
    requireCondition(auth.role !== 'judge', 401, 'Login required')
    return { role: auth.role, eventTournamentId: auth.eventTournamentId || null }
  }

  if (path === '/api/auth/logout' && method === 'POST') {
    const token = headerValue(options, 'X-Session-Token').trim()
    if (token) delete database.sessions[token]
    persistDatabase()
    return { __status: 204 }
  }

  if (path === '/api/tournaments' && method === 'GET') {
    const auth = requestAuth(options)
    return [...database.tournaments]
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(tournament => safeTournament(tournament, auth))
  }

  if (path === '/api/tournaments' && method === 'POST') {
    const auth = requestAuth(options)
    requireCondition(isPrivileged(auth.role), 403, '需要权限用户身份')
    return { __status: 201, data: fullTournament(createTournament(body)) }
  }

  const reportMatch = path.match(/^\/api\/tournaments\/(\d+)\/reports$/)
  if (reportMatch && method === 'GET') {
    const auth = requestAuth(options)
    requireCondition(canManageTournament(auth, reportMatch[1]), 403, '需要比赛权限')
    return database.reports
      .filter(report => String(report.tournamentId) === reportMatch[1])
      .sort((a, b) => b.createdAt - a.createdAt || b.id - a.id)
      .slice(0, 500)
      .map(clone)
  }

  const verifyMatch = path.match(/^\/api\/tournaments\/(\d+)\/verify$/)
  if (verifyMatch && method === 'POST') {
    const tournament = findTournament(verifyMatch[1])
    requireCondition(tournament, 404, '比赛不存在')
    const auth = requestAuth(options)
    const name = String(body.name || '').trim()
    if (canManageTournament(auth, tournament.id)) return { ok: true, via: 'session' }
    if (name && hasUserCache(name, tournament.id)) return { ok: true, via: 'cache' }
    requireCondition(String(body.password || '') === String(tournament.password), 401, '密码错误')
    if (name) cacheEntry(name, tournament.id)
    return { ok: true, via: 'password' }
  }

  const enterMatch = path.match(/^\/api\/tournaments\/(\d+)\/enter$/)
  if (enterMatch && method === 'POST') {
    const auth = requestAuth(options)
    const username = auth.username || String(body.name || '').trim()
    if (username) cacheEntry(username, enterMatch[1])
    return { ok: true }
  }

  const tournamentMatch = path.match(/^\/api\/tournaments\/(\d+)$/)
  if (tournamentMatch) {
    const tournament = findTournament(tournamentMatch[1])
    requireCondition(tournament, 404, '比赛不存在')
    const auth = requestAuth(options)
    if (method === 'GET') {
      tournament.lastAccessAt = Date.now()
      persistDatabase()
      return safeTournament(tournament, auth)
    }
    if (method === 'PATCH') {
      requireCondition(canManageTournament(auth, tournament.id), 403, '需要比赛权限')
      return fullTournament(updateTournament(tournament, body))
    }
    if (method === 'DELETE') {
      requireCondition(isPrivileged(auth.role), 403, '需要权限用户身份')
      requireCondition(canDeleteTournament(auth, tournament), 403, '当前角色不能删除该比赛')
      database.tournaments = database.tournaments.filter(t => t.id !== tournament.id)
      delete database.timers[tournament.id]
      database.reports = database.reports.filter(r => r.tournamentId !== tournament.id)
      for (const pins of Object.values(database.pins)) {
        if (Array.isArray(pins)) {
          const index = pins.indexOf(tournament.id)
          if (index >= 0) pins.splice(index, 1)
        }
      }
      persistDatabase()
      return { ok: true }
    }
  }

  if (path === '/api/my-entries' && method === 'GET') {
    const auth = requestAuth(options)
    const prefix = `${String(auth.username || '').trim().toLowerCase()}|`
    return Object.entries(database.userCache)
      .filter(([key, expiresAt]) => key.startsWith(prefix) && expiresAt >= Date.now())
      .map(([key, expiresAt]) => ({
        tournamentId: Number(key.slice(prefix.length)),
        expiresAt,
      }))
      .sort((a, b) => b.expiresAt - a.expiresAt)
  }

  if (path === '/api/grants' && method === 'GET') {
    const auth = requestAuth(options)
    requireCondition(auth.role === 'super', 403, '当前角色不能发放权限密码')
    return [...database.grants].sort((a, b) => b.createdAt - a.createdAt).map(grantView)
  }

  if (path === '/api/grants' && method === 'POST') {
    const auth = requestAuth(options)
    requireCondition(auth.role === 'super', 403, '当前角色不能发放权限密码')
    const durationDays = parseInt(body.durationDays) || 7
    requireCondition(durationDays >= 1 && durationDays <= 3650, 400, '有效期天数不合法')
    let code
    do { code = randomCode(6) } while (resolvePassword(code))
    const grant = {
      code,
      num: nextGrantNumber(),
      level: 2,
      note: String(body.note || '').trim() || '未备注',
      expiry: daysFromNow(durationDays),
      active: true,
      by: auth.username,
      fromCode: null,
      createdAt: Date.now(),
    }
    database.grants.push(grant)
    persistDatabase()
    return { __status: 201, data: grantView(grant) }
  }

  const grantMatch = path.match(/^\/api\/grants\/([^/]+)$/)
  if (grantMatch && method === 'PATCH') {
    const auth = requestAuth(options)
    requireCondition(auth.role === 'super', 403, '当前角色不能发放权限密码')
    const code = decodeURIComponent(grantMatch[1]).toLowerCase()
    const grant = database.grants.find(g => g.code === code)
    requireCondition(grant, 404, '密码不存在')
    if (body.note !== undefined) grant.note = String(body.note).trim()
    if (body.expiry !== undefined) grant.expiry = String(body.expiry)
    persistDatabase()
    return grantView(grant)
  }

  if (path === '/api/pins') {
    const auth = requestAuth(options)
    requireCondition(isPrivileged(auth.role), 403, '需要权限用户身份')
    if (method === 'GET') return clone(database.pins[auth.credential] || [])
    if (method === 'PUT') {
      database.pins[auth.credential] = Array.isArray(body) ? body.map(Number).filter(Number.isFinite) : []
      persistDatabase()
      return clone(database.pins[auth.credential])
    }
  }

  throw new OfflineHttpError(404, 'Not Found')
}

const nativeFetch = globalThis.fetch ? globalThis.fetch.bind(globalThis) : null
globalThis.fetch = async function offlineFetch(input, options = {}) {
  const rawUrl = typeof input === 'string' ? input : input && input.url
  const rawText = String(rawUrl || '')
  const apiPath = rawText.startsWith('/api/')
    ? rawText.split(/[?#]/, 1)[0]
    : new URL(rawText, location.href).pathname
  if (!apiPath.startsWith('/api/')) {
    if (!nativeFetch) throw new TypeError('Network access is unavailable')
    return nativeFetch(input, options)
  }
  try {
    const result = await handleApi(apiPath, options)
    if (result && result.__status === 204) return jsonResponse(null, 204)
    if (result && result.__status) return jsonResponse(result.data, result.__status)
    return jsonResponse(result)
  } catch (error) {
    if (error instanceof OfflineHttpError) {
      return jsonResponse({ error: error.message }, error.status)
    }
    console.error('[offline-api]', error)
    return jsonResponse({ error: '离线数据处理失败' }, 500)
  }
}

function currentRemaining(timer) {
  if (!timer.running) return timer.remaining
  return timer.remaining - Math.floor((Date.now() - timer.updatedAt) / 1000)
}

class OfflineWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  constructor() {
    this.readyState = OfflineWebSocket.CONNECTING
    this.roomId = null
    this.auth = null
    queueMicrotask(() => {
      if (this.readyState !== OfflineWebSocket.CONNECTING) return
      this.readyState = OfflineWebSocket.OPEN
      if (typeof this.onopen === 'function') this.onopen({ type: 'open' })
    })
  }

  emit(message) {
    if (this.readyState !== OfflineWebSocket.OPEN) return
    queueMicrotask(() => {
      if (typeof this.onmessage === 'function') {
        this.onmessage({ data: JSON.stringify(message) })
      }
    })
  }

  send(raw) {
    if (this.readyState !== OfflineWebSocket.OPEN) return
    let message
    try { message = JSON.parse(raw) } catch { return }
    this.handle(message)
  }

  handle(message) {
    if (message.type === 'join') {
      const tournament = findTournament(message.tournamentId)
      if (!tournament) return this.emit({ type: 'error', message: '比赛不存在' })
      const session = message.token ? resolveSession(message.token) : null
      if (message.token && !session) {
        return this.emit({ type: 'error', message: 'Login session is invalid or expired' })
      }
      this.auth = session || {
        username: String(message.name || '匿名').trim() || '匿名',
        role: 'judge',
        credential: null,
      }
      this.roomId = tournament.id
      tournament.lastAccessAt = Date.now()
      persistDatabase()
      this.emit({
        type: 'snapshot',
        tables: tablesPayload(tournament),
        timer: clone(getTimer(tournament.id, initialMinutes(tournament.game, tournament.format))),
        tournament: clone(tournament),
      })
      if (canManageTournament(this.auth, tournament.id)) {
        this.emit({
          type: 'reports',
          list: viewerFeed(tournament.id, this.auth.credential || ''),
        })
      }
      return
    }

    if (message.type === 'leave') {
      this.roomId = null
      this.auth = null
      return
    }

    const tournament = findTournament(this.roomId)
    if (!tournament) return this.emit({ type: 'error', message: '未加入房间' })
    const auth = this.auth || { username: '匿名', role: 'judge', credential: null }

    if (message.type === 'tables:patch') {
      const patch = message.patch || {}
      if (!Array.isArray(patch.tables)) {
        return this.emit({ type: 'error', message: 'patch.tables 必须是数组' })
      }
      tournament.tables = clone(patch.tables)
      tournament.lastOpAt = Date.now()
      if (canManageTournament(auth, tournament.id)) {
        if (patch.maxTables != null) tournament.maxTables = Math.max(1, parseInt(patch.maxTables) || 1)
        if (patch.startTable != null) tournament.startTable = parseInt(patch.startTable) || 1
        if (patch.tableReversed != null) tournament.tableReversed = !!patch.tableReversed
        if (patch.roundNumber != null) tournament.roundNumber = Math.max(1, parseInt(patch.roundNumber) || 1)
        if (patch.layoutCode !== undefined) tournament.layoutCode = patch.layoutCode
        if (patch.layoutRows !== undefined) tournament.layoutRows = clone(patch.layoutRows)
      }
      persistDatabase()
      return
    }

    if (message.type === 'timer:cmd') {
      if (!canManageTournament(auth, tournament.id)) {
        return this.emit({ type: 'error', message: '需要比赛权限' })
      }
      const timer = getTimer(tournament.id, initialMinutes(tournament.game, tournament.format))
      const command = message.cmd || {}
      const now = Date.now()
      if (command.action === 'start') {
        timer.updatedAt = now
        timer.running = true
      } else if (command.action === 'pause') {
        timer.remaining = currentRemaining(timer)
        timer.running = false
        timer.updatedAt = now
      } else if (command.action === 'reset') {
        timer.remaining = timer.configured * 60
        timer.running = false
        timer.updatedAt = now
      } else if (command.action === 'set') {
        const minutes = parseInt(command.minutes)
        if (!Number.isInteger(minutes) || minutes < 0 || minutes > 999) {
          return this.emit({ type: 'error', message: '时长不合法' })
        }
        timer.configured = minutes
        timer.remaining = minutes * 60
        timer.updatedAt = now
      } else {
        return this.emit({ type: 'error', message: '未知计时指令' })
      }
      tournament.lastOpAt = now
      persistDatabase()
      this.emit({ type: 'timer', state: clone(timer) })
      return
    }

    if (message.type === 'report') {
      const tableNo = parseInt(message.tableNo)
      const kind = message.kind === 'drop' ? 'drop' : 'score'
      const body = String(message.body || '').trim()
      if (!Number.isInteger(tableNo) || !body) {
        return this.emit({ type: 'error', message: '回报内容不合法' })
      }
      const report = addReport(tournament.id, auth, tableNo, kind, body)
      tournament.lastOpAt = Date.now()
      persistDatabase()
      if (!report.dup && canManageTournament(auth, tournament.id)) {
        this.emit({
          type: 'reports',
          list: viewerFeed(tournament.id, auth.credential || ''),
        })
      }
      return
    }

    if (message.type === 'report:ack') {
      if (!canManageTournament(auth, tournament.id)) return
      database.reportAcks.push({
        reportId: Number(message.id),
        viewerCredential: auth.credential || '',
        ackedAt: Date.now(),
      })
      persistDatabase()
      return
    }

    if (message.type === 'report:clear') {
      if (!canManageTournament(auth, tournament.id)) return
      for (const report of viewerFeed(tournament.id, auth.credential || '')) {
        database.reportAcks.push({
          reportId: report.id,
          viewerCredential: auth.credential || '',
          ackedAt: Date.now(),
        })
      }
      persistDatabase()
      return
    }

    if (message.type === 'report:roundclear') {
      if (!canManageTournament(auth, tournament.id)) return
      for (const report of database.reports) {
        if (report.tournamentId === tournament.id && !report.roundCleared) report.roundCleared = true
      }
      persistDatabase()
      this.emit({ type: 'reports:roundclear' })
      this.emit({ type: 'reports', list: [] })
    }
  }

  close() {
    if (this.readyState === OfflineWebSocket.CLOSED) return
    this.readyState = OfflineWebSocket.CLOSED
    queueMicrotask(() => {
      if (typeof this.onclose === 'function') this.onclose({ type: 'close' })
    })
  }
}

globalThis.WebSocket = OfflineWebSocket
globalThis.__LYNX_OFFLINE_TEST__ = true
