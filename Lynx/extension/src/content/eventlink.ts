/** EventLink 配对表提取函数；函数体必须自包含，供 chrome.scripting.executeScript 注入。 */
export interface EventlinkMatchResult {
  game: 'mtg'
  tableNumber: number
  playerName1: string | null
  playerGameId1: string | null
  playerIdNamespace1: null
  playerName2: string | null
  playerGameId2: string | null
  playerIdNamespace2: null
  result: string | null
  dropped1: boolean
  dropped2: boolean
  timeExtension: null
  p1Wins: number | null
  p2Wins: number | null
  draws: number | null
}

export function extractEventlinkResults(): {
  value: EventlinkMatchResult[]
  message: string
  errorCount: number
} {
  const matches: EventlinkMatchResult[] = []
  document.querySelectorAll('.pairings-table tbody tr').forEach(row => {
    const tableNumber = parseInt(row.querySelector('.pairings-table__cell--table-num')?.textContent?.trim() || '')
    if (isNaN(tableNumber)) return
    const parsePlayer = (cell: Element | null) => {
      const text = cell?.querySelector('.team__text')
      return {
        name: text?.querySelector('span')?.textContent?.trim() || null,
        dropped: text?.classList.contains('dropped') ?? false,
      }
    }
    const p1 = parsePlayer(row.querySelector('.pairings-table__cell--left'))
    const p2 = parsePlayer(row.querySelector('.pairings-table__cell--right'))
    const scores = row.querySelectorAll('.pairings-table__cell--result .box-score')
    let result: string | null = null
    let p1Wins: number | null = null
    let p2Wins: number | null = null
    let draws: number | null = null
    if (scores.length >= 2) {
      const p1Score = scores[0]
      const p2Score = scores[scores.length - 1]
      let drawsScore: Element | null = null
      for (let index = 1; index < scores.length - 1; index++) {
        if (scores[index].classList.contains('draws')) { drawsScore = scores[index]; break }
      }
      const c1 = p1Score.classList.contains('winner') ? 'winner' : p1Score.classList.contains('loser') ? 'loser' : ''
      const c2 = p2Score.classList.contains('winner') ? 'winner' : p2Score.classList.contains('loser') ? 'loser' : ''
      if (c1 === 'winner' && c2 === 'loser') result = '1WIN'
      else if (c1 === 'loser' && c2 === 'winner') result = '2WIN'
      else if (c1 === 'winner' && c2 === 'winner') result = 'DRAW'
      const parseScore = (element: Element) => {
        const score = parseInt(element.textContent?.trim() || '')
        return isNaN(score) ? null : score
      }
      p1Wins = parseScore(p1Score)
      p2Wins = parseScore(p2Score)
      draws = drawsScore ? parseScore(drawsScore) : 0
    }
    matches.push({
      game: 'mtg', tableNumber,
      playerName1: p1.name, playerGameId1: null, playerIdNamespace1: null,
      playerName2: p2.name, playerGameId2: null, playerIdNamespace2: null,
      result, dropped1: p1.dropped, dropped2: p2.dropped,
      timeExtension: null, p1Wins, p2Wins, draws,
    })
  })
  return {
    value: matches,
    message: matches.length ? `已读取 ${matches.length} 桌` : '未找到配对表（pairings-table），请确认当前在 EventLink 配对/成绩页面',
    errorCount: 0,
  }
}
