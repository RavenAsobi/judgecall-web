/** 与 Lynx 网页导入协议一致的导出校验；不猜测轮次，也不假定当前 DOM 覆盖全部桌台。 */
export interface MatchRow {
  tableNumber: number
  result: string | null
  dropped1: boolean
  dropped2: boolean
  timeExtension?: string | number | null
}

export interface MatchSummary {
  count: number
  min: number
  max: number
  missing: number
}

export function summarizeMatches(rows: MatchRow[]): MatchSummary | null {
  if (!rows.length) return null
  const numbers = rows.map(row => row.tableNumber)
  const min = Math.min(...numbers)
  const max = Math.max(...numbers)
  return { count: rows.length, min, max, missing: Math.max(0, max - min + 1 - rows.length) }
}

export function prepareImportJson(rows: MatchRow[], mode: 'ordinary' | 'newRound', startTable?: number) {
  if (!rows.length) throw new Error('未提取到有效桌台，请检查当前页面')
  if (rows.length > 999) throw new Error('Lynx 每轮最多接受 999 桌，请检查提取范围')
  const numbers = rows.map(row => row.tableNumber)
  if (numbers.some(number => !Number.isInteger(number) || number < 1 || number > 9999)) {
    throw new Error('提取结果含无效桌号，请检查源页面')
  }
  if (new Set(numbers).size !== rows.length) throw new Error('提取结果含重复桌号，请检查源页面')
  if (mode === 'ordinary') return rows.slice()

  const summary = summarizeMatches(rows)!
  if (summary.missing > 0) throw new Error('新一轮桌号不连续；请先显示全部桌台')
  if (!Number.isInteger(startTable) || startTable! < 1 ||
      (startTable !== summary.min && startTable !== summary.max)) {
    throw new Error('请填写赛事设置中的起始桌号（正序填最小号，倒序填最大号）')
  }
  if (rows.some(row => row.result !== null || row.dropped1 || row.dropped2 ||
    (row.timeExtension != null && Number(row.timeExtension) > 0))) {
    throw new Error('新一轮导出必须是未回报、无 Drop 和无加时的配对表；已有结果请先在 Lynx 手动开轮，再导出普通 JSON')
  }
  return [{ __lynxHeader: true as const, type: 'newRound' as const, startTable }, ...rows]
}
