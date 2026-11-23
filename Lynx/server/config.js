const path = require('path')
const dotenv = require('dotenv')

const envFile = process.env.LYNX_ENV_FILE || path.join(__dirname, '.env')
dotenv.config({ path: envFile })

const nodeEnv = process.env.NODE_ENV || 'development'
const isProduction = nodeEnv === 'production'

function numberEnv(name, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const raw = process.env[name]
  if (raw == null || raw === '') return fallback
  const value = Number(raw)
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${name} 必须是 ${min} 到 ${max} 之间的数字`)
  }
  return value
}

const corsOrigins = new Set(
  String(process.env.CORS_ORIGINS || (isProduction ? '' : 'http://localhost:5173,http://127.0.0.1:5173'))
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)
)

function requestOrigin(req) {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim()
  const protocol = forwardedProto || (req.socket.encrypted ? 'https' : 'http')
  const host = req.headers['x-forwarded-host'] || req.headers.host
  return host ? `${protocol}://${host}` : ''
}

function isOriginAllowed(origin, req) {
  if (!origin) return true
  return origin === requestOrigin(req) || corsOrigins.has(origin)
}

const config = {
  nodeEnv,
  isProduction,
  envFile,
  host: process.env.HOST || '127.0.0.1',
  port: numberEnv('PORT', 3000, { min: 1, max: 65535 }),
  dbPath: path.resolve(process.env.DB_PATH || path.join(__dirname, 'lynx.db')),
  superPasswordHash: String(process.env.SUPER_PASSWORD_HASH || '').trim(),
  sessionTtlMs: numberEnv('SESSION_TTL_HOURS', 72, { min: 1, max: 720 }) * 3600 * 1000,
  corsOrigins,
  isOriginAllowed,
  trustProxy: isProduction ? 1 : false,
}

if (isProduction && !config.superPasswordHash) {
  throw new Error('生产环境必须配置 SUPER_PASSWORD_HASH；服务已拒绝以不安全状态启动')
}

module.exports = config
