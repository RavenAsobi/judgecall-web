/** melee.gg 配对表提取函数；函数体必须自包含，供 chrome.scripting.executeScript 注入。 */
export interface MeleeMatchResult {
  game: 'mtg'
  tableNumber: number
  playerName1: string | null
  playerGameId1: string | null
  playerIdNamespace1: 'melee-player-card'
  playerName2: string | null
  playerGameId2: string | null
  playerIdNamespace2: 'melee-player-card'
  result: string | null
  dropped1: boolean
  dropped2: boolean
  timeExtension: string | null
  p1Wins: number | null
  p2Wins: number | null
  draws: number | null
}

export function extractMeleeResults(): {
  value: MeleeMatchResult[]
  message: string
  errorCount: number
} {
  const matches: MeleeMatchResult[] = []
  document.querySelectorAll('#tournament-player-pairings-table tbody tr').forEach(row => {
    if (row.classList.contains('child')) return
    const tableNumber = parseInt(row.querySelector('.TableNumber-column')?.textContent?.trim() || '')
    if (isNaN(tableNumber)) return

    const players = row.querySelectorAll('.match-table-player-container')
    const p1Link = players[0]?.querySelector('a.open-player-card-link')
    const p2Link = players[1]?.querySelector('a.open-player-card-link')
    const p1Name = p1Link?.textContent?.trim() || null
    const p2Name = p2Link?.textContent?.trim() || null
    const resultText = row.querySelector('.AdminResultString-column')?.textContent?.trim() || ''
    const timeExtension = (row.querySelector('.TimeExtensionMinutes-column input') as HTMLInputElement | null)?.value || null
    const hasResult = row.querySelector('.HasResult-column svg.fa-check') !== null

    let result: string | null = null
    let dropped1 = false
    let dropped2 = false
    let p1Wins: number | null = null
    let p2Wins: number | null = null
    let draws: number | null = null

    if (!hasResult || resultText === '' || /^(?:未报告|Not reported)$/i.test(resultText)) {
      result = null
    } else if (resultText.includes('轮空')) {
      result = 'BYE'
    } else {
      dropped1 = !!p1Name && (resultText.includes(`${p1Name} 退出比赛`) || resultText.includes(`${p1Name} forfeited the match`))
      dropped2 = !!p2Name && (resultText.includes(`${p2Name} 退出比赛`) || resultText.includes(`${p2Name} forfeited the match`))
      if (dropped1 && dropped2) {
        result = 'LOSSALL'
      } else {
        const winMatch = resultText.match(/(.+?) (?:胜|won) (\d+)-(\d+)-(\d+)/i)
        if (winMatch) {
          const winnerName = winMatch[1].trim()
          const winnerWins = parseInt(winMatch[2])
          const loserWins = parseInt(winMatch[3])
          draws = parseInt(winMatch[4])
          if (p1Name && winnerName === p1Name) {
            result = '1WIN'
            p1Wins = winnerWins
            p2Wins = loserWins
          } else if (p2Name && winnerName === p2Name) {
            result = '2WIN'
            p1Wins = loserWins
            p2Wins = winnerWins
          }
        } else {
          const drawMatch = resultText.match(/(\d+)-(\d+)-(\d+)\s*(?:平局|Draw)/i)
          if (drawMatch) {
            p1Wins = parseInt(drawMatch[1])
            p2Wins = parseInt(drawMatch[2])
            draws = parseInt(drawMatch[3])
            if (p1Wins === p2Wins) result = 'DRAW'
          }
        }
      }
    }

    matches.push({
      game: 'mtg', tableNumber,
      playerName1: p1Name, playerGameId1: p1Link?.getAttribute('data-id') || null,
      playerIdNamespace1: 'melee-player-card',
      playerName2: p2Name, playerGameId2: p2Link?.getAttribute('data-id') || null,
      playerIdNamespace2: 'melee-player-card',
      result, dropped1, dropped2, timeExtension, p1Wins, p2Wins, draws,
    })
  })
  return { value: matches, message: '已读取配对表', errorCount: 0 }
}
