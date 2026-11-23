/**
 * GEM 页面数据提取函数
 * 这些函数通过 chrome.scripting.executeScript 注入到页面上下文中执行
 */

// ==================== 类型定义 ====================

export interface GemMatchResult {
  game: 'fab'
  tableNumber: number
  playerName1: string | null
  playerGameId1: string | null
  playerIdNamespace1: 'gem-player-id'
  playerName2: string | null
  playerGameId2: string | null
  playerIdNamespace2: 'gem-player-id'
  result: string | null
  dropped1: boolean
  dropped2: boolean
}

export interface GemHero {
  game: 'fab'
  name: string | null
  gameId: string | null
  hero: string | null
}

// ==================== 比赛结果提取 ====================

/**
 * 从 GEM /report 页面提取比赛结果
 * 解析 .match-row 元素和 #refresh ul li，提取每桌的对局结果
 */
export function extractGemResults(): {
  value: GemMatchResult[]
  message: string
  errorCount: number
} {
  // 解析玩家名称和 ID 的正则：名称 (ID)
  const playerRegex = /^(.+) \((\d+)\)$/

  // 结果映射（#refresh 上报文本 → select value）
  const resultMap: Record<string, string> = {
    'Player 1 Win': '1WIN',
    'Player 2 Win': '2WIN',
    Draw: 'DRAW',
    'Double Loss': 'LOSSALL',
  }

  const matches: Record<number, GemMatchResult> = {}

  // 解析 .match-row 中的基础数据
  document.querySelectorAll('.match-row').forEach((row) => {
    const elements = row.querySelectorAll('.match-element')

    // 从 <span> 的第一个文本节点提取玩家名和 ID，避免 "Assign Match Hero" 污染
    const p1Span = elements[1]?.querySelector('span')
    const p1Text = (p1Span?.childNodes[0]?.textContent || '').trim()
    const [, p1Name = null, p1Id = null] = p1Text.match(playerRegex) || []

    const p2Span = elements[2]?.querySelector('span')
    const p2Text = (p2Span?.childNodes[0]?.textContent || '').trim()
    const [, p2Name = null, p2Id = null] = p2Text.match(playerRegex) || []

    const tableNumber = parseInt((elements[0] as HTMLElement)?.innerText || '')
    if (isNaN(tableNumber)) return

    const resultSelect = elements[3]?.querySelector('select') as HTMLSelectElement | null
    const result = resultSelect?.value || null

    // Drop 检测：CSS class drops 或 checkbox checked
    const p1DroppedByClass = elements[1]?.classList.contains('drops') ?? false
    const p2DroppedByClass = elements[2]?.classList.contains('drops') ?? false
    const dropsCol = elements[4]
    const p1DroppedByCheckbox = (dropsCol?.querySelector('input[data-player="1"]') as HTMLInputElement | null)?.checked ?? false
    const p2DroppedByCheckbox = (dropsCol?.querySelector('input[data-player="2"]') as HTMLInputElement | null)?.checked ?? false

    matches[tableNumber] = {
      game: 'fab',
      tableNumber,
      playerName1: p1Name,
      playerGameId1: p1Id,
      playerIdNamespace1: 'gem-player-id',
      playerName2: p2Name,
      playerGameId2: p2Id,
      playerIdNamespace2: 'gem-player-id',
      result,
      dropped1: p1DroppedByClass || p1DroppedByCheckbox,
      dropped2: p2DroppedByClass || p2DroppedByCheckbox,
    }
  })

  // 解析 #refresh ul li 中的上报数据（用于补全和验证结果）
  let errorCount = 0
  document.querySelectorAll('#refresh ul li').forEach((li) => {
    // 跳过掉线和取消掉线的条目
    if (
      li.getAttribute('id') === 'report-drops' ||
      li.getAttribute('id') === 'report-undrop'
    ) {
      return
    }

    const text = (li.querySelector('span') as HTMLElement | null)?.innerText?.trim()
    const lines = text?.split('\n') || []
    const [line1 = '', line2 = '', line3 = ''] = lines

    // 提取桌号
    const [, tableStr] = line1.match(/Table (\d+)/) || []
    const tableNumber = parseInt(tableStr)
    if (isNaN(tableNumber)) return

    // 提取玩家信息
    const [, p1Name = '', p1Id = ''] =
      line2.match(/^Player 1 (.*) \((.*)\)/) || []
    const [, p2Name = '', p2Id = ''] =
      line3.match(/^Player 2 (.*) \((.*)\)/) || []

    // 提取上报结果
    const [, p1Reported] = line2.match(/reported (.*)$/) || []
    const [, p2Reported] = line3.match(/reported (.*)$/) || []

    // 判断最终结果
    if (p1Reported !== p2Reported && p1Reported !== 'None' && p2Reported !== 'None') {
      // 双方上报不一致
      errorCount++
      const existing = matches[tableNumber]
      matches[tableNumber] = {
        ...existing,
        game: 'fab',
        tableNumber,
        playerName1: p1Name || existing?.playerName1 || null,
        playerName2: p2Name || existing?.playerName2 || null,
        playerGameId1: p1Id || existing?.playerGameId1 || null,
        playerIdNamespace1: 'gem-player-id',
        playerGameId2: p2Id || existing?.playerGameId2 || null,
        playerIdNamespace2: 'gem-player-id',
        result: null,
        dropped1: existing?.dropped1 ?? false,
        dropped2: existing?.dropped2 ?? false,
      }
      return
    }

    const finalResult = p1Reported === 'None' ? p2Reported : p1Reported
    const existing = matches[tableNumber]
    matches[tableNumber] = {
      ...existing,
      game: 'fab',
      tableNumber,
      playerName1: p1Name || existing?.playerName1 || null,
      playerName2: p2Name || existing?.playerName2 || null,
      playerGameId1: p1Id || existing?.playerGameId1 || null,
      playerIdNamespace1: 'gem-player-id',
      playerGameId2: p2Id || existing?.playerGameId2 || null,
      playerIdNamespace2: 'gem-player-id',
      result: resultMap[finalResult] || finalResult,
      dropped1: existing?.dropped1 ?? false,
      dropped2: existing?.dropped2 ?? false,
    }
  })

  let message = '已读取比赛结果'
  if (errorCount > 0) {
    message = `${errorCount} 条结果存在上报不一致`
  }

  return {
    value: Object.values(matches),
    message,
    errorCount,
  }
}

// ==================== 英雄数据提取 ====================

/**
 * 从 GEM /run 页面提取英雄数据
 * 解析 ol li div.row 元素，提取玩家名称、ID 和使用的英雄
 */
export function extractGemHeroes(): GemHero[] {
  const nameRegex = /^\s+(.+?) \((\d+)\)/
  const heroRegex = /^\s+(.+)\n/

  const heroes: GemHero[] = []

  document.querySelectorAll('ol li div.row').forEach((row) => {
    const cols = row.querySelectorAll('div')
    const [, name = null, gameId = null] =
      cols[0]?.children[0]?.innerHTML?.match(nameRegex) || []
    const [, hero = null] =
      cols[1]?.innerHTML?.match(heroRegex) || []

    heroes.push({ game: 'fab', name, gameId, hero })
  })

  return heroes
}
