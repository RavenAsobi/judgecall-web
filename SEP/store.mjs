import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { promisify } from 'node:util'
import { requireThat } from './model.mjs'

const derive = promisify(scrypt)
const tokenHash = token => createHash('sha256').update(token).digest('hex')
const sessionAge = 86400

export function openStore(path) {
  const db = new DatabaseSync(path)
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL COLLATE NOCASE UNIQUE, password TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), expires INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 1, data TEXT NOT NULL
    );
  `)
  return db
}

export function validUsername(name) {
  return typeof name === 'string' && /^[A-Za-z0-9_.-]{2,32}$/.test(name)
}

async function digest(password) {
  const salt = randomBytes(16).toString('hex')
  const key = await derive(password, salt, 64)
  return `${salt}:${key.toString('hex')}`
}

export async function verify(password, stored) {
  const [salt, hash] = stored?.split(':') ?? ['0'.repeat(32), '0'.repeat(128)]
  const key = await derive(password, salt, 64)
  return stored != null && timingSafeEqual(key, Buffer.from(hash, 'hex'))
}

export async function addUser(db, name, password, seed = false) {
  requireThat(validUsername(name), '用户名须为 2 至 32 个字母、数字、点、下划线或连字符。')
  const min = seed ? 8 : 10
  requireThat(typeof password === 'string' && password.length >= min && password.length <= 128, '密码须为 {min} 至 128 个字符。', 400, { min })
  const hash = await digest(password)
  const result = db.prepare('INSERT INTO users (name, password) VALUES (?, ?) ON CONFLICT(name) DO NOTHING').run(name, hash)
  requireThat(seed || result.changes === 1, '用户名已存在。', 409)
}

export async function replacePassword(db, user, current, next) {
  requireThat(typeof current === 'string' && current.length <= 128 && typeof next === 'string' && next.length >= 10 && next.length <= 128, '请输入当前密码和 10 至 128 个字符的新密码。')
  requireThat(await verify(current, user.password), '当前密码错误。', 403)
  const replacement = await digest(next)
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = db.prepare('UPDATE users SET password = ? WHERE id = ? AND password = ?').run(replacement, user.id, user.password)
    requireThat(result.changes === 1, '密码已更新，请重新登录。', 409)
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id)
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

export function newSession(db, user) {
  const now = Math.floor(Date.now() / 1000)
  const token = randomBytes(32).toString('hex')
  db.prepare('DELETE FROM sessions WHERE expires <= ?').run(now)
  const result = db.prepare(`
    INSERT INTO sessions (token, user_id, expires)
    SELECT ?, id, ? FROM users WHERE id = ? AND password = ?
  `).run(tokenHash(token), now + sessionAge, user.id, user.password)
  requireThat(result.changes === 1, '登录状态已变更，请重试。', 409)
  return token
}

export function findSession(db, token) {
  if (!token) return null
  return db.prepare(`
    SELECT u.id, u.name, u.password FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND s.expires > ?
  `).get(tokenHash(token), Math.floor(Date.now() / 1000))
}

export function endSession(db, token) {
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(tokenHash(token))
}

export function authCookie(token, secure) {
  return `sep_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${token ? sessionAge : 0}${secure ? '; Secure' : ''}`
}
