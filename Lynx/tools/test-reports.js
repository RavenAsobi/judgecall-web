// 成绩回报功能端到端验证 v2（轮数前缀/去重/冲突标红/drop 重复标红/跨轮隔离）
const WebSocket = require('F:/搬家/lynx/server/node_modules/ws')
const BASE = 'http://localhost:3000'
const SUPER = 'edccao123123'
const PUTONG = '666666'

let passed = 0, failed = 0
function check(name, cond, extra) {
  if (cond) { passed++; console.log(`  ✅ ${name}`) }
  else { failed++; console.log(`  ❌ ${name}${extra !== undefined ? ' — ' + JSON.stringify(extra) : ''}`) }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function api(path, opts = {}, credential) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) }
  if (credential) headers['X-Credential'] = credential
  if (opts.name) headers['X-User-Name'] = encodeURIComponent(opts.name)
  const res = await fetch(BASE + path, { method: opts.method || 'GET', headers, body: opts.body ? JSON.stringify(opts.body) : undefined })
  const data = await res.json().catch(() => null)
  return { status: res.status, data }
}

function wsClient(name, credential) {
  const c = { name, credential, msgs: [], ws: null }
  c.connect = (tid) => new Promise((resolve, reject) => {
    c.ws = new WebSocket('ws://localhost:3000/ws')
    c.ws.on('open', () => c.ws.send(JSON.stringify({ type: 'join', tournamentId: tid, name, credential })))
    c.ws.on('message', (d) => {
      const m = JSON.parse(d.toString())
      c.msgs.push(m)
      if (m.type === 'snapshot') resolve()
    })
    c.ws.on('error', reject)
    setTimeout(() => reject(new Error(name + ' join timeout')), 5000)
  })
  c.ofType = (t) => c.msgs.filter(m => m.type === t)
  c.lastOfType = (t) => c.ofType(t).slice(-1)[0]
  // 等待消息框列表满足条件（服务器全量推送驱动）
  c.waitFeed = async (pred, ms = 3000) => {
    const t0 = Date.now()
    while (Date.now() - t0 < ms) {
      const m = c.lastOfType('reports')
      if (m && pred(m.list)) return m.list
      await sleep(50)
    }
    return c.lastOfType('reports')?.list || null
  }
  c.feed = () => c.lastOfType('reports')?.list || []
  c.send = (o) => c.ws.send(JSON.stringify(o))
  c.close = () => { try { c.ws.close() } catch {} }
  return c
}

async function main() {
  // 建比赛（super）
  const name = '回报测试' + Date.now() % 100000
  const created = await api('/api/tournaments', { method: 'POST', name: '主办', body: { name, game: 'MTG', password: 'abc123', date: '待定' } }, SUPER)
  check('建比赛', created.status === 201 || created.status === 200, created)
  const tid = created.data.id

  const judge = wsClient('小明', '')
  const mgrA = wsClient('主办', SUPER)
  const mgrC = wsClient('裁判长', PUTONG)
  await judge.connect(tid)
  await mgrA.connect(tid)
  await mgrC.connect(tid)
  await mgrA.waitFeed(l => l.length === 0)
  check('游客 join 不推回报列表', judge.ofType('reports').length === 0)

  // 1. 游客报成绩 → 管理端收到，新格式 R1 - 桌号 - player - 姓名 - 比分
  judge.send({ type: 'report', tableNo: 1, kind: 'score', body: 'player1 - 张伟 - 2:0' })
  const f1 = await mgrA.waitFeed(l => l.length === 1)
  check('super 收到成绩回报', f1 && f1.length === 1, f1)
  check('消息新格式', f1 && f1[0].text === 'R1 - 桌号1 - player1 - 张伟 - 2:0', f1 && f1[0].text)
  check('回报人是独立字段', f1 && f1[0].reporterName === '小明')
  check('该条不标红', f1 && !f1[0].conflict)

  // 2. 相同成绩再报 → 重复不显示（框仍 1 条），历史有 2 条且一条标 dup
  judge.send({ type: 'report', tableNo: 1, kind: 'score', body: 'player1 - 张伟 - 2:0' })
  await sleep(400)
  check('重复成绩不入消息框', mgrA.feed().length === 1, mgrA.feed())
  let hist = await api(`/api/tournaments/${tid}/reports`, { name: '主办' }, SUPER)
  check('历史含重复共 2 条', hist.data.length === 2, hist.data.length)
  check('历史里一条标 dup', hist.data.filter(r => r.dup).length === 1)

  // 3. 不同成绩 → 新的标红 + 原消息也标红，同组
  mgrC.send({ type: 'report', tableNo: 1, kind: 'score', body: 'player1 - 张伟 - 2:1' })
  const f3 = await mgrA.waitFeed(l => l.length === 2)
  check('super 框有 2 条（不同成绩冲突）', f3 && f3.length === 2, f3)
  check('两条都标红', f3 && f3.every(r => r.conflict === 1), f3 && f3.map(r => r.conflict))
  check('两条同组（grp 相同且非空）', f3 && f3[0].grp && f3[0].grp === f3[1].grp, f3 && f3.map(r => r.grp))
  const f3c = await mgrC.waitFeed(l => l.length === 1)
  check('putong 自己发的 2:1 不进自己框，只见 2:0 且同样标红', f3c && f3c.length === 1 && f3c[0].conflict === 1, f3c)

  // 4. drop：super 报李娜 Drop → putong 收到（super 自己不见）
  mgrA.send({ type: 'report', tableNo: 2, kind: 'drop', body: 'player2 - 李娜 - Drop' })
  const f4 = await mgrC.waitFeed(l => l.length === 2)
  check('putong 收到 super 的 drop', f4 && f4.some(r => r.text === 'R1 - 桌号2 - player2 - 李娜 - Drop' && r.reporterName === '主办'), f4)
  check('super 框不见自己的 drop', !mgrA.feed().some(r => r.text.includes('Drop')), mgrA.feed())

  // 5. 同玩家 drop 再报 → 新的标红，旧的不标红但同组
  judge.send({ type: 'report', tableNo: 2, kind: 'drop', body: 'player2 - 李娜 - Drop' })
  const f5 = await mgrC.waitFeed(l => l.length === 3)
  const drops = f5 ? f5.filter(r => r.text.includes('Drop')) : []
  check('putong 框有 2 条李娜 Drop', drops.length === 2, f5)
  const newDrop = drops.find(r => r.reporterName === '小明')
  const oldDrop = drops.find(r => r.reporterName === '主办')
  check('重复 drop：新的标红', newDrop && newDrop.conflict === 1, newDrop)
  check('重复 drop：旧的不标红', oldDrop && oldDrop.conflict === 0, oldDrop)
  check('重复 drop：两条同组', newDrop && oldDrop && newDrop.grp && newDrop.grp === oldDrop.grp, [newDrop?.grp, oldDrop?.grp])

  // 6. 新一轮：roundNumber→2 后同桌同分可再报（跨轮隔离）
  mgrA.send({ type: 'tables:patch', patch: { tables: [], roundNumber: 2 } })
  await sleep(300)
  judge.send({ type: 'report', tableNo: 1, kind: 'score', body: 'player1 - 张伟 - 2:0' })
  const f6 = await mgrA.waitFeed(l => l.some(r => r.text.startsWith('R2 -')))
  const r2 = f6 && f6.find(r => r.text.startsWith('R2 -'))
  check('新一轮同桌同分可再报且带 R2 前缀', r2 && r2.text === 'R2 - 桌号1 - player1 - 张伟 - 2:0', r2)
  check('新一轮这条不标红不判重', r2 && !r2.conflict && !r2.dup, r2)

  // 7. roundclear → 全场框空；历史 6 条全保留
  mgrA.send({ type: 'report:roundclear' })
  await sleep(300)
  check('roundclear 后 super 框空', mgrA.feed().length === 0, mgrA.feed())
  check('roundclear 后 putong 框空', mgrC.feed().length === 0, mgrC.feed())
  hist = await api(`/api/tournaments/${tid}/reports`, { name: '主办' }, SUPER)
  check('历史仍含全部 6 条', hist.data.length === 6, hist.data.length)
  const histJudge = await api(`/api/tournaments/${tid}/reports`, { name: '小明' })
  check('游客查历史被拒(403)', histJudge.status === 403)

  // 8. 删比赛 → 级联清
  await api(`/api/tournaments/${tid}`, { method: 'DELETE', name: '主办' }, SUPER)
  const Database = require('F:/搬家/lynx/server/node_modules/better-sqlite3')
  const db = new Database('F:/搬家/lynx/server/lynx.db', { readonly: true })
  const cnt = db.prepare('SELECT COUNT(*) c FROM reports WHERE tournamentId = ?').get(tid).c
  check('删比赛后 reports 级联清空', cnt === 0, cnt)
  db.close()

  judge.close(); mgrA.close(); mgrC.close()
  console.log(`\n结果：${passed} 通过，${failed} 失败`)
  process.exit(failed ? 1 : 0)
}

main().catch(e => { console.error('测试异常:', e); process.exit(1) })
