import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'

const require = createRequire(import.meta.url)
const serverDir = path.resolve(import.meta.dirname, '..')
const dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lynx-ui-test-')), 'ui.db')
process.env.DB_PATH = dbPath
const { db, tStmts, sessionStmts, saveTables } = require('../db')
const tid = Date.now()
const token = 'ui-test-token'
const eventCode = '123987'
tStmts.insert.run(tid, '套牌检查界面测试', '待定', 'FAB', 'Silver Age', 'ongoing', 'test', 4, 2, 1, 2,
  eventCode, 'D998', 0, null, null, 0)
sessionStmts.insert.run(crypto.createHash('sha256').update(token).digest('hex'),
  '界面测试裁判', 'event', eventCode, tid, Date.now() + 3600000, Date.now())
saveTables(tid, [
  { number: 1, p1: 'Alice', p2: 'Bob', playerId1: 'a', playerId2: 'b', playerIdNamespace1: 'gem-player-id', playerIdNamespace2: 'gem-player-id' },
  { number: 2, p1: 'Carol', p2: 'Dan', playerId1: 'c', playerId2: 'd', playerIdNamespace1: 'gem-player-id', playerIdNamespace2: 'gem-player-id' },
])
db.close()

const server = spawn(process.execPath, ['index.js'], {
  cwd: serverDir,
  env: { ...process.env, DB_PATH: dbPath, HOST: '127.0.0.1', PORT: '3199', NODE_ENV: 'development' },
  windowsHide: true,
  stdio: ['ignore', 'pipe', 'pipe'],
})
let output = ''
server.stdout.on('data', chunk => { output += chunk })
server.stderr.on('data', chunk => { output += chunk })
const { chromium } = await import('file:///C:/Users/jerry/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')
let browser
try {
  let ready = false
  for (let i = 0; i < 40; i++) {
    if (server.exitCode != null) throw new Error(`Server exited: ${output}`)
    try { ready = (await fetch('http://127.0.0.1:3199/api/health')).ok } catch {}
    if (ready) break
    await delay(100)
  }
  assert.ok(ready, `Server did not start: ${output}`)
  browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(({ tid, token }) => {
    localStorage.setItem('lynxAuth', JSON.stringify({ name: '界面测试裁判', token,
      expiresAt: Date.now() + 3600000, lastPage: { page: 'detail', tournamentId: tid } }))
  }, { tid, token })
  await page.goto('http://127.0.0.1:3199/lynx-beta.html')
  await page.locator('#page-tournament-detail.active').waitFor()
  assert.match(await page.locator('.mobile-legend').innerText(), /红色：仍在对局/)
  await page.evaluate(() => { window.pressStart(1); window.pressEnd(1) })
  await page.locator('#tables-grid .table-square.c-red').waitFor()
  await page.waitForFunction(() => !document.querySelector('#page-tournament-detail')?.classList.contains('sync-busy'))
  await page.locator('#m-filter-playing').click()
  assert.equal(await page.locator('#m-filter-playing').getAttribute('aria-pressed'), 'true')
  assert.equal(await page.locator('#filter-playing').getAttribute('aria-pressed'), 'true')
  assert.equal(await page.locator('#tables-grid .table-square.c-red').count(), 0)
  await page.locator('#m-filter-playing').click()
  await page.locator('#tables-grid .table-square.c-red').waitFor()
  await page.evaluate(() => { window.pressStart(1); window.pressEnd(1) })
  await page.locator('#tables-grid .table-square.c-yellow').waitFor()
  await page.waitForFunction(() => !document.querySelector('#page-tournament-detail')?.classList.contains('sync-busy'))
  await page.locator('#m-filter-judge').click()
  assert.equal(await page.locator('#tables-grid .table-square.c-yellow').count(), 0)
  await page.locator('#m-filter-judge').click()
  await page.evaluate(() => { window.pressStart(1); window.pressEnd(1) })
  await page.locator('#tables-grid .table-square.c-green').waitFor()
  await page.locator('#m-filter-submitted').click()
  assert.equal(await page.locator('#tables-grid .table-square.c-green').count(), 0)
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  await page.screenshot({ path: path.resolve(serverDir, '..', '..', '.tmp', 'lynx-floor-filters-mobile.png'), fullPage: true })
  await page.locator('#m-filter-submitted').click()
  await page.locator('#tables-grid .table-square.c-green').waitFor()
  await page.locator('#nav-username').click()
  await page.locator('#deck-view:not(.hidden)').waitFor()
  assert.equal(await page.locator('.deck-row').count(), 2)
  await page.locator('#deck-pick-count').fill('1')
  await page.locator('#deck-min-points').fill('1')
  await page.getByRole('button', { name: '随机抽选' }).click()
  assert.match(await page.locator('#deck-pick-result').innerText(), /仅 0 桌/)

  await page.locator('#deck-standings-btn').click()
  await page.locator('#standings-json').fill(JSON.stringify({ schema: 'lynx-standings-v1', source: 'gem',
    roundCompleted: 1, idNamespace: 'gem-player-id', rows: [
      { name: 'Alice', playerId: 'a', points: 3, rank: 1 },
      { name: 'Bob', playerId: 'b', points: 3, rank: 2 },
      { name: 'Carol', playerId: 'c', points: 0, rank: 3 },
      { name: 'Dan', playerId: 'd', points: 0, rank: 4 },
    ] }))
  await page.locator('#standings-confirm').check()
  await page.locator('#standings-modal .btn-primary').click()
  await page.locator('#standings-modal').waitFor({ state: 'hidden' })
  await page.getByRole('button', { name: '随机抽选' }).click()
  assert.match(await page.locator('#deck-pick-result').innerText(), /#1/)
  await page.locator('.deck-row').first().click()
  await page.locator('#deck-mark-1').click()
  await page.locator('#deck-time').fill('10')
  await page.locator('#deck-modal .btn-primary').click()
  await page.locator('#deck-modal').waitFor({ state: 'hidden' })
  assert.match(await page.locator('.deck-row').first().innerText(), /DC 1 \/ 0/)
  await page.locator('.deck-row').first().click()
  await page.locator('#deck-modal-players').getByRole('button', { name: '添加判罚' }).first().click()
  await page.locator('#penalty-time').fill('5')
  page.once('dialog', dialog => dialog.accept())
  await page.locator('#penalty-modal .btn-primary').click()
  await page.locator('#penalty-modal').waitFor({ state: 'hidden' })
  await page.locator('#deck-modal').getByRole('button', { name: '取消' }).click()
  await page.reload()
  await page.locator('#deck-view:not(.hidden)').waitFor()
  assert.match(await page.locator('.deck-row').first().innerText(), /3 \/ 3 分/)
  await page.locator('.deck-row').first().click()
  assert.match(await page.locator('#deck-modal-players').innerText(), /判罚记录（1）/)
  assert.match(await page.locator('#deck-modal-players').innerText(), /检查与备注（1）/)
  await page.locator('#deck-modal').getByRole('button', { name: '取消' }).click()
  await page.screenshot({ path: path.resolve(serverDir, '..', '..', '.tmp', 'lynx-deck-mobile.png'), fullPage: true })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.screenshot({ path: path.resolve(serverDir, '..', '..', '.tmp', 'lynx-deck-desktop.png'), fullPage: true })
  await page.locator('#nav-username').click()
  await page.locator('#deck-view').waitFor({ state: 'hidden' })
  await page.evaluate(() => window.openTableSettings(1))
  assert.match(await page.locator('#tm-penalty-summary').innerText(), /判罚记录（1）/)
  assert.doesNotMatch(await page.locator('#tm-penalty-records').innerText(), /套牌检查/)
  await page.locator('#table-modal').getByRole('button', { name: '添加判罚' }).click()
  assert.equal(await page.locator('#penalty-value option').count(), 5)
  await page.locator('#penalty-time').fill('0')
  await page.locator('#penalty-modal .btn-primary').click()
  await page.locator('#penalty-modal').waitFor({ state: 'hidden' })
  await page.waitForFunction(() => document.querySelector('#tm-penalty-summary')?.textContent === '判罚记录（2）')
  await page.locator('#tm-penalty-summary').click()
  await page.screenshot({ path: path.resolve(serverDir, '..', '..', '.tmp', 'lynx-floor-penalties-desktop.png') })
  await page.locator('#table-modal').getByRole('button', { name: '完成' }).click()
  await page.locator('#filter-timeext').click()
  assert.equal(await page.locator('#tables-grid .table-square').count(), 1)
  await page.locator('#filter-timeext').click()
  await page.locator('#detail-next-round-btn').click()
  await page.locator('#settlement-modal:not(.hidden)').waitFor()
  assert.equal(await page.locator('#settlement-submit').isDisabled(), true)
  await page.locator('#settlement-modal').getByRole('button', { name: '取消' }).click()
  await page.evaluate(() => window.openTableSettings(1))
  await page.locator('#tm-fab-options [data-r="p1"]').click()
  await page.locator('#table-modal').getByRole('button', { name: '完成' }).click()
  await page.evaluate(() => window.openTableSettings(2))
  await page.locator('#tm-fab-options [data-r="draw"]').click()
  await page.locator('#table-modal').getByRole('button', { name: '完成' }).click()
  await page.locator('#detail-next-round-btn').click()
  await page.locator('#settlement-modal:not(.hidden)').waitFor()
  assert.match(await page.locator('#settlement-summary').innerText(), /胜负桌 1 · 平局桌 1/)
  assert.equal(await page.locator('#settlement-baseline-confirm-row').isVisible(), false)
  assert.equal(await page.locator('#settlement-policy-confirm-row').isVisible(), true)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: path.resolve(serverDir, '..', '..', '.tmp', 'lynx-settlement-mobile.png'), fullPage: true })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  await page.locator('#settlement-policy-confirm').check()
  await page.locator('#settlement-submit').click()
  await page.locator('#settlement-modal').waitFor({ state: 'hidden' })
  await page.waitForFunction(() => document.querySelector('#round-display')?.textContent === 'R3')
  await page.locator('#nav-username').click()
  await page.locator('#deck-view:not(.hidden)').waitFor()
  assert.match(await page.locator('#deck-standings-status').innerText(), /Lynx 自动结算 R2/)
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.screenshot({ path: path.resolve(serverDir, '..', '..', '.tmp', 'lynx-auto-standings-desktop.png'), fullPage: true })
  assert.deepEqual(errors, [])
  console.log('UI smoke test passed; screenshots in D:\\JudgeCall-Web\\.tmp')
} finally {
  if (browser) await browser.close()
  server.kill()
}
