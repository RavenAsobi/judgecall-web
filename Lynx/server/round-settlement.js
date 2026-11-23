// Pure round settlement rules. Never infer an official ranking from match points.
const POLICY_FIELDS = ['win', 'draw', 'loss', 'bye', 'doubleLoss']

function normalizePolicy(input) {
  if (!input || typeof input !== 'object') throw new Error('请先确认本场积分规则')
  const policy = {}
  for (const field of POLICY_FIELDS) {
    const value = Number(input[field])
    if (!Number.isSafeInteger(value) || value < 0 || value > 100 || input[field] === '') {
      throw new Error('积分规则须填写 0–100 的整数')
    }
    policy[field] = value
  }
  return policy
}

function playerKey(table, seat) {
  const id = String(table[`playerId${seat}`] || '').trim()
  const namespace = String(table[`playerIdNamespace${seat}`] || '').trim()
  if (id && namespace) return `id:${namespace}:${id}`
  return `name:${String(table[`p${seat}`] || '').trim().toLocaleLowerCase()}`
}

function classifyTable(table) {
  const p1 = String(table.p1 || '').trim()
  const p2 = String(table.p2 || '').trim()
  if (!p1 && !p2) return { kind: 'empty', seats: [] }
  const type = table.outcomeType
  if (type === 'BYE' && p1 && !p2 &&
      (table.result === 'p1' || table.result?.p1 > table.result?.p2)) {
    return { kind: 'bye', seats: [{ seat: 1, outcome: 'bye' }] }
  }
  if (!p1 || !p2) return { kind: 'unresolved', reason: '只有一位玩家，且未明确记录轮空' }
  if (type === 'LOSSALL') return { kind: 'double_loss', seats: [1, 2].map(seat => ({ seat, outcome: 'double_loss' })) }
  if (type === 'GHOST' && table.color === 'black' && table.drop1 && table.drop2) {
    return { kind: 'ghost', seats: [1, 2].map(seat => ({ seat, outcome: 'ghost' })) }
  }
  const result = table.result
  if (result === 'p1') return { kind: 'win', seats: [{ seat: 1, outcome: 'win' }, { seat: 2, outcome: 'loss' }] }
  if (result === 'p2') return { kind: 'win', seats: [{ seat: 1, outcome: 'loss' }, { seat: 2, outcome: 'win' }] }
  if (result === 'draw') return { kind: 'draw', seats: [1, 2].map(seat => ({ seat, outcome: 'draw' })) }
  if (result && typeof result === 'object') {
    const a = Number(result.p1), b = Number(result.p2), d = Number(result.draws)
    if (type === 'DRAW' && table.drop1 && table.drop2 && a === 0 && b === 0 && d === 0) {
      return { kind: 'unresolved', reason: '双方 Drop 且比分 0:0；请确认是平局还是双方判负' }
    }
    if (type === 'DRAW' && table.resultSource === 'import' && a === 0 && b === 0 && d === 0) {
      return { kind: 'draw', seats: [1, 2].map(seat => ({ seat, outcome: 'draw' })) }
    }
    if (![a, b, d].every(Number.isSafeInteger) || a < 0 || b < 0 || d < 0 || a + b + d === 0) {
      return { kind: 'unresolved', reason: '比分未完成或无效' }
    }
    if (a > b) return { kind: 'win', seats: [{ seat: 1, outcome: 'win' }, { seat: 2, outcome: 'loss' }] }
    if (b > a) return { kind: 'win', seats: [{ seat: 1, outcome: 'loss' }, { seat: 2, outcome: 'win' }] }
    return { kind: 'draw', seats: [1, 2].map(seat => ({ seat, outcome: 'draw' })) }
  }
  return { kind: 'unresolved', reason: '缺少明确赛果；桌台颜色与 Drop 不等于胜负结果' }
}

function settleTables(tables, policy) {
  const normalized = normalizePolicy(policy)
  const entries = []
  const unresolved = []
  const counts = { win: 0, draw: 0, bye: 0, double_loss: 0, ghost: 0, empty: 0 }
  const seen = new Set()
  for (const table of tables) {
    const result = classifyTable(table)
    if (result.kind === 'unresolved') { unresolved.push({ tableNo: table.number, reason: result.reason }); continue }
    counts[result.kind]++
    for (const item of result.seats) {
      const key = playerKey(table, item.seat)
      if (seen.has(key)) unresolved.push({ tableNo: table.number, reason: `玩家 ${table[`p${item.seat}`]} 在本轮出现多次或缺少唯一 ID` })
      seen.add(key)
      entries.push({
        tableNo: table.number, seat: item.seat, playerKey: key,
        playerName: String(table[`p${item.seat}`] || '').trim(),
        opponentKey: result.seats.length === 2 ? playerKey(table, item.seat === 1 ? 2 : 1) : null,
        outcome: item.outcome,
        points: item.outcome === 'ghost' || item.outcome === 'double_loss' ? normalized.doubleLoss : normalized[item.outcome],
        resultSource: table.resultSource || null,
        rawResult: table.result == null ? null : JSON.stringify(table.result),
        outcomeType: table.outcomeType || null,
      })
    }
  }
  return { entries, unresolved, counts, policy: normalized }
}

function cumulativeStandings(previous, entries) {
  const rows = new Map(previous.map(row => [row.playerKey, { ...row, rank: null }]))
  const previousByName = new Map()
  for (const row of previous) {
    const name = row.name.trim().toLocaleLowerCase()
    previousByName.set(name, [...(previousByName.get(name) || []), row])
  }
  const usedAliases = new Set()
  for (const entry of entries) {
    let row = rows.get(entry.playerKey)
    if (!row) {
      const candidates = previousByName.get(entry.playerName.toLocaleLowerCase()) || []
      if (candidates.length > 1) throw new Error(`玩家 ${entry.playerName} 的历史记录重名，需先用唯一 ID 校正积分`)
      if (candidates.length === 1 && !usedAliases.has(candidates[0].playerKey)) {
        row = rows.get(candidates[0].playerKey)
        rows.delete(candidates[0].playerKey)
        usedAliases.add(candidates[0].playerKey)
      } else if (candidates.length === 1) {
        throw new Error(`玩家 ${entry.playerName} 的历史记录无法唯一对应，请校正玩家 ID`)
      }
    }
    if (!row) row = { playerKey: entry.playerKey, name: entry.playerName, points: 0, rank: null }
    row.playerKey = entry.playerKey
    row.name = entry.playerName
    row.points = Number(row.points) + entry.points
    row.rank = null
    rows.set(entry.playerKey, row)
  }
  return [...rows.values()].sort((a, b) => b.points - a.points || a.name.localeCompare(b.name))
}

module.exports = { POLICY_FIELDS, normalizePolicy, playerKey, classifyTable, settleTables, cumulativeStandings }
