// db.js — SQLite 初始化与数据访问层
// 单文件数据库 lynx.db，首次启动自动建表
const fs = require('fs')
const path = require('path')
const Database = require('better-sqlite3')
const config = require('./config')

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true })
const db = new Database(config.dbPath)

db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

// ==================== 建表 ====================
db.exec(`
-- 权限密码（普通；原初密码硬编码不入库）
CREATE TABLE IF NOT EXISTS grants (
  code      TEXT PRIMARY KEY,          -- 6 位随机密码
  num       TEXT NOT NULL,             -- 编号 P001+
  level     INTEGER NOT NULL,          -- 2=普通（只保留 level=2）
  note      TEXT DEFAULT '',
  expiry    TEXT NOT NULL,             -- YYYY-MM-DD
  active    INTEGER NOT NULL DEFAULT 1,
  by        TEXT DEFAULT '',           -- 发放人用户名
  fromCode  TEXT,                      -- 保留字段，恒为 null（只有 super 发密码）
  createdAt INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000)
);

-- 比赛
CREATE TABLE IF NOT EXISTS tournaments (
  id            INTEGER PRIMARY KEY,   -- 时间戳 ID（Date.now()）
  name          TEXT NOT NULL UNIQUE,
  date          TEXT DEFAULT '待定',
  game          TEXT NOT NULL,         -- FAB / MTG
  format        TEXT DEFAULT '未指定',
  status        TEXT NOT NULL DEFAULT 'upcoming',  -- upcoming/ongoing/completed
  password      TEXT NOT NULL,         -- 进入密码（裁判/游客用）
  players       INTEGER DEFAULT 0,
  maxTables     INTEGER,
  startTable    INTEGER DEFAULT 1,
  roundNumber   INTEGER DEFAULT 1,
  eventCode     TEXT,                  -- 单场权限密码（6位）
  eventNum      TEXT,                  -- D001+
  tableReversed INTEGER DEFAULT 0,
  layoutCode    TEXT,                  -- 桌号编码原文
  layoutRows    TEXT,                  -- 解析后的布局矩阵 JSON
  manualOnly    INTEGER NOT NULL DEFAULT 0,
  lastImportRound INTEGER NOT NULL DEFAULT 0,
  stateRevision INTEGER NOT NULL DEFAULT 0,
  createdAt     INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000)
);

-- 桌子方块（每场比赛一组）
CREATE TABLE IF NOT EXISTS tables (
  tournamentId INTEGER NOT NULL,
  number       INTEGER NOT NULL,
  color        TEXT NOT NULL DEFAULT 'white',  -- white/yellow/red/green/black (Ghost)
  p1           TEXT DEFAULT '',
  p2           TEXT DEFAULT '',
  result       TEXT,                   -- JSON：FAB 'p1'/'p2'/'draw'；MTG {p1,p2,draws}
  timeExt      INTEGER DEFAULT 0,
  watchedBy    TEXT,
  drop1        INTEGER DEFAULT 0,
  drop2        INTEGER DEFAULT 0,
  greenManual  INTEGER DEFAULT 0,      -- 手动染绿
  greenAt      INTEGER,                -- 染绿毫秒时间戳
  resultSource TEXT,                  -- judge / manager / import
  outcomeType TEXT,                   -- BYE / LOSSALL / GHOST / normal result
  focus        INTEGER NOT NULL DEFAULT 0,
  revision     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (tournamentId, number),
  FOREIGN KEY (tournamentId) REFERENCES tournaments(id) ON DELETE CASCADE
);

-- 计时器（服务器权威）
CREATE TABLE IF NOT EXISTS timers (
  tournamentId INTEGER PRIMARY KEY,
  configured   INTEGER NOT NULL DEFAULT 50,      -- 分钟
  remaining    INTEGER NOT NULL DEFAULT 3000,    -- 秒
  running      INTEGER NOT NULL DEFAULT 0,
  updatedAt    INTEGER NOT NULL,                 -- 毫秒时间戳
  FOREIGN KEY (tournamentId) REFERENCES tournaments(id) ON DELETE CASCADE
);

-- 顶部保留入口（跟随权限密码）
CREATE TABLE IF NOT EXISTS pins (
  credential   TEXT NOT NULL,          -- 权限密码
  tournamentId INTEGER NOT NULL,
  createdAt    INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000),
  PRIMARY KEY (credential, tournamentId),
  FOREIGN KEY (tournamentId) REFERENCES tournaments(id) ON DELETE CASCADE
);

-- 用户名免密缓存（3 天免密，<24h 刷新至 24h）
CREATE TABLE IF NOT EXISTS user_cache (
  username     TEXT NOT NULL,
  tournamentId INTEGER NOT NULL,
  expiresAt    INTEGER NOT NULL,       -- 毫秒时间戳
  PRIMARY KEY (username, tournamentId),
  FOREIGN KEY (tournamentId) REFERENCES tournaments(id) ON DELETE CASCADE
);

-- 成绩回报（任何用户在单桌弹窗提交成绩/Drop 时生成；历史永久保留，随比赛删除级联清）
CREATE TABLE IF NOT EXISTS reports (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  tournamentId       INTEGER NOT NULL,
  tableNo            INTEGER NOT NULL,
  round              INTEGER NOT NULL DEFAULT 1,   -- 产生时的轮数（相同/不同按 轮数+桌号 判定）
  kind               TEXT NOT NULL DEFAULT 'score',-- score / drop
  body               TEXT NOT NULL DEFAULT '',     -- 回报正文（去重/冲突比较键）
  reporterName       TEXT NOT NULL,        -- 提交者用户名（服务器取自 WS 会话）
  reporterCredential TEXT NOT NULL DEFAULT '', -- 提交者权限密码（游客为空；用于"自己的操作不进自己消息框"）
  text               TEXT NOT NULL,        -- 完整消息："R1: 用户A: 桌号B, XXX Win 2:0 / 1:1 Draw / XXX Drop"
  dup                INTEGER NOT NULL DEFAULT 0,   -- 1=重复成绩回报，不进消息框（历史保留）
  conflict           INTEGER NOT NULL DEFAULT 0,   -- 1=标红（冲突）
  grp                TEXT,                   -- 冲突分组键（悬停联动闪烁），同组同键
  roundCleared       INTEGER NOT NULL DEFAULT 0, -- 导入新一轮时置 1（从所有人消息框隐藏，历史保留）
  createdAt          INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000),
  FOREIGN KEY (tournamentId) REFERENCES tournaments(id) ON DELETE CASCADE
);

-- 回报确认记录（每个权限用户独立确认；确认=从自己的消息框隐藏）
CREATE TABLE IF NOT EXISTS report_acks (
  reportId         INTEGER NOT NULL,
  viewerCredential TEXT NOT NULL,      -- 权限密码（确认者）
  ackedAt          INTEGER NOT NULL,
  PRIMARY KEY (reportId, viewerCredential),
  FOREIGN KEY (reportId) REFERENCES reports(id) ON DELETE CASCADE
);

-- ????????????? token??????? token ? SHA-256?
CREATE TABLE IF NOT EXISTS sessions (
  tokenHash         TEXT PRIMARY KEY,
  username          TEXT NOT NULL,
  role              TEXT NOT NULL,
  credential        TEXT NOT NULL,
  eventTournamentId INTEGER,
  expiresAt         INTEGER NOT NULL,
  createdAt         INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_grants_expiry ON grants(expiry);
CREATE INDEX IF NOT EXISTS idx_user_cache_exp ON user_cache(expiresAt);
CREATE INDEX IF NOT EXISTS idx_reports_tid ON reports(tournamentId);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expiresAt);
`)

// ==================== 旧库兼容：ALTER TABLE 加列 ====================
// 已有 lynx.db 是旧表结构，启动时检测并补列（已存在则忽略）
function ensureColumn(table, column, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all()
  if (!cols.some(c => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`)
    return true
  }
  return false
}
ensureColumn('tables', 'greenManual', 'greenManual INTEGER DEFAULT 0')
ensureColumn('tables', 'greenAt', 'greenAt INTEGER')
ensureColumn('tables', 'resultSource', 'resultSource TEXT')
ensureColumn('tables', 'outcomeType', 'outcomeType TEXT')
ensureColumn('tables', 'focus', 'focus INTEGER NOT NULL DEFAULT 0')
ensureColumn('tables', 'revision', 'revision INTEGER NOT NULL DEFAULT 0')
ensureColumn('tables', 'playerId1', 'playerId1 TEXT')
ensureColumn('tables', 'playerId2', 'playerId2 TEXT')
ensureColumn('tables', 'playerIdNamespace1', 'playerIdNamespace1 TEXT')
ensureColumn('tables', 'playerIdNamespace2', 'playerIdNamespace2 TEXT')
ensureColumn('tournaments', 'manualOnly', 'manualOnly INTEGER NOT NULL DEFAULT 0')
ensureColumn('tournaments', 'stateRevision', 'stateRevision INTEGER NOT NULL DEFAULT 0')
ensureColumn('tournaments', 'scoringPolicy', 'scoringPolicy TEXT')
db.exec(`
CREATE TABLE IF NOT EXISTS lynx_standings (
  tournamentId INTEGER NOT NULL, roundCompleted INTEGER NOT NULL,
  playerKey TEXT NOT NULL, name TEXT NOT NULL, points REAL NOT NULL,
  rank INTEGER, importedAt INTEGER NOT NULL,
  source TEXT NOT NULL DEFAULT 'external', importedBy TEXT,
  baselineIncomplete INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (tournamentId, roundCompleted, playerKey),
  FOREIGN KEY (tournamentId) REFERENCES tournaments(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS lynx_judge_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournamentId INTEGER NOT NULL, round INTEGER NOT NULL, tableNo INTEGER NOT NULL,
  playerKey TEXT NOT NULL, playerName TEXT NOT NULL,
  kind TEXT NOT NULL, infraction TEXT, penalty TEXT, note TEXT NOT NULL DEFAULT '',
  minutes INTEGER NOT NULL DEFAULT 0,
  reporter TEXT NOT NULL, createdAt INTEGER NOT NULL,
  FOREIGN KEY (tournamentId) REFERENCES tournaments(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_lynx_records_event ON lynx_judge_records(tournamentId, playerKey);
CREATE TABLE IF NOT EXISTS lynx_round_closures (
  tournamentId INTEGER NOT NULL, round INTEGER NOT NULL,
  policyJson TEXT NOT NULL, partialBaseline INTEGER NOT NULL DEFAULT 0,
  closedBy TEXT NOT NULL, closedAt INTEGER NOT NULL,
  PRIMARY KEY (tournamentId, round),
  FOREIGN KEY (tournamentId) REFERENCES tournaments(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS lynx_round_results (
  tournamentId INTEGER NOT NULL, round INTEGER NOT NULL, tableNo INTEGER NOT NULL,
  seat INTEGER NOT NULL, playerKey TEXT NOT NULL, playerName TEXT NOT NULL,
  opponentKey TEXT, outcome TEXT NOT NULL, points INTEGER NOT NULL,
  resultSource TEXT, rawResult TEXT, outcomeType TEXT,
  createdAt INTEGER NOT NULL,
  PRIMARY KEY (tournamentId, round, tableNo, seat),
  FOREIGN KEY (tournamentId) REFERENCES tournaments(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_lynx_round_player ON lynx_round_results(tournamentId, playerKey, round);
CREATE TABLE IF NOT EXISTS lynx_standings_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournamentId INTEGER NOT NULL, roundCompleted INTEGER NOT NULL,
  batchId TEXT NOT NULL, playerKey TEXT NOT NULL, playerName TEXT NOT NULL,
  oldPoints INTEGER, newPoints INTEGER, oldRank INTEGER, newRank INTEGER,
  changedBy TEXT NOT NULL, changedAt INTEGER NOT NULL,
  FOREIGN KEY (tournamentId) REFERENCES tournaments(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_lynx_standings_audit ON lynx_standings_audit(tournamentId, roundCompleted, id);
`)
ensureColumn('lynx_judge_records', 'minutes', 'minutes INTEGER NOT NULL DEFAULT 0')
ensureColumn('lynx_standings', 'source', "source TEXT NOT NULL DEFAULT 'external'")
ensureColumn('lynx_standings', 'importedBy', 'importedBy TEXT')
ensureColumn('lynx_standings', 'baselineIncomplete', 'baselineIncomplete INTEGER NOT NULL DEFAULT 0')
// 旧赛事若已有选手/导入结果，保守视为本轮已导入，避免升级后首次再次导入误删现场桌台。
if (ensureColumn('tournaments', 'lastImportRound', 'lastImportRound INTEGER NOT NULL DEFAULT 0')) {
  db.exec(`UPDATE tournaments SET lastImportRound = roundNumber WHERE EXISTS (
    SELECT 1 FROM tables WHERE tables.tournamentId = tournaments.id
      AND (tables.resultSource = 'import' OR tables.p1 <> '' OR tables.p2 <> '')
  )`)
}
// 规则 2：比赛结束判定 + 90 天留存所需的三个时间戳
ensureColumn('tournaments', 'lastAccessAt', 'lastAccessAt INTEGER')  // 最近访问毫秒时间戳
ensureColumn('tournaments', 'lastOpAt', 'lastOpAt INTEGER')          // 最近操作毫秒时间戳
ensureColumn('tournaments', 'endedAt', 'endedAt INTEGER')            // 判定为结束的那一刻（毫秒），null=未结束
// 回报系统细化（7-26 晚）：轮数/类型/原文/重复/标红/冲突分组
ensureColumn('reports', 'round', 'round INTEGER NOT NULL DEFAULT 1')       // 产生时的轮数（相同/不同按 轮数+桌号 判定）
ensureColumn('reports', 'kind', "kind TEXT NOT NULL DEFAULT 'score'")      // score / drop
ensureColumn('reports', 'body', "body TEXT NOT NULL DEFAULT ''")           // 回报正文（"张伟 Win 2:0"），去重/冲突比较键
ensureColumn('reports', 'dup', 'dup INTEGER NOT NULL DEFAULT 0')           // 1=重复成绩回报，不进消息框（历史保留）
ensureColumn('reports', 'conflict', 'conflict INTEGER NOT NULL DEFAULT 0') // 1=标红
ensureColumn('reports', 'grp', 'grp TEXT')                                 // 冲突分组键（悬停联动闪烁用），同组同键

// ==================== 工具 ====================
function localDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function daysFromNow(n) {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return localDateStr(d)
}

// ==================== grants ====================
const grantStmts = {
  all: db.prepare('SELECT * FROM grants ORDER BY createdAt DESC'),
  byCode: db.prepare('SELECT * FROM grants WHERE code = ?'),
  insert: db.prepare('INSERT INTO grants (code,num,level,note,expiry,active,by,fromCode) VALUES (?,?,?,?,?,1,?,?)'),
  updateNote: db.prepare('UPDATE grants SET note = ? WHERE code = ?'),
  updateExpiry: db.prepare('UPDATE grants SET expiry = ? WHERE code = ?'),
  delete: db.prepare('DELETE FROM grants WHERE code = ?'),
  maxNum: db.prepare("SELECT num FROM grants WHERE level = ? AND num LIKE ? ORDER BY num DESC LIMIT 1"),
  purge: db.prepare('DELETE FROM grants WHERE expiry < ?'),
}

function grantNum(level) {
  // 只保留 level=2 普通密码（P 前缀）
  const prefix = 'P'
  const row = grantStmts.maxNum.get(level, prefix + '%')
  let max = 0
  if (row && row.num) {
    const n = parseInt(row.num.slice(1))
    if (!isNaN(n)) max = n
  }
  return prefix + String(max + 1).padStart(3, '0')
}

/** 密码是否生效（按有效期动态判断） */
function grantActive(g) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return g.active && new Date(g.expiry) >= today
}

/** 清理过期超过 90 天的密码（失效后留存 90 天再永久删除） */
function purgeExpiredGrants() {
  const cutoff = new Date()
  cutoff.setHours(0, 0, 0, 0)
  cutoff.setDate(cutoff.getDate() - 90)
  grantStmts.purge.run(localDateStr(cutoff))
}

// ==================== tournaments ====================
const tStmts = {
  all: db.prepare('SELECT * FROM tournaments ORDER BY createdAt DESC'),
  byId: db.prepare('SELECT * FROM tournaments WHERE id = ?'),
  byName: db.prepare('SELECT * FROM tournaments WHERE name = ?'),
  byEventCode: db.prepare('SELECT * FROM tournaments WHERE eventCode = ?'),
  insert: db.prepare(`INSERT INTO tournaments
    (id,name,date,game,format,status,password,players,maxTables,startTable,roundNumber,eventCode,eventNum,tableReversed,layoutCode,layoutRows,manualOnly)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`),
  update: db.prepare(`UPDATE tournaments SET
    name=?,date=?,game=?,format=?,status=?,password=?,players=?,maxTables=?,startTable=?,
    roundNumber=?,eventCode=?,eventNum=?,tableReversed=?,layoutCode=?,layoutRows=?,manualOnly=?,
    stateRevision=stateRevision+1
    WHERE id=?`),
  bumpStateRevision: db.prepare('UPDATE tournaments SET stateRevision=stateRevision+1 WHERE id=?'),
  setRoundAndCount: db.prepare('UPDATE tournaments SET roundNumber=?,maxTables=?,stateRevision=stateRevision+1 WHERE id=?'),
  setRoundAndCountClearLayout: db.prepare('UPDATE tournaments SET roundNumber=?,maxTables=?,layoutCode=NULL,layoutRows=NULL,stateRevision=stateRevision+1 WHERE id=?'),
  setScoringPolicy: db.prepare('UPDATE tournaments SET scoringPolicy=? WHERE id=?'),
  markImportedRound: db.prepare('UPDATE tournaments SET lastImportRound=? WHERE id=?'),
  clearImportedRound: db.prepare('UPDATE tournaments SET lastImportRound=0 WHERE id=?'),
  delete: db.prepare('DELETE FROM tournaments WHERE id = ?'),
  maxEventNum: db.prepare("SELECT eventNum FROM tournaments WHERE eventNum LIKE 'D%' ORDER BY eventNum DESC LIMIT 1"),
  touchAccess: db.prepare('UPDATE tournaments SET lastAccessAt = ? WHERE id = ?'),
  touchOp: db.prepare('UPDATE tournaments SET lastOpAt = ? WHERE id = ?'),
  setEnded: db.prepare('UPDATE tournaments SET endedAt = ? WHERE id = ?'),
  deleteEndedBefore: db.prepare('DELETE FROM tournaments WHERE endedAt IS NOT NULL AND endedAt < ?'),
}

const THREE_DAYS_MS = 3 * 24 * 3600 * 1000
const SEVEN_DAYS_MS = 7 * 24 * 3600 * 1000
const NINETY_DAYS_MS = 90 * 24 * 3600 * 1000

/** 刷新最近访问时间 */
function touchAccess(id) { tStmts.touchAccess.run(Date.now(), id) }

/** 刷新最近操作时间 */
function touchOp(id) { tStmts.touchOp.run(Date.now(), id) }

/** 比赛开始时间的毫秒时间戳；'待定' 或非法日期返回 null（视为永不开始 → 永不判结束） */
function startTimeMs(t) {
  if (!t || !t.date || t.date === '待定') return null
  const ms = new Date(t.date + 'T00:00:00').getTime()
  return isNaN(ms) ? null : ms
}

/**
 * 结束判定（三条件同时满足才算结束）：
 *  ① 当前时间 > 比赛开始时间
 *  ② 最近 3 天无人访问（lastAccessAt 距今 > 3 天）
 *  ③ 最近 7 天无人操作（lastOpAt 距今 > 7 天）
 * lastAccessAt/lastOpAt 为 null 时按 createdAt 兜底（避免老比赛被误判）。
 * 满足则写入 endedAt=now（只写一次，之后不再变化）。
 */
function checkEnded(t) {
  if (!t || t.endedAt) return false // 已结束过不再重复判
  const now = Date.now()
  const start = startTimeMs(t)
  if (start == null) return false                       // 条件①：待定永不判结束
  if (now <= start) return false                        // 条件①：还没过开始时间
  const accessBase = t.lastAccessAt != null ? t.lastAccessAt : t.createdAt
  const opBase = t.lastOpAt != null ? t.lastOpAt : t.createdAt
  if (now - accessBase <= THREE_DAYS_MS) return false   // 条件②：3 天内还有人访问
  if (now - opBase <= SEVEN_DAYS_MS) return false       // 条件③：7 天内还有人操作
  tStmts.setEnded.run(now, t.id)
  return true
}

/** 删除已结束且超过 90 天的比赛（tables/timers/pins/user_cache 由外键级联一并删除） */
function purgeEndedTournaments() {
  const cutoff = Date.now() - NINETY_DAYS_MS
  return tStmts.deleteEndedBefore.run(cutoff).changes
}

/** 启动时统一执行：对所有未结束比赛判一次结束，再删除超 90 天的已结束比赛 */
function startupPurgeTournaments() {
  const all = tStmts.all.all().map(rowToTournament)
  let endedCount = 0
  for (const t of all) {
    if (checkEnded(t)) endedCount++
  }
  const purged = purgeEndedTournaments()
  if (endedCount || purged) {
    console.log(`[清理] 新判定结束 ${endedCount} 场，删除超90天比赛 ${purged} 场`)
  }
}

function nextEventNum() {
  const row = tStmts.maxEventNum.get()
  let max = 0
  if (row && row.eventNum) {
    const n = parseInt(row.eventNum.slice(1))
    if (!isNaN(n)) max = n
  }
  return 'D' + String(max + 1).padStart(3, '0')
}

function rowToTournament(r) {
  if (!r) return null
  return {
    id: r.id, name: r.name, date: r.date, game: r.game, format: r.format,
    status: r.status, password: r.password, players: r.players,
    maxTables: r.maxTables, startTable: r.startTable, roundNumber: r.roundNumber,
    eventCode: r.eventCode, eventNum: r.eventNum,
    tableReversed: !!r.tableReversed,
    layoutCode: r.layoutCode,
    layoutRows: r.layoutRows ? JSON.parse(r.layoutRows) : null,
    manualOnly: !!r.manualOnly,
    scoringPolicy: r.scoringPolicy ? JSON.parse(r.scoringPolicy) : null,
    lastImportRound: r.lastImportRound || 0,
    stateRevision: r.stateRevision || 0,
    lastAccessAt: r.lastAccessAt != null ? r.lastAccessAt : null,
    lastOpAt: r.lastOpAt != null ? r.lastOpAt : null,
    endedAt: r.endedAt != null ? r.endedAt : null,
    createdAt: r.createdAt,
  }
}

// ==================== tables ====================
const tableStmts = {
  all: db.prepare('SELECT * FROM tables WHERE tournamentId = ? ORDER BY number'),
  upsert: db.prepare(`INSERT INTO tables (tournamentId,number,color,p1,p2,result,timeExt,watchedBy,drop1,drop2,greenManual,greenAt,resultSource,outcomeType,focus,revision,playerId1,playerId2,playerIdNamespace1,playerIdNamespace2)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(tournamentId,number) DO UPDATE SET
    color=excluded.color,p1=excluded.p1,p2=excluded.p2,result=excluded.result,
    timeExt=excluded.timeExt,watchedBy=excluded.watchedBy,drop1=excluded.drop1,drop2=excluded.drop2,
    greenManual=excluded.greenManual,greenAt=excluded.greenAt,resultSource=excluded.resultSource,outcomeType=excluded.outcomeType,
    focus=excluded.focus,revision=excluded.revision,
    playerId1=excluded.playerId1,playerId2=excluded.playerId2,
    playerIdNamespace1=excluded.playerIdNamespace1,playerIdNamespace2=excluded.playerIdNamespace2`),
  byNumber: db.prepare('SELECT * FROM tables WHERE tournamentId=? AND number=?'),
  deleteByTournament: db.prepare('DELETE FROM tables WHERE tournamentId = ?'),
}

function rowToTable(r) {
  return {
    number: r.number, color: r.color, p1: r.p1, p2: r.p2,
    result: r.result ? JSON.parse(r.result) : null,
    timeExt: r.timeExt, watchedBy: r.watchedBy,
    drop1: !!r.drop1, drop2: !!r.drop2,
    greenManual: !!r.greenManual, greenAt: r.greenAt,
    resultSource: r.resultSource || null, outcomeType: r.outcomeType || null,
    focus: !!r.focus, revision: r.revision || 0,
    playerId1: r.playerId1 || null, playerId2: r.playerId2 || null,
    playerIdNamespace1: r.playerIdNamespace1 || null, playerIdNamespace2: r.playerIdNamespace2 || null,
  }
}

function getTables(tournamentId) {
  return tableStmts.all.all(tournamentId).map(rowToTable)
}

function saveTables(tournamentId, tables) {
  const tx = db.transaction((list) => {
    tableStmts.deleteByTournament.run(tournamentId)
    for (const t of list) {
      tableStmts.upsert.run(
        tournamentId, t.number, t.color || 'white',
        t.p1 || '', t.p2 || '',
        t.result != null ? JSON.stringify(t.result) : null,
        t.timeExt || 0, t.watchedBy || null,
        t.drop1 ? 1 : 0, t.drop2 ? 1 : 0,
        t.greenManual ? 1 : 0, t.greenAt != null ? t.greenAt : null,
        t.resultSource || null, t.outcomeType || null, t.focus ? 1 : 0, t.revision || 0,
        t.playerId1 || null, t.playerId2 || null,
        t.playerIdNamespace1 || null, t.playerIdNamespace2 || null
      )
    }
  })
  tx(tables)
}

function getTable(tournamentId, number) {
  const row = tableStmts.byNumber.get(tournamentId, number)
  return row ? rowToTable(row) : null
}

function saveTable(tournamentId, t) {
  tableStmts.upsert.run(
    tournamentId, t.number, t.color || 'white', t.p1 || '', t.p2 || '',
    t.result != null ? JSON.stringify(t.result) : null, t.timeExt || 0,
    t.watchedBy || null, t.drop1 ? 1 : 0, t.drop2 ? 1 : 0,
    t.greenManual ? 1 : 0, t.greenAt != null ? t.greenAt : null,
    t.resultSource || null, t.outcomeType || null, t.focus ? 1 : 0, t.revision || 0,
    t.playerId1 || null, t.playerId2 || null,
    t.playerIdNamespace1 || null, t.playerIdNamespace2 || null
  )
}

// ==================== timers ====================
const timerStmts = {
  get: db.prepare('SELECT * FROM timers WHERE tournamentId = ?'),
  upsert: db.prepare(`INSERT INTO timers (tournamentId,configured,remaining,running,updatedAt)
    VALUES (?,?,?,?,?)
    ON CONFLICT(tournamentId) DO UPDATE SET
    configured=excluded.configured,remaining=excluded.remaining,
    running=excluded.running,updatedAt=excluded.updatedAt`),
}

function defaultTimer(configured = 50) {
  return { configured, remaining: configured * 60, running: false, updatedAt: Date.now() }
}

function getTimer(tournamentId, defaultConfigured = 50) {
  const r = timerStmts.get.get(tournamentId)
  if (!r) {
    const t = defaultTimer(defaultConfigured)
    timerStmts.upsert.run(tournamentId, t.configured, t.remaining, 0, t.updatedAt)
    return t
  }
  return { configured: r.configured, remaining: r.remaining, running: !!r.running, updatedAt: r.updatedAt }
}

function saveTimer(tournamentId, t) {
  timerStmts.upsert.run(tournamentId, t.configured, t.remaining, t.running ? 1 : 0, t.updatedAt)
}

// ==================== 规则 6：每日 00:00 回收超时计时痕迹 ====================
const DAY_MS = 24 * 3600 * 1000
const reclaimStmts = {
  // 轮计时器：updatedAt 距今 >24h → 回到满时长未启动
  staleTimers: db.prepare('SELECT tournamentId, configured FROM timers WHERE updatedAt < ?'),
  resetTimer: db.prepare('UPDATE timers SET remaining = ?, running = 0, updatedAt = ? WHERE tournamentId = ?'),
  // 桌子染绿：greenAt 距今 >24h → 只清计时起点，颜色不变
  staleGreens: db.prepare('SELECT tournamentId, number FROM tables WHERE greenAt IS NOT NULL AND greenAt < ?'),
  clearGreenAt: db.prepare('UPDATE tables SET greenAt = NULL WHERE tournamentId = ? AND number = ?'),
  // 回收某场后：清空它在所有权限用户的保留顶部（pins）记录
  clearPinsByTournament: db.prepare('DELETE FROM pins WHERE tournamentId = ?'),
}

/**
 * 每日 00:00 回收（规则 6）：
 *  ① 轮计时器距最后一次开始/操作超 24h → 重置为满时长未启动（remaining=configured*60, running=false）
 *  ② 桌子染绿计时超 24h → 只清 greenAt（颜色保留，不再显示正计时）
 *  ③ 任一计时痕迹被回收的比赛 → 从所有权限用户的保留顶部（pins）清空（自动清理冷场比赛入口）
 * 不动 user_cache。返回 {timers, greens, unpinned} 回收条数。
 */
function reclaimStaleTimers() {
  const cutoff = Date.now() - DAY_MS
  const now = Date.now()
  let timers = 0, greens = 0
  const staleTids = new Set()
  for (const r of reclaimStmts.staleTimers.all(cutoff)) {
    reclaimStmts.resetTimer.run(r.configured * 60, now, r.tournamentId)
    staleTids.add(r.tournamentId)
    timers++
  }
  for (const r of reclaimStmts.staleGreens.all(cutoff)) {
    reclaimStmts.clearGreenAt.run(r.tournamentId, r.number)
    staleTids.add(r.tournamentId)
    greens++
  }
  // 清空这些比赛在所有权限用户的保留顶部（pins）记录
  let unpinned = 0
  for (const tid of staleTids) {
    unpinned += reclaimStmts.clearPinsByTournament.run(tid).changes
  }
  return { timers, greens, unpinned }
}

// ==================== pins ====================
const pinStmts = {
  list: db.prepare('SELECT tournamentId FROM pins WHERE credential = ? ORDER BY createdAt'),
  add: db.prepare('INSERT OR IGNORE INTO pins (credential,tournamentId) VALUES (?,?)'),
  remove: db.prepare('DELETE FROM pins WHERE credential = ? AND tournamentId = ?'),
  removeByCredential: db.prepare('DELETE FROM pins WHERE credential = ?'),
}

// ==================== sessions ====================
const sessionStmts = {
  insert: db.prepare(`INSERT INTO sessions
    (tokenHash,username,role,credential,eventTournamentId,expiresAt,createdAt)
    VALUES (?,?,?,?,?,?,?)`),
  byHash: db.prepare('SELECT * FROM sessions WHERE tokenHash = ?'),
  touch: db.prepare('UPDATE sessions SET expiresAt = ? WHERE tokenHash = ?'),
  remove: db.prepare('DELETE FROM sessions WHERE tokenHash = ?'),
  purgeExpired: db.prepare('DELETE FROM sessions WHERE expiresAt < ?'),
}

// ==================== user_cache ====================
const cacheStmts = {
  get: db.prepare('SELECT * FROM user_cache WHERE username = ? AND tournamentId = ?'),
  upsert: db.prepare(`INSERT INTO user_cache (username,tournamentId,expiresAt) VALUES (?,?,?)
    ON CONFLICT(username,tournamentId) DO UPDATE SET expiresAt=excluded.expiresAt`),
  remove: db.prepare('DELETE FROM user_cache WHERE username = ? AND tournamentId = ?'),
  removeByTournament: db.prepare('DELETE FROM user_cache WHERE tournamentId = ?'),
  purge: db.prepare('DELETE FROM user_cache WHERE expiresAt < ?'),
  byUser: db.prepare('SELECT tournamentId, expiresAt FROM user_cache WHERE username = ? AND expiresAt >= ? ORDER BY expiresAt DESC'),
}

const THREE_DAYS = 3 * 24 * 3600 * 1000
const ONE_DAY = 24 * 3600 * 1000

/** 检查用户名免密缓存；命中且 <24h 则刷新至 24h，过期则清除 */
function checkUserCache(username, tournamentId) {
  const now = Date.now()
  cacheStmts.purge.run(now)
  const row = cacheStmts.get.get(username, tournamentId)
  if (!row) return false
  if (row.expiresAt < now) {
    cacheStmts.remove.run(username, tournamentId)
    return false
  }
  // 剩余 <24h 刷新至 24h
  if (row.expiresAt - now < ONE_DAY) {
    cacheStmts.upsert.run(username, tournamentId, now + ONE_DAY)
  }
  return true
}

/** 首次密码验证通过后写入 3 天免密 */
function grantUserCache(username, tournamentId) {
  cacheStmts.upsert.run(username, tournamentId, Date.now() + THREE_DAYS)
}

/** 规则 4：比赛密码更改后，清空该场所有免密缓存（仅影响用比赛密码进的普通游客/裁判） */
function clearUserCacheForTournament(tournamentId) {
  return cacheStmts.removeByTournament.run(tournamentId).changes
}

/** 记录"进入比赛"（任何身份）：upsert 该用户对该场的 3 天免密/进入记录，每次进入续期到 3 天 */
function recordEntry(username, tournamentId) {
  if (!username) return
  cacheStmts.upsert.run(username, tournamentId, Date.now() + THREE_DAYS)
}

/** 查某用户未过期的进入记录（用于前端"最近进入靠前"排序），按 expiresAt 倒序 */
function getMyEntries(username) {
  if (!username) return []
  return cacheStmts.byUser.all(username, Date.now())
}

// ==================== 成绩回报 ====================
const reportStmts = {
  insert: db.prepare(`INSERT INTO reports
    (tournamentId,tableNo,round,kind,body,reporterName,reporterCredential,text,dup,conflict,grp)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`),
  byId: db.prepare('SELECT * FROM reports WHERE id = ?'),
  // 某权限用户的消息框：本场 + 未被新一轮清除 + 不是重复 + 不是自己提交的 + 自己没确认过的，按时间正序
  feed: db.prepare(`SELECT * FROM reports
    WHERE tournamentId = ? AND roundCleared = 0 AND dup = 0 AND reporterCredential != ?
      AND id NOT IN (SELECT reportId FROM report_acks WHERE viewerCredential = ?)
    ORDER BY createdAt ASC, id ASC`),
  history: db.prepare('SELECT * FROM reports WHERE tournamentId = ? ORDER BY createdAt DESC, id DESC LIMIT 500'),
  ack: db.prepare('INSERT OR IGNORE INTO report_acks (reportId,viewerCredential,ackedAt) VALUES (?,?,?)'),
  // 清除所有 = 给"该用户可见的全部"补确认记录（非自己 + 未轮清 + 非重复 + 未确认）
  ackableFor: db.prepare(`SELECT id FROM reports
    WHERE tournamentId = ? AND roundCleared = 0 AND dup = 0 AND reporterCredential != ?
      AND id NOT IN (SELECT reportId FROM report_acks WHERE viewerCredential = ?)`),
  roundClear: db.prepare('UPDATE reports SET roundCleared = 1 WHERE tournamentId = ? AND roundCleared = 0'),
  // 相同/不同判定：只看本轮本桌的最新一条非重复成绩回报
  latestScore: db.prepare(`SELECT * FROM reports
    WHERE tournamentId = ? AND round = ? AND tableNo = ? AND kind = 'score' AND dup = 0
    ORDER BY id DESC LIMIT 1`),
  // drop 重复判定：本轮本桌同玩家（body 相同）的最新一条
  latestDropSamePlayer: db.prepare(`SELECT * FROM reports
    WHERE tournamentId = ? AND round = ? AND tableNo = ? AND kind = 'drop' AND body = ?
    ORDER BY id DESC LIMIT 1`),
  // 成绩冲突：本轮本桌所有非重复成绩回报全部标红并入组
  markScoreConflict: db.prepare(`UPDATE reports SET conflict = 1, grp = ?
    WHERE tournamentId = ? AND round = ? AND tableNo = ? AND kind = 'score' AND dup = 0`),
  // drop 冲突：同组旧条目只入组不标红（规则：仅新消息标红）
  markDropGroup: db.prepare(`UPDATE reports SET grp = ?
    WHERE tournamentId = ? AND round = ? AND tableNo = ? AND kind = 'drop' AND body = ?`),
}

/**
 * 新增一条回报（含去重/冲突判定），返回完整行。
 * 规则（用户拍板 7-26 晚）：
 *  - 成绩：本轮本桌已有相同成绩 → dup=1（不入消息框）；不同成绩 → 新的标红 + 原来的全部标红同组
 *  - drop：本轮本桌同玩家已报过 → 新的标红、旧的只入组不标红（可能是取消后重报）
 *  - 跨轮互不影响（判定只在本轮内）
 */
function addReport(tournamentId, { tableNo, round, kind, body, reporterName, reporterCredential, text }) {
  let dup = 0, conflict = 0, grp = null
  if (kind === 'score') {
    const prev = reportStmts.latestScore.get(tournamentId, round, tableNo)
    if (prev && prev.body === body) {
      dup = 1 // 重复成绩回报：不显示
    } else if (prev) {
      conflict = 1
      grp = `s:${round}:${tableNo}`
      reportStmts.markScoreConflict.run(grp, tournamentId, round, tableNo)
    }
  } else {
    const prev = reportStmts.latestDropSamePlayer.get(tournamentId, round, tableNo, body)
    if (prev) {
      conflict = 1
      grp = `d:${round}:${tableNo}:${body}`
      reportStmts.markDropGroup.run(grp, tournamentId, round, tableNo, body)
    }
  }
  const info = reportStmts.insert.run(
    tournamentId, tableNo, round, kind, body,
    reporterName, reporterCredential || '', text, dup, conflict, grp
  )
  return reportStmts.byId.get(info.lastInsertRowid)
}

/** 某权限用户（按权限密码）的未确认回报列表 */
function getReportFeed(tournamentId, viewerCredential) {
  return reportStmts.feed.all(tournamentId, viewerCredential || '', viewerCredential || '')
}

/** 这场比赛的全部回报（历史弹窗用，含自己提交的、已确认的、已轮清的），新的在前 */
function getReportHistory(tournamentId) {
  return reportStmts.history.all(tournamentId)
}

/** 确认一条（仅影响该查看者自己的消息框） */
function ackReport(reportId, viewerCredential) {
  reportStmts.ack.run(reportId, viewerCredential || '', Date.now())
}

/** 清除所有 = 确认当前对该查看者可见的全部 */
function ackAllReports(tournamentId, viewerCredential) {
  const cred = viewerCredential || ''
  const rows = reportStmts.ackableFor.all(tournamentId, cred, cred)
  const now = Date.now()
  const tx = db.transaction((list) => {
    for (const r of list) reportStmts.ack.run(r.id, cred, now)
  })
  tx(rows)
  return rows.length
}

/** 导入新一轮：全场回报从所有人消息框隐藏（历史保留，真删只随比赛删除级联） */
function roundClearReports(tournamentId) {
  return reportStmts.roundClear.run(tournamentId).changes
}

function playerKey(namespace, id, name) {
  const stableId = String(id || '').trim()
  const stableNamespace = String(namespace || '').trim()
  if (stableId && stableNamespace) return `id:${stableNamespace}:${stableId}`
  return `name:${String(name || '').trim().toLocaleLowerCase()}`
}

const judgeStmts = {
  standings: db.prepare('SELECT roundCompleted,playerKey,name,points,rank,source,importedBy,baselineIncomplete FROM lynx_standings WHERE tournamentId=? AND roundCompleted=? ORDER BY rank, name'),
  clearStandings: db.prepare('DELETE FROM lynx_standings WHERE tournamentId=? AND roundCompleted=?'),
  addStanding: db.prepare('INSERT INTO lynx_standings(tournamentId,roundCompleted,playerKey,name,points,rank,importedAt,source,importedBy,baselineIncomplete) VALUES(?,?,?,?,?,?,?,?,?,?)'),
  standingsAudit: db.prepare('SELECT id,roundCompleted,playerKey,playerName,oldPoints,newPoints,oldRank,newRank,changedBy,changedAt FROM lynx_standings_audit WHERE tournamentId=? ORDER BY id DESC LIMIT 50'),
  addAudit: db.prepare('INSERT INTO lynx_standings_audit(tournamentId,roundCompleted,batchId,playerKey,playerName,oldPoints,newPoints,oldRank,newRank,changedBy,changedAt) VALUES(?,?,?,?,?,?,?,?,?,?,?)'),
  records: db.prepare('SELECT * FROM lynx_judge_records WHERE tournamentId=? ORDER BY id'),
  insertRecord: db.prepare('INSERT INTO lynx_judge_records(tournamentId,round,tableNo,playerKey,playerName,kind,infraction,penalty,note,minutes,reporter,createdAt) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)'),
  deckCheckInRound: db.prepare("SELECT id FROM lynx_judge_records WHERE tournamentId=? AND round=? AND playerKey=? AND kind='deckcheck' LIMIT 1"),
}

const roundStmts = {
  closure: db.prepare('SELECT * FROM lynx_round_closures WHERE tournamentId=? AND round=?'),
  addClosure: db.prepare('INSERT INTO lynx_round_closures(tournamentId,round,policyJson,partialBaseline,closedBy,closedAt) VALUES(?,?,?,?,?,?)'),
  addResult: db.prepare('INSERT INTO lynx_round_results(tournamentId,round,tableNo,seat,playerKey,playerName,opponentKey,outcome,points,resultSource,rawResult,outcomeType,createdAt) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)'),
  stats: db.prepare(`SELECT playerKey, MAX(playerName) AS name, COUNT(*) AS matches,
    SUM(outcome='win') AS wins, SUM(outcome IN ('loss','double_loss','ghost')) AS losses,
    SUM(outcome='draw') AS draws, SUM(outcome='bye') AS byes,
    SUM(outcome='double_loss') AS doubleLosses, SUM(outcome='ghost') AS ghosts,
    SUM(points) AS earnedPoints
    FROM lynx_round_results WHERE tournamentId=? AND round<=? GROUP BY playerKey`),
}

function getJudgeState(tournamentId, currentRound) {
  return {
    roundCompleted: Math.max(0, currentRound - 1),
    standings: judgeStmts.standings.all(tournamentId, Math.max(0, currentRound - 1)),
    records: judgeStmts.records.all(tournamentId),
    stats: roundStmts.stats.all(tournamentId, Math.max(0, currentRound - 1)),
    audit: judgeStmts.standingsAudit.all(tournamentId),
  }
}

module.exports = {
  db,
  localDateStr, daysFromNow,
  grantStmts, grantNum, grantActive, purgeExpiredGrants,
  tStmts, nextEventNum, rowToTournament,
  touchAccess, touchOp, checkEnded, purgeEndedTournaments, startupPurgeTournaments,
  getTables, getTable, saveTable, saveTables,
  getTimer, saveTimer, defaultTimer, reclaimStaleTimers,
  pinStmts,
  sessionStmts,
  checkUserCache, grantUserCache, clearUserCacheForTournament,
  recordEntry, getMyEntries,
  addReport, getReportFeed, getReportHistory, ackReport, ackAllReports, roundClearReports,
  playerKey, judgeStmts, roundStmts, getJudgeState,
}
