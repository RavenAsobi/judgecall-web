/**
 * carde.io 页面数据提取函数
 * 这些函数通过 chrome.scripting.executeScript 注入到页面上下文中执行
 * 使用 carde.io Admin API 获取数据
 */

// ==================== 类型定义 ====================

export interface CardeMatchResult {
  tableNumber: number
  playerName1: string | null
  playerGameId1: number | null
  playerName2: string | null
  playerGameId2: number | null
  result: '1WIN' | '2WIN' | 'DRAW' | null
}

export interface CardeStandingEntry {
  name: string | null
  gameId: number | null
  standing: number
  isDropped: boolean
  rank: number | null
}

export interface CardePlayer {
  name: string | null
  gameId: number | null
}

// ==================== 比赛结果提取 ====================

/**
 * 从 carde.io /pairings 页面提取比赛结果
 * 调用 tournament-rounds API 获取对局数据
 */
export async function extractCardeResults(token: string): Promise<{
  value: CardeMatchResult[]
  message: string
  errorCount: number
}> {
  const [, eventId, roundId] =
    window.location.pathname.match(/\/events\/(\d+)\/pairings\/round\/(\d+)/) || []

  const url = `https://api.admin.carde.io/api/v2/organize/tournament-rounds/${roundId}/matches-list/?round_id=${roundId}&avoid_cache=true&page=1&page_size=3000`

  const res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Token ${token}` },
    credentials: 'include',
  })

  if (!res.ok) {
    return {
      value: [],
      message: `获取数据失败: ${res.statusText}`,
      errorCount: 1,
    }
  }

  const { results } = await res.json()

  const matches: CardeMatchResult[] = []

  for (const match of results) {
    if (match.table_number < 0) continue

    const p1Rel = match.player_match_relationships?.[0]
    const p2Rel = match.player_match_relationships?.[1]

    let result: '1WIN' | '2WIN' | 'DRAW' | null = null
    if (match.status === 'COMPLETE') {
      if (match.winning_player_id === p1Rel?.player?.id) {
        result = '1WIN'
      } else if (match.winning_player_id === p2Rel?.player?.id) {
        result = '2WIN'
      } else {
        result = 'DRAW'
      }
    }

    const p1Name = p1Rel?.player
      ? `${p1Rel.player.last_name}, ${p1Rel.player.first_name}`
      : null

    const p2Name = p2Rel?.player
      ? `${p2Rel.player.last_name}, ${p2Rel.player.first_name}`
      : null

    matches.push({
      tableNumber: match.table_number,
      playerName1: p1Name,
      playerGameId1: p1Rel?.player?.id || null,
      playerName2: p2Name,
      playerGameId2: p2Rel?.player?.id || null,
      result,
    })
  }

  return {
    value: matches,
    message: '已复制到剪贴板',
    errorCount: 0,
  }
}

// ==================== 排名提取 ====================

/**
 * 从 carde.io /standings 页面提取排名数据
 */
export async function extractCardeStandings(token: string): Promise<{
  value: CardeStandingEntry[]
  message: string
  errorCount: number
}> {
  const [, eventId, roundId] =
    window.location.pathname.match(/\/events\/(\d+)\/standings\/round\/(\d+)/) || []

  const url = `https://api.admin.carde.io/api/v2/organize/tournament-rounds/${roundId}/standings?avoid_cache=true&page=1&page_size=3000`

  const res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Token ${token}` },
    credentials: 'include',
  })

  if (!res.ok) {
    return {
      value: [],
      message: `获取数据失败: ${res.statusText}`,
      errorCount: 1,
    }
  }

  const { results } = await res.json()

  const standings: CardeStandingEntry[] = results.map((entry: any) => ({
    name: entry.user_event_status?.user?.last_first || null,
    gameId: entry.player?.id || null,
    standing: entry.points,
    isDropped: entry.user_event_status?.registration_status === 'DROPPED',
    rank: entry?.rank || null,
  }))

  return {
    value: standings,
    message: '已复制到剪贴板',
    errorCount: 0,
  }
}

// ==================== 玩家列表提取 ====================

/**
 * 从 carde.io /events/:id 页面提取参赛玩家列表
 */
export async function extractCardePlayers(token: string): Promise<{
  value: CardePlayer[]
  message: string
  errorCount: number
}> {
  const [, eventId] = window.location.pathname.match(/\/events\/(\d+)/) || []

  const url = `https://api.admin.carde.io/api/v2/organize/events/${eventId}/registrations-slim?avoid_cache=true&page=1&include_deaths=true&page_size=5000`

  const res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Token ${token}` },
    credentials: 'include',
  })

  if (!res.ok) {
    return {
      value: [],
      message: `获取数据失败: ${res.statusText}`,
      errorCount: 1,
    }
  }

  const { results } = await res.json()

  const players: CardePlayer[] = results
    .filter(
      (r: any) =>
        r.registration_status === 'COMPLETE' || r.registration_status === 'ELIMINATED'
    )
    .map((r: any) => ({
      name: r.user?.last_first || null,
      gameId: r.user?.id || null,
    }))

  return {
    value: players,
    message: '已复制到剪贴板',
    errorCount: 0,
  }
}
