/**
 * chrome.runtime.sendMessage 封装
 * 用于 Popup <-> Service Worker 之间的通信
 */

/** 消息类型定义 */
export interface ExtractMetaMessage {
  action: 'extractMeta'
  tabId: number
  eventId?: string
}

export type ExtensionMessage = ExtractMetaMessage

/** 消息响应 */
export interface MessageResponse {
  started?: boolean
  error?: string
}

/**
 * 发送消息到 Service Worker
 */
export function sendMessage<T = MessageResponse>(message: ExtensionMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response: T) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message))
        return
      }
      resolve(response)
    })
  })
}

/**
 * 监听来自 Popup 的消息（在 Service Worker 中使用）
 */
export function onMessage(
  handler: (
    message: ExtensionMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: MessageResponse) => void
  ) => boolean | void
): () => void {
  chrome.runtime.onMessage.addListener(handler as any)
  return () => chrome.runtime.onMessage.removeListener(handler as any)
}
