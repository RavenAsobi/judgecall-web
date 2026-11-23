import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { changeEvent, Fault, makeEvent, requireDeleteConfirmation, requireThat } from './model.mjs'
import { translate } from './src/i18n.mjs'
import { addUser, authCookie, endSession, findSession, newSession, openStore, replacePassword, validUsername, verify } from './store.mjs'

const port = Number(process.env.SEP_PORT || 3104)
const origin = process.env.SEP_ORIGIN || `http://127.0.0.1:${port}`
const secure = origin.startsWith('https:')
const bodyLimit = 1024 * 1024
const db = openStore(process.env.SEP_DATA || 'sep.sqlite')
const responseHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
  'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
}

async function readJSON(stream) {
  const chunks = []
  let bytes = 0
  for await (const chunk of stream.iterator({ destroyOnReturn: false })) {
    bytes += chunk.length
    if (bytes > bodyLimit) {
      stream.resume()
      throw new Fault(413, '提交的数据过大。')
    }
    chunks.push(chunk)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new Fault(400, '提交的数据格式无效。')
  }
}

if (process.argv.includes('--seed')) {
  const users = await readJSON(process.stdin)
  for (const user of users) await addUser(db, user.name, user.password, true)
  db.close()
  process.exit(0)
}

const attempts = new Map()
const windowMs = 5 * 60000
setInterval(() => {
  const now = Date.now()
  for (const [ip, entry] of attempts) if (entry.expires <= now) attempts.delete(ip)
}, windowMs).unref()

function checkAttempts(request) {
  const ip = secure ? request.headers['x-sep-client'] || request.socket.remoteAddress : request.socket.remoteAddress
  let entry = attempts.get(ip)
  if (!entry || entry.expires <= Date.now()) {
    if (attempts.size > 10000) throw new Fault(429, '登录请求过多，请稍后再试。')
    entry = { count: 0, expires: Date.now() + windowMs }
    attempts.set(ip, entry)
  }
  requireThat(entry.count < 15, '登录尝试过多，请五分钟后再试。', 429)
  entry.count++
  return () => { entry.count-- }
}

const serial = row => ({ ...JSON.parse(row.data), id: row.id, revision: row.revision })

function respond(response, status, data, headers = {}) {
  response.writeHead(status, {
    ...responseHeaders, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers,
  })
  response.end(JSON.stringify(data))
}

function mutate(id, input, remove = false) {
  db.exec('BEGIN IMMEDIATE')
  try {
    const row = db.prepare('SELECT * FROM events WHERE id = ?').get(id)
    requireThat(row, '未找到赛事。', 404)
    requireThat(row.revision === input.revision, '另一位用户已更新赛事。请关闭当前编辑，重新打开后再提交。', 409)
    if (remove) {
      requireDeleteConfirmation(input.confirmation)
      db.prepare('DELETE FROM events WHERE id = ?').run(id)
      db.exec('COMMIT')
      return {}
    }
    const draft = JSON.parse(row.data)
    changeEvent(draft, input)
    const revision = row.revision + 1
    db.prepare('UPDATE events SET revision = ?, data = ? WHERE id = ?').run(revision, JSON.stringify(draft), id)
    db.exec('COMMIT')
    return { ...draft, id, revision }
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

async function api(request, response, path) {
  const { method, headers } = request
  const token = headers.cookie?.match(/(?:^|;\s*)sep_session=([a-f0-9]{64})(?:;|$)/)?.[1]
  const user = findSession(db, token)
  let input
  if (method !== 'GET') {
    requireThat(!headers.origin || headers.origin === origin, '请求来源无效。', 403)
    requireThat(headers['sec-fetch-site'] !== 'cross-site', '请求来源无效。', 403)
    requireThat(headers['content-type']?.split(';')[0].trim() === 'application/json', '需要 JSON 数据。', 415)
    if (path !== 'login') requireThat(user, '请先登录。', 401)
    input = await readJSON(request)
    requireThat(input && typeof input === 'object' && !Array.isArray(input), '提交的数据格式无效。')
  }
  if (method === 'GET' && path === 'session') {
    return respond(response, 200, { user: user ? { name: user.name } : null })
  }
  if (method === 'POST' && path === 'login') {
    const allowed = checkAttempts(request)
    const { name, password } = input
    requireThat(validUsername(name) && typeof password === 'string' && password.length <= 128, '用户名或密码错误。', 401)
    const account = db.prepare('SELECT * FROM users WHERE name = ?').get(name)
    requireThat(await verify(password, account?.password), '用户名或密码错误。', 401)
    allowed()
    const replacement = newSession(db, account)
    endSession(db, token)
    return respond(response, 200, { user: { name: account.name } }, { 'Set-Cookie': authCookie(replacement, secure) })
  }
  requireThat(user, '请先登录。', 401)
  if (method === 'POST' && path === 'logout') {
    endSession(db, token)
    return respond(response, 200, {}, { 'Set-Cookie': authCookie('', secure) })
  }
  if (path === 'users') {
    if (method === 'POST') await addUser(db, input.name, input.password)
    if (method === 'GET' || method === 'POST') {
      return respond(response, 200, { users: db.prepare('SELECT name FROM users ORDER BY id').all() })
    }
  }
  if (method === 'POST' && path === 'password') {
    await replacePassword(db, user, input.current, input.next)
    return respond(response, 200, {}, { 'Set-Cookie': authCookie('', secure) })
  }
  if (path === 'events') {
    if (method === 'GET') {
      return respond(response, 200, { events: db.prepare('SELECT * FROM events ORDER BY rowid DESC').all().map(serial) })
    }
    if (method === 'POST') {
      const data = makeEvent(input)
      const id = randomUUID()
      db.prepare('INSERT INTO events (id, data) VALUES (?, ?)').run(id, JSON.stringify(data))
      return respond(response, 201, { event: { ...data, id, revision: 1 } })
    }
  }
  const event = /^events\/([0-9a-f-]{36})$/.exec(path)
  if (method === 'PATCH' && event) return respond(response, 200, { event: mutate(event[1], input) })
  if (method === 'DELETE' && event) return respond(response, 200, mutate(event[1], input, true))
  throw new Fault(404, '未找到接口。')
}

const server = createServer(async (request, response) => {
  const language = /^en\b/i.test(request.headers['accept-language'] ?? '') ? 'en' : 'zh'
  const failure = (status, key, values) => {
    const params = values?.field ? { ...values, field: translate(language, values.field) } : values
    return respond(response, status, { error: translate(language, key, params) })
  }
  try {
    const path = new URL(request.url, origin).pathname
    if (path.startsWith('/api/')) return await api(request, response, path.slice('/api/'.length))
    requireThat(request.method === 'GET' || request.method === 'HEAD', '请求方式无效。', 405)
    const asset = /^\/(assets\/[A-Za-z0-9_-]+\.(js|css|png))$/.exec(path)
    requireThat(path === '/' || asset, '未找到页面。', 404)
    const file = asset ? asset[1] : 'index.html'
    const bytes = await readFile(new URL(`./dist/${file}`, import.meta.url))
    const mime = { css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8', png: 'image/png' }
    response.writeHead(200, {
      ...responseHeaders,
      'Content-Type': mime[asset?.[2]] ?? 'text/html; charset=utf-8',
      'Cache-Control': asset ? 'public, max-age=31536000, immutable' : 'no-cache',
    })
    response.end(request.method === 'HEAD' ? undefined : bytes)
  } catch (error) {
    if (response.headersSent) return response.end()
    if (error instanceof Fault) return failure(error.status, error.key, error.values)
    if (error.code === 'ENOENT') return failure(404, '未找到资源。')
    console.error(error.stack)
    failure(500, '服务器暂时无法完成操作。')
  }
})
server.listen(port, '127.0.0.1', () => console.log(`SEP listening on 127.0.0.1:${port}`))
