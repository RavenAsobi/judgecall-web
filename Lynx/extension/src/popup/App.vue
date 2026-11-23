<template>
  <main class="popup">
    <header class="header">
      <div>
        <div class="eyebrow">LYNX · v1.0.0</div>
        <h1>赛事数据提取</h1>
      </div>
      <span class="platform">{{ softwareDisplayName || '未识别平台' }}</span>
    </header>

    <p v-if="!currentSoftware" class="hint">请先打开 GEM、melee.gg 或 EventLink 的赛事页面。</p>

    <button v-if="canExtractHeroes" class="button secondary" :disabled="isLoading" @click="extractHeroes">
      提取英雄数据
    </button>

    <template v-if="canExtractResults">
      <button class="button primary" :disabled="isLoading" @click="extractResults">
        {{ isLoading ? '正在提取…' : '读取当前页面桌台' }}
      </button>
      <p class="hint">插件只读取当前页面显示的桌台，不会自动抓取其他分页。</p>

      <section v-if="summary" class="preview" aria-label="提取结果预览">
        <div class="preview-head">
          <strong>已提取 {{ summary.count }} 桌</strong>
          <span>桌号 {{ summary.min }}–{{ summary.max }}</span>
        </div>
        <p v-if="summary.missing" class="warning">桌号段内缺少 {{ summary.missing }} 桌；可能存在筛选或分页。</p>
        <p class="hint">玩家 ID：{{ identityCount }} / {{ summary.count * 2 }}；ID 缺失时不能可靠地跨轮次识别同名玩家。</p>
        <p class="warning">本轮首次导入 Lynx 会直接按这 {{ summary.count }} 桌重设总桌数，请先核对源页面是否显示完整。</p>
        <label class="check-row">
          <input v-model="confirmed" type="checkbox" />
          <span>我已核对桌数与桌号范围</span>
        </label>
        <button class="button primary" :disabled="!confirmed || isLoading" @click="copyOrdinary">
          复制普通 JSON
        </button>
        <p class="hint">普通 JSON 不会自动增加轮数；首次导入仍会重设桌数。</p>

        <details class="round-options">
          <summary>需要开始新一轮？明确选择此处</summary>
          <p class="warning">导入新一轮 JSON 会清空旧桌台状态、轮数 +1。首轮首次导入请使用上方普通 JSON。</p>
          <label class="field-label" for="round-start">Lynx 赛事设置中的起始桌号</label>
          <input id="round-start" v-model="roundStart" class="number-input" type="number" min="1" max="9999"
            :placeholder="`正序填 ${summary.min}；倒序填 ${summary.max}`" />
          <button class="button secondary" :disabled="!confirmed || isLoading" @click="copyNewRound">
            复制新一轮 JSON
          </button>
        </details>
      </section>
    </template>

    <details class="standings-options">
      <summary>备用：排名与积分导出（核对／恢复）</summary>
      <StandingsPanel :source="currentSoftware" />
    </details>

    <p v-if="currentSoftware && !canExtractResults && !canExtractHeroes" class="hint">当前页面没有可用的提取操作。</p>
    <p v-if="message" class="message" :class="{ error: isError }" role="status">{{ message }}</p>
  </main>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { extractGemResults, extractGemHeroes } from '../content/gem'
import { extractMeleeResults } from '../content/melee'
import { extractEventlinkResults } from '../content/eventlink'
import { prepareImportJson, summarizeMatches, type MatchRow } from './import-policy'
import StandingsPanel from './StandingsPanel.vue'

const currentUrl = ref('')
const isLoading = ref(false)
const message = ref('')
const isError = ref(false)
const pendingRows = ref<MatchRow[]>([])
const confirmed = ref(false)
const roundStart = ref('')
const conflicts = ref(0)

function updateCurrentUrl() {
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    currentUrl.value = tabs?.[0]?.url ?? ''
  })
}
updateCurrentUrl()
chrome.tabs.onActivated.addListener(updateCurrentUrl)
chrome.tabs.onUpdated.addListener(updateCurrentUrl)
watch(currentUrl, () => {
  pendingRows.value = []
  confirmed.value = false
  roundStart.value = ''
})

const currentSoftware = computed<'gem' | 'melee' | 'eventlink' | null>(() => {
  if (currentUrl.value.startsWith('https://gem.fabtcg.com/gem/')) return 'gem'
  if (currentUrl.value.includes('melee.gg')) return 'melee'
  if (currentUrl.value.includes('eventlink.wizards.com')) return 'eventlink'
  return null
})
const softwareDisplayName = computed(() => ({ gem: 'GEM', melee: 'melee.gg', eventlink: 'EventLink' }[currentSoftware.value || ''] || ''))
const canExtractResults = computed(() => currentSoftware.value === 'gem'
  ? currentUrl.value.includes('/report') : currentSoftware.value === 'melee' || currentSoftware.value === 'eventlink')
const canExtractHeroes = computed(() => currentSoftware.value === 'gem' && /\/run\/?$/.test(currentUrl.value))
const summary = computed(() => summarizeMatches(pendingRows.value))
const identityCount = computed(() => pendingRows.value.reduce((count, row) => {
  const item = row as MatchRow & { playerGameId1?: string | null; playerGameId2?: string | null }
  return count + Number(!!item.playerGameId1) + Number(!!item.playerGameId2)
}, 0))

function showMessage(text: string, error = false) {
  message.value = text
  isError.value = error
}

async function activeTabId() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tabs?.[0]?.id) throw new Error('找不到当前标签页')
  return tabs[0].id
}

async function extractResults() {
  isLoading.value = true
  pendingRows.value = []
  confirmed.value = false
  roundStart.value = ''
  showMessage('')
  try {
    const tabId = await activeTabId()
    let data: { value: MatchRow[]; message: string; errorCount: number } | undefined
    if (currentSoftware.value === 'gem') {
      data = (await chrome.scripting.executeScript({ target: { tabId }, func: extractGemResults }))[0]?.result
    } else if (currentSoftware.value === 'melee') {
      data = (await chrome.scripting.executeScript({ target: { tabId }, func: extractMeleeResults }))[0]?.result
    } else if (currentSoftware.value === 'eventlink') {
      data = (await chrome.scripting.executeScript({ target: { tabId }, func: extractEventlinkResults }))[0]?.result
    }
    if (!data?.value?.length) throw new Error(data?.message || '未提取到桌台；请确认当前页面显示配对表')
    // 在复制前做与 Lynx 服务端一致的桌号校验，避免无效 JSON 进入剪贴板。
    prepareImportJson(data.value, 'ordinary')
    pendingRows.value = data.value
    conflicts.value = data.errorCount || 0
    showMessage(conflicts.value ? `已读取 ${data.value.length} 桌；${conflicts.value} 条成绩上报不一致，请核对。` : `已读取 ${data.value.length} 桌，请核对后复制。`)
  } catch (error) {
    showMessage(`提取失败：${error instanceof Error ? error.message : String(error)}`, true)
  } finally {
    isLoading.value = false
  }
}

async function copyOrdinary() {
  if (!confirmed.value) return
  try {
    const rows = prepareImportJson(pendingRows.value, 'ordinary')
    await navigator.clipboard.writeText(JSON.stringify(rows, null, 2))
    showMessage(`已复制普通 JSON（${pendingRows.value.length} 桌）；不会自动开新一轮。`)
  } catch (error) {
    showMessage(`复制失败：${error instanceof Error ? error.message : String(error)}`, true)
  }
}

async function copyNewRound() {
  if (!confirmed.value) return
  try {
    const rows = prepareImportJson(pendingRows.value, 'newRound', Number(roundStart.value))
    await navigator.clipboard.writeText(JSON.stringify(rows, null, 2))
    showMessage(`已复制新一轮 JSON（${pendingRows.value.length} 桌）；导入 Lynx 后将开新一轮。`)
  } catch (error) {
    showMessage(`无法导出新一轮：${error instanceof Error ? error.message : String(error)}`, true)
  }
}

async function extractHeroes() {
  isLoading.value = true
  try {
    const tabId = await activeTabId()
    const data = (await chrome.scripting.executeScript({ target: { tabId }, func: extractGemHeroes }))[0]?.result
    if (!data?.length) throw new Error('未提取到英雄数据')
    await navigator.clipboard.writeText(JSON.stringify(data, null, 2))
    showMessage(`已复制 ${data.length} 条英雄数据（不适用于比赛结果导入框）。`)
  } catch (error) {
    showMessage(`提取失败：${error instanceof Error ? error.message : String(error)}`, true)
  } finally {
    isLoading.value = false
  }
}
</script>

<style scoped>
.popup { width: 400px; padding: 18px; color: #1e293b; background: #fff; font-size: 13px; line-height: 1.5; }
.header { display: flex; align-items: center; justify-content: space-between; gap: 14px; margin-bottom: 15px; }
.eyebrow { color: #64748b; font-size: 10px; font-weight: 700; letter-spacing: .12em; }
h1 { margin: 2px 0 0; font-size: 18px; line-height: 1.25; }
.platform { flex: none; padding: 5px 9px; border-radius: 999px; color: #9a3412; background: #fff3e8; font-weight: 700; }
.button { width: 100%; min-height: 38px; margin-top: 10px; padding: 8px 12px; border-radius: 8px; border: 1px solid #ea580c; font: inherit; font-weight: 700; cursor: pointer; }
.button.primary { color: #fff; background: #ea580c; }
.button.secondary { color: #c2410c; background: #fff; }
.button:hover:not(:disabled) { filter: brightness(.95); }
.button:disabled { cursor: not-allowed; opacity: .5; }
.hint { margin: 8px 0 0; color: #64748b; font-size: 12px; }
.preview { margin-top: 14px; padding: 12px; border: 1px solid #e2e8f0; border-radius: 10px; background: #f8fafc; }
.preview-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.preview-head strong { color: #0f172a; font-size: 15px; }
.preview-head span { white-space: nowrap; color: #475569; }
.warning { margin: 9px 0 0; color: #9a3412; font-size: 12px; }
.check-row { display: flex; align-items: flex-start; gap: 7px; margin-top: 12px; cursor: pointer; }
.check-row input { margin-top: 3px; accent-color: #ea580c; }
.round-options { margin-top: 14px; padding-top: 12px; border-top: 1px solid #e2e8f0; }
.round-options summary { color: #334155; font-weight: 700; cursor: pointer; }
.standings-options { margin-top: 16px; padding-top: 12px; border-top: 1px solid #e2e8f0; }
.standings-options summary { color: #334155; font-weight: 700; cursor: pointer; }
.field-label { display: block; margin-top: 12px; color: #475569; font-weight: 600; }
.number-input { width: 100%; height: 38px; margin-top: 5px; padding: 8px; border: 1px solid #cbd5e1; border-radius: 7px; font: inherit; }
.message { margin: 12px 0 0; padding: 9px 10px; border-radius: 7px; color: #166534; background: #f0fdf4; }
.message.error { color: #991b1b; background: #fef2f2; }
</style>
