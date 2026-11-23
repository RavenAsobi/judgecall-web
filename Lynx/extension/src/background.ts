/**
 * Lynx - Service Worker
 *
 * 职责：
 * 1. 安装时初始化存储
 * 2. 监听 webNavigation 事件，自动从 GEM 页面提取赛事名称
 */

import {
  getTournamentNames,
  setTournamentName,
} from './utils/storage'

// ==================== 初始化 ====================

chrome.runtime.onInstalled.addListener(() => {
  console.log('[Lynx] 扩展已安装/更新')
})

// ==================== webNavigation 监听：GEM 赛事名称提取 ====================

chrome.webNavigation.onCompleted.addListener(
  ({ url, tabId }) => {
    const isReport = url.includes('/report')
    const isRun = url.includes('/run') && !isReport
    const [, gemId] = url.match(/.*\/gem\/(\d+).*/) || []

    // 在 /run 页面注入脚本提取 h1 赛事名
    if (isRun && gemId) {
      chrome.scripting.executeScript(
        {
          target: { tabId },
          func: () => document.querySelector('h1')?.innerText || '',
        },
        (results) => {
          const name = results?.[0]?.result
          if (name) {
            setTournamentName(gemId, name)
          }
        }
      )
    }
  },
  { url: [{ hostContains: 'gem.fabtcg.com' }] }
)
