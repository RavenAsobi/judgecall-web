// auth.js — 权限校验
// 角色：super(原初) / putong(普通) / event(比赛) / judge(游客)
// 请求头约定（与前端 web/src/api.js 对齐）：
//   X-Session-Token: opaque login session token
//   X-User-Name:  用户名（encodeURIComponent 编码）
const crypto = require('crypto')
const bcrypt = require('bcryptjs')
const config = require('./config')
const { grantStmts, grantActive, tStmts, sessionStmts } = require('./db')

const SESSION_REFRESH_THRESHOLD_MS = 24 * 3600 * 1000

function tokenHash(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex')
}

function superPrincipal() {
  if (!config.superPasswordHash) return null
  const version = crypto.createHash('sha256').update(config.superPasswordHash).digest('hex').slice(0, 16)
  return `super:${version}`
}

/** 单场密码有效期：比赛开始日期 + 7 天；date 为 '待定' 则不失效 */
function eventCodeValid(t) {
  if (!t.date || t.date === '待定') return true
  const start = new Date(t.date + 'T00:00:00')
  if (isNaN(start.getTime())) return true
  const expiry = new Date(start)
  expiry.setDate(expiry.getDate() + 7)
  return Date.now() < expiry.getTime()
}

/** 用权限密码鉴定角色 */
function resolveCredential(pass) {
  if (!pass) return null
  const raw = String(pass).trim()
  if (!raw) return null
  if (config.superPasswordHash && bcrypt.compareSync(raw, config.superPasswordHash)) {
    return { role: 'super', credential: superPrincipal() }
  }

  const p = raw.toLowerCase()
  const g = grantStmts.byCode.get(p)
  if (g && grantActive(g)) {
    // grants 表只保留 level=2（普通密码，super 发放）
    if (g.level !== 2) return null
    return { role: 'putong', credential: p }
  }

  const t = tStmts.byEventCode.get(p)
  if (t && eventCodeValid(t)) return { role: 'event', credential: p, eventTournamentId: t.id }

  return null
}


function issueSession(username, resolved) {
  sessionStmts.purgeExpired.run(Date.now())
  const token = crypto.randomBytes(32).toString('base64url')
  const now = Date.now()
  sessionStmts.insert.run(
    tokenHash(token),
    String(username || '').trim(),
    resolved.role,
    resolved.credential,
    resolved.eventTournamentId || null,
    now + config.sessionTtlMs,
    now
  )
  return token
}

function resolveSession(token) {
  if (!token) return null
  const hash = tokenHash(token)
  const now = Date.now()
  sessionStmts.purgeExpired.run(now)
  const row = sessionStmts.byHash.get(hash)
  if (!row) return null

  if (row.role === 'super') {
    if (!superPrincipal() || row.credential !== superPrincipal()) {
      sessionStmts.remove.run(hash)
      return null
    }
  } else if (row.role === 'putong') {
    const grant = grantStmts.byCode.get(row.credential)
    if (!grant || grant.level !== 2 || !grantActive(grant)) {
      sessionStmts.remove.run(hash)
      return null
    }
  } else if (row.role === 'event') {
    const tournament = tStmts.byEventCode.get(row.credential)
    if (!tournament || !eventCodeValid(tournament) || String(tournament.id) !== String(row.eventTournamentId)) {
      sessionStmts.remove.run(hash)
      return null
    }
  } else {
    sessionStmts.remove.run(hash)
    return null
  }

  if (row.expiresAt - now < SESSION_REFRESH_THRESHOLD_MS) {
    sessionStmts.touch.run(now + config.sessionTtlMs, hash)
  }
  return {
    username: row.username,
    role: row.role,
    credential: row.credential,
    eventTournamentId: row.eventTournamentId || null,
  }
}

function revokeSession(token) {
  if (token) sessionStmts.remove.run(tokenHash(token))
}

function isPrivileged(role) { return ['super', 'putong'].includes(role) }
function canGrant(role) { return role === 'super' }
function isEventPriv(role) { return ['super', 'putong', 'event'].includes(role) }

function canDeleteTournament(role, tournament) {
  if (role === 'super') return true
  if (role === 'putong') return tournament.status !== 'ongoing'
  return false
}

/** event 角色只能操作对应那一场比赛 */
function eventCanAccess(auth, tournamentId) {
  if (auth.role !== 'event') return true
  return String(auth.eventTournamentId) === String(tournamentId)
}

/** 从请求头解析用户名（前端用 encodeURIComponent 编码） */
function parseUsername(req) {
  const raw = req.get('X-User-Name') || ''
  if (!raw) return ''
  try { return decodeURIComponent(raw).trim() } catch { return String(raw).trim() }
}

// ---------- Express 中间件 ----------
/**
 * 解析身份头，附加 req.auth = { username, role, credential, eventTournamentId? }
 * 无 credential → judge；有但无效 → 401
 */
function attachAuth(req, res, next) {
  const username = parseUsername(req)
  const token = (req.get('X-Session-Token') || '').trim()

  let auth = { username, role: 'judge', credential: null }
  if (token) {
    const resolved = resolveSession(token)
    if (!resolved) return res.status(401).json({ error: 'Login session is invalid or expired' })
    auth = resolved
  }
  req.auth = auth
  req.sessionToken = token || null
  next()
}

function requirePrivileged(req, res, next) {
  if (!req.auth || !isPrivileged(req.auth.role)) {
    return res.status(403).json({ error: '需要权限用户身份' })
  }
  next()
}

function requireCanGrant(req, res, next) {
  if (!req.auth || !canGrant(req.auth.role)) {
    return res.status(403).json({ error: '当前角色不能发放权限密码' })
  }
  next()
}

function requireSuper(req, res, next) {
  if (!req.auth || req.auth.role !== 'super') {
    return res.status(403).json({ error: '需要原初权限' })
  }
  next()
}

/** 要求比赛内权限（super/putong/event 且 event 仅限对应场） */
function requireEventPriv(req, res, next) {
  const auth = req.auth
  if (!auth || !isEventPriv(auth.role)) {
    return res.status(403).json({ error: '需要比赛权限' })
  }
  const tid = req.params.id || (req.body && req.body.tournamentId)
  if (tid && !eventCanAccess(auth, tid)) {
    return res.status(403).json({ error: '比赛权限仅限对应场次' })
  }
  next()
}

module.exports = {
  resolveCredential, issueSession, resolveSession, revokeSession, parseUsername,
  isPrivileged, canGrant, isEventPriv,
  canDeleteTournament, eventCanAccess,
  attachAuth, requirePrivileged, requireCanGrant, requireSuper, requireEventPriv,
}
