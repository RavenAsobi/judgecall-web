/** 解析插件 v0.3.0 的可选整数比分；缺失或无效时返回 null。 */
export function optionalScore(value) {
  if (value == null || value === '') return null
  const parsed = parseInt(value, 10)
  return Number.isNaN(parsed) ? null : parsed
}

/** 从 JSON 数组开头弹出插件代码头，返回安全的桌子数据副本。 */
export function readImportEnvelope(input) {
  const data = Array.isArray(input) ? input.slice() : input
  let hasNewRoundHeader = false
  let headerStartTable = null

  if (Array.isArray(data) && data[0] && data[0].__lynxHeader === true) {
    const header = data.shift()
    hasNewRoundHeader = header.type === 'newRound'
    headerStartTable = Number.isFinite(Number(header.startTable)) ? Number(header.startTable) : null
  }

  return { data, hasNewRoundHeader, headerStartTable }
}

/** MTG 优先使用插件的精确比分，旧插件无比分时保持原来的 bo3 兜底。 */
export function mtgResultFromImport(entry) {
  if (!entry.result) return null
  const hasScore = entry.p1Wins != null && entry.p2Wins != null
  if (hasScore) {
    return { p1: entry.p1Wins, p2: entry.p2Wins, draws: entry.draws ?? 0 }
  }
  if (entry.result === '1WIN' || entry.result === 'BYE') return { p1: 2, p2: 0, draws: 0 }
  if (entry.result === '2WIN') return { p1: 0, p2: 2, draws: 0 }
  if (entry.result === 'DRAW') return { p1: 1, p2: 1, draws: 0 }
  // 双方判负不是平局；由双 Drop 状态单独标记桌台完成。
  if (entry.result === 'LOSSALL') return null
  return null
}

/** 已导入的 0:0 平局也是有效成绩；手工输入的空比分仍不算回报。 */
export function hasReportedResult(table) {
  if (table.outcomeType === 'LOSSALL') return true
  if (table.drop1 && table.drop2 && (table.color === 'green' || table.color === 'black')) return true
  if (!table.result) return false
  if (typeof table.result === 'string') return !!table.result
  if (table.resultSource === 'import') return true
  return (table.result.p1 + table.result.p2 + table.result.draws) > 0
}

/** 本轮首次导入以 JSON 中的桌号清单为准，保留仍在清单内的既有桌台状态。 */
export function tablesForFirstImport(tables, importedNumbers, createTable, reversed = false) {
  const existing = new Map(tables.map(table => [table.number, table]))
  return importedNumbers.map(number => existing.get(number) || createTable(number))
    .sort((a, b) => reversed ? b.number - a.number : a.number - b.number)
}

/** 将一张桌子恢复为未回报初始状态，不涉及赛事轮数或设置。 */
export function resetTableState(table) {
  table.color = 'white'
  table.p1 = ''
  table.p2 = ''
  table.result = null
  table.outcomeType = null
  table.playerId1 = null
  table.playerId2 = null
  table.playerIdNamespace1 = null
  table.playerIdNamespace2 = null
  table.timeExt = 0
  table.watchedBy = null
  table.drop1 = false
  table.drop2 = false
  table.greenManual = false
  table.greenAt = null
  table.resultSource = null
  table.focus = false
  return table
}
