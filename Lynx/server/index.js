// Lynx backend: REST + WebSocket on one loopback-only port.
const http = require('http')
const path = require('path')
const express = require('express')
const helmet = require('helmet')
const { rateLimit } = require('express-rate-limit')
const config = require('./config')
const { purgeExpiredGrants, startupPurgeTournaments, reclaimStaleTimers } = require('./db')
const { setupWebSocket, broadcastRoom, broadcastLobby } = require('./ws')

const authRoutes = require('./routes/auth')
const tournamentRoutes = require('./routes/tournaments')
const grantRoutes = require('./routes/grants')
const pinRoutes = require('./routes/pins')

const app = express()
app.disable('x-powered-by')
app.set('trust proxy', config.trustProxy)
app.use(helmet({
  frameguard: { action: 'deny' },
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      imgSrc: ["'self'", 'data:'],
      scriptSrc: ["'self'"],
      // The inherited UI uses inline onclick attributes; allow attributes only,
      // while keeping inline <script> blocks disallowed.
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      connectSrc: ["'self'"],
    },
  },
}))
app.use(express.json({ limit: '2mb', strict: true }))

app.use((req, res, next) => {
  const origin = req.get('Origin')
  if (!config.isOriginAllowed(origin, req)) {
    return res.status(403).json({ error: 'Origin is not allowed' })
  }
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-Session-Token,X-User-Name')
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many login attempts; try again later' },
})
const verifyLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many password attempts; try again later' },
})
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
})
app.use('/api/auth/login', loginLimiter)
app.use(/^\/api\/tournaments\/\d+\/verify$/, verifyLimiter)
app.use('/api', apiLimiter)

purgeExpiredGrants()
startupPurgeTournaments()

function dayKeyOf(d) { return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` }
let lastReclaimDay = null
function runDailyReclaim() {
  const { timers, greens, unpinned } = reclaimStaleTimers()
  lastReclaimDay = dayKeyOf(new Date())
  if (timers || greens) {
    console.log(`[rule6] timers=${timers} greens=${greens} unpinned=${unpinned}`)
  }
  if (unpinned && app.locals.broadcastLobby) app.locals.broadcastLobby()
}
runDailyReclaim()
setInterval(() => {
  const now = new Date()
  if (now.getHours() === 0 && lastReclaimDay !== dayKeyOf(now)) runDailyReclaim()
}, 3600 * 1000).unref()

app.use('/api', authRoutes)
app.use('/api/tournaments', tournamentRoutes)
app.use('/api/grants', grantRoutes)
app.use('/api/pins', pinRoutes)
app.get('/api/health', (req, res) => res.json({ ok: true, now: Date.now() }))

const distDir = path.join(__dirname, '..', 'web', 'dist')
app.use(express.static(distDir, {
  index: false,
  setHeaders(res, filePath) {
    if (filePath.includes(`${path.sep}assets${path.sep}`)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    }
  },
}))
app.use((req, res, next) => {
  if (req.method !== 'GET' || req.path.startsWith('/api/')) return next()
  res.sendFile(path.join(distDir, 'lynx-beta.html'))
})

app.use((req, res) => res.status(404).json({ error: 'Not Found' }))
app.use((err, req, res, next) => {
  console.error('[request-error]', err.message)
  res.status(err.status || 500).json({ error: err.status ? err.message : 'Internal server error' })
})

const server = http.createServer(app)
setupWebSocket(server)
app.locals.broadcastRoom = broadcastRoom
app.locals.broadcastLobby = broadcastLobby

if (require.main === module) {
  server.listen(config.port, config.host, () => {
    console.log(`[lynx-server] http://${config.host}:${config.port}`)
    console.log(`[lynx-server] database=${config.dbPath}`)
  })
}

module.exports = { app, server }
