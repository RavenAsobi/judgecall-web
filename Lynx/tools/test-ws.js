// 临时验证脚本：测试 WebSocket 能否穿透 Cloudflare Tunnel 到达本机后端
const WebSocket = require('F:/搬家/lynx/server/node_modules/ws')
const url = process.argv[2] || 'ws://localhost:3000/ws'
const ws = new WebSocket(url)
const timer = setTimeout(() => { console.log('TIMEOUT: 10s 内无响应'); process.exit(1) }, 10000)

ws.on('open', () => {
  console.log('WS OPEN:', url)
  // 故意 join 一个不存在的比赛——收到服务器的 error 消息即证明 WS 双向通信正常
  ws.send(JSON.stringify({ type: 'join', tournamentId: 999999, name: '穿透测试', credential: '' }))
})
ws.on('message', (d) => {
  console.log('WS MSG:', d.toString().slice(0, 300))
  clearTimeout(timer)
  ws.close()
  process.exit(0)
})
ws.on('error', (e) => { console.error('WS ERROR:', e.message); clearTimeout(timer); process.exit(1) })
