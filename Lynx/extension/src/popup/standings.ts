export interface GridRow { cells: string[]; ids?: (string | null)[] }
export interface StandingsGrid { headers: string[]; rows: GridRow[]; label?: string }
export interface ColumnMap { name: number; lastName: number; id: number; points: number; rank: number }
export type Source = 'gem' | 'melee' | 'eventlink'

/** RFC 4180 风格的基础 CSV 解析；不依赖网络或第三方库。 */
export function parseCsv(input: string): StandingsGrid {
  const text = input.replace(/^\uFEFF/, '')
  const records: string[][] = []
  let row: string[] = [], field = '', quoted = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++ }
      else quoted = !quoted
    } else if (char === ',' && !quoted) {
      row.push(field); field = ''
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.some(value => value.trim())) records.push(row)
      row = []
    } else field += char
  }
  if (quoted) throw new Error('CSV 引号未闭合')
  row.push(field)
  if (row.some(value => value.trim())) records.push(row)
  if (records.length < 2) throw new Error('CSV 至少需要表头与一行数据')
  const headers = records[0].map(value => value.trim())
  if (headers.length < 2) throw new Error('CSV 列数不足')
  return { headers, rows: records.slice(1).map(cells => ({ cells: cells.map(value => value.trim()) })) }
}

export function suggestColumns(headers: string[]): ColumnMap {
  const find = (pattern: RegExp) => headers.findIndex(header => pattern.test(header.trim()))
  return {
    name: find(/^(?:name|player(?:\s*name)?|first\s*name|姓名|玩家|牌手)$/i),
    lastName: find(/^(?:last\s*name|surname|姓氏?)$/i),
    id: find(/(?:player|account|wizards|gem|melee|event).*(?:id|编号)|^(?:id|编号|账号)$/i),
    points: find(/(?:match\s*)?points?|^积分$|^分数$|^得分$/i),
    rank: find(/^(?:final\s*)?rank(?:ing)?$|^排名$|^名次$/i),
  }
}

export function suggestIdNamespace(source: Source, header: string): string {
  if (/wizards.*(?:id|account)/i.test(header)) return 'wizards-account'
  if (source === 'gem') return 'gem-player-id'
  if (source === 'melee') return 'melee-player-card'
  return 'eventlink-player-id'
}

/** 独立的积分数据协议；绝不伪装成桌台 JSON。 */
export function prepareStandings(grid: StandingsGrid, columns: ColumnMap, source: Source,
  roundCompleted: number, idNamespace: string) {
  if (!Number.isInteger(roundCompleted) || roundCompleted < 0 || roundCompleted > 999) {
    throw new Error('已完成轮次须为 0–999 的整数')
  }
  if (columns.name < 0 || columns.points < 0) throw new Error('请选择姓名列和积分列')
  if (columns.name === columns.points) throw new Error('姓名列和积分列不能相同')
  if (!grid.rows.length || grid.rows.length > 5000) throw new Error('排名表须包含 1–5000 名玩家')
  const rows = grid.rows.map((row, index) => {
    const name = [row.cells[columns.name], columns.lastName >= 0 ? row.cells[columns.lastName] : '']
      .filter(Boolean).join(' ').trim()
    const rawPoints = row.cells[columns.points]?.trim() ?? ''
    const points = Number(rawPoints)
    if (!name || name.length > 160) throw new Error(`第 ${index + 1} 行玩家姓名无效`)
    if (!/^\d+$/.test(rawPoints) || !Number.isSafeInteger(points)) {
      throw new Error(`第 ${index + 1} 行积分不是非负整数`)
    }
    const explicitId = columns.id >= 0 ? row.cells[columns.id]?.trim() : ''
    const linkedId = row.ids?.[columns.name]?.trim() || ''
    const playerId = explicitId || linkedId || null
    const rawRank = columns.rank >= 0 ? row.cells[columns.rank]?.trim() : ''
    const rank = rawRank && /^\d+$/.test(rawRank) && Number(rawRank) > 0 ? Number(rawRank) : null
    return { name, playerId, points, rank }
  })
  const ids = rows.filter(row => row.playerId).map(row => row.playerId)
  if (new Set(ids).size !== ids.length) throw new Error('排名表含重复玩家 ID；请检查列映射或筛选范围')
  if (ids.length && !idNamespace.trim()) throw new Error('有玩家 ID 时必须填写 ID 类型 / 命名空间')
  return {
    schema: 'lynx-standings-v1' as const, source, roundCompleted, idNamespace: idNamespace.trim() || null,
    exportedAt: new Date().toISOString(), rows,
  }
}
