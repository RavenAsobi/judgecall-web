/**
 * chrome.storage.local 读写封装
 * 用于 Service Worker 和 Popup 之间的数据共享
 */

/** 缓存的赛事名称 { [gemId: string]: string } */
export interface TournamentNames {
  [gemId: string]: string
}

/** Meta 提取状态 */
export interface MetaStatus {
  state: 'idle' | 'loading' | 'done' | 'error'
  message?: string
  at: number
}

/** Meta 提取结果 */
export interface MetaResult {
  tsv: string
  count: number
  eventId: string | null
  at: number
}

/** 存储键名常量 */
export const STORAGE_KEYS = {
  TOURNAMENT_NAMES: 'TOURNAMENT_NAMES',
  TOKEN: 'token',
  META_STATUS: 'metaStatus',
  META_RESULT: 'metaResult',
} as const

// ==================== 通用读写 ====================

export async function getStorage<T>(key: string): Promise<T | undefined> {
  const result = await chrome.storage.local.get(key)
  return result[key] as T | undefined
}

export async function setStorage<T>(key: string, value: T): Promise<void> {
  await chrome.storage.local.set({ [key]: value })
}

export async function removeStorage(key: string): Promise<void> {
  await chrome.storage.local.remove(key)
}

// ==================== 赛事名称 ====================

export async function getTournamentNames(): Promise<TournamentNames> {
  return (await getStorage<TournamentNames>(STORAGE_KEYS.TOURNAMENT_NAMES)) || {}
}

export async function setTournamentName(gemId: string, name: string): Promise<void> {
  const names = await getTournamentNames()
  names[gemId] = name
  await setStorage(STORAGE_KEYS.TOURNAMENT_NAMES, names)
}

export async function clearTournamentNames(): Promise<void> {
  await setStorage(STORAGE_KEYS.TOURNAMENT_NAMES, {})
}

// ==================== Token ====================

export async function getToken(): Promise<string> {
  return (await getStorage<string>(STORAGE_KEYS.TOKEN)) || ''
}

export async function setToken(token: string): Promise<void> {
  await setStorage(STORAGE_KEYS.TOKEN, token)
}

// ==================== Meta 状态 ====================

export async function getMetaStatus(): Promise<MetaStatus | undefined> {
  return getStorage<MetaStatus>(STORAGE_KEYS.META_STATUS)
}

export async function setMetaStatus(status: MetaStatus): Promise<void> {
  await setStorage(STORAGE_KEYS.META_STATUS, status)
}

// ==================== Meta 结果 ====================

export async function getMetaResult(): Promise<MetaResult | undefined> {
  return getStorage<MetaResult>(STORAGE_KEYS.META_RESULT)
}

export async function setMetaResult(result: MetaResult): Promise<void> {
  await setStorage(STORAGE_KEYS.META_RESULT, result)
}

// ==================== 通用监听 ====================

/**
 * 监听 storage 变化
 * @param callback 变化回调
 * @returns 取消监听的函数
 */
export function onStorageChanged(
  callback: (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => void
): () => void {
  chrome.storage.onChanged.addListener(callback)
  return () => chrome.storage.onChanged.removeListener(callback)
}
