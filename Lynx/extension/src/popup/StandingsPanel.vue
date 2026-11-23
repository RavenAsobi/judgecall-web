<template>
  <section class="standings" aria-label="排名与积分提取">
    <h2>官方积分校对／恢复</h2>
    <p class="hint">Lynx 正常按每轮赛果自动累计。仅在核对官方积分、修复旧赛事历史缺口时导出此 JSON；请粘贴到网页管理端“积分校正／恢复”，不要粘贴到桌台导入框。</p>
    <label for="standings-source">赛事来源</label>
    <select id="standings-source" v-model="selectedSource">
      <option value="gem">GEM / FAB</option><option value="melee">Melee / MTG</option><option value="eventlink">EventLink / MTG</option>
    </select>
    <div class="actions">
      <button type="button" @click="readPage">读取当前页可见表格</button>
      <label class="file-button">打开排名 CSV<input type="file" accept=".csv,text/csv" @change="readFile" /></label>
    </div>
    <template v-if="grid">
      <label v-if="grids.length > 1" for="standings-table">选择表格</label>
      <select v-if="grids.length > 1" id="standings-table" v-model.number="gridIndex" @change="chooseGrid">
        <option v-for="(item, index) in grids" :key="index" :value="index">{{ item.label }} · {{ item.rows.length }} 行</option>
      </select>
      <p class="hint">已读取 {{ grid.rows.length }} 行。请核对列映射；不自动推算积分。</p>
      <div class="fields">
        <label>姓名列<select v-model.number="columns.name"><option :value="-1">请选择</option><option v-for="(header, i) in grid.headers" :key="i" :value="i">{{ label(header, i) }}</option></select></label>
        <label>姓氏列（可选）<select v-model.number="columns.lastName"><option :value="-1">无</option><option v-for="(header, i) in grid.headers" :key="i" :value="i">{{ label(header, i) }}</option></select></label>
        <label>积分列<select v-model.number="columns.points"><option :value="-1">请选择</option><option v-for="(header, i) in grid.headers" :key="i" :value="i">{{ label(header, i) }}</option></select></label>
        <label>玩家 ID 列（可选）<select v-model.number="columns.id"><option :value="-1">无 / 从姓名链接读取</option><option v-for="(header, i) in grid.headers" :key="i" :value="i">{{ label(header, i) }}</option></select></label>
        <label>名次列（可选）<select v-model.number="columns.rank"><option :value="-1">无</option><option v-for="(header, i) in grid.headers" :key="i" :value="i">{{ label(header, i) }}</option></select></label>
        <label>已完成轮次<input v-model="roundCompleted" type="number" min="0" max="999" /></label>
      </div>
      <label for="id-namespace">ID 类型 / 命名空间</label>
      <input id="id-namespace" v-model="idNamespace" type="text" placeholder="例如 gem-player-id" />
      <p class="warning">不能假定 Melee 排名 CSV 的 Wizards Account ID 与配对页 data-id 是同一种 ID；核实前不可自动合并。无 ID 时需人工核对重名玩家。</p>
      <button type="button" class="primary" @click="preview">校验并预览</button>
      <div v-if="prepared" class="preview">
        <strong>{{ prepared.rows.length }} 名玩家 · {{ prepared.rows.filter(row => row.playerId).length }} 个 ID</strong>
        <span>积分 {{ Math.min(...prepared.rows.map(row => row.points)) }}–{{ Math.max(...prepared.rows.map(row => row.points)) }}；截至 R{{ prepared.roundCompleted }}</span>
        <p class="hint">示例：{{ prepared.rows.slice(0, 2).map(row => `${row.name} ${row.points}分`).join('；') }}</p>
        <label class="confirm"><input v-model="confirmed" type="checkbox" /> 我已核对来源、轮次、列映射与玩家数量</label>
        <button type="button" class="primary" :disabled="!confirmed" @click="copy">复制积分 JSON</button>
      </div>
    </template>
    <p v-if="message" class="message" :class="{ error: isError }" role="status">{{ message }}</p>
  </section>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { extractVisibleStandingsTables } from '../content/standings'
import { parseCsv, prepareStandings, suggestColumns, suggestIdNamespace,
  type StandingsGrid, type ColumnMap, type Source } from './standings'

const props = defineProps<{ source: Source | null }>()
const selectedSource = ref<Source>(props.source || 'gem')
watch(() => props.source, value => { if (value) selectedSource.value = value })
const grids = ref<StandingsGrid[]>([])
const gridIndex = ref(0)
const grid = ref<StandingsGrid | null>(null)
const columns = ref<ColumnMap>({ name: -1, lastName: -1, id: -1, points: -1, rank: -1 })
const roundCompleted = ref('0')
const idNamespace = ref('')
const prepared = ref<ReturnType<typeof prepareStandings> | null>(null)
const confirmed = ref(false)
const message = ref('')
const isError = ref(false)

function show(text: string, error = false) { message.value = text; isError.value = error }
function label(header: string, index: number) { return `${index + 1}. ${header || '无表头'}` }
function chooseGrid() {
  grid.value = grids.value[gridIndex.value] || null
  columns.value = suggestColumns(grid.value?.headers || [])
  const idHeader = grid.value?.headers[columns.value.id] || ''
  idNamespace.value = suggestIdNamespace(selectedSource.value, idHeader)
  prepared.value = null
  confirmed.value = false
}
watch([columns, roundCompleted, idNamespace, selectedSource], () => { prepared.value = null; confirmed.value = false }, { deep: true })
async function readPage() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id || !props.source) throw new Error('请先打开 GEM、Melee 或 EventLink 的排名页面')
    const result = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractVisibleStandingsTables })
    grids.value = result[0]?.result || []
    if (!grids.value.length) throw new Error('当前页面未找到可见 HTML 表格；可改用排名 CSV')
    gridIndex.value = 0; chooseGrid(); show(`找到 ${grids.value.length} 个表格，请选择并核对排名列。`)
  } catch (error) { grids.value = []; grid.value = null; prepared.value = null; show(error instanceof Error ? error.message : String(error), true) }
}
async function readFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    if (file.size > 2_000_000) throw new Error('CSV 超过 2 MB，请缩小范围')
    const bytes = await file.arrayBuffer()
    let csv: string
    let encoding = 'UTF-8'
    try { csv = new TextDecoder('utf-8', { fatal: true }).decode(bytes) }
    catch { csv = new TextDecoder('gb18030', { fatal: true }).decode(bytes); encoding = 'GB18030' }
    grids.value = [{ ...parseCsv(csv), label: file.name }]
    gridIndex.value = 0; chooseGrid(); show(`已打开 ${file.name}（${encoding}），请核对列映射。`)
  } catch (error) { grids.value = []; grid.value = null; prepared.value = null; show(error instanceof Error ? error.message : String(error), true) }
  input.value = ''
}
function preview() {
  try {
    if (!grid.value) return
    prepared.value = prepareStandings(grid.value, columns.value, selectedSource.value,
      Number(roundCompleted.value), idNamespace.value)
    confirmed.value = false
    show('校验通过；确认无误后复制。')
  } catch (error) { prepared.value = null; show(error instanceof Error ? error.message : String(error), true) }
}
async function copy() {
  if (!prepared.value || !confirmed.value) return
  try { await navigator.clipboard.writeText(JSON.stringify(prepared.value, null, 2)); show('已复制独立积分 JSON；请勿粘贴到桌台导入框。') }
  catch (error) { show(error instanceof Error ? error.message : String(error), true) }
}
</script>

<style scoped>
.standings { margin-top: 18px; padding-top: 16px; border-top: 1px solid #e2e8f0; }
h2 { margin: 0; font-size: 16px; }
.hint { margin: 6px 0 10px; color: #64748b; font-size: 12px; }
label { display: block; margin-top: 10px; font-weight: 600; color: #334155; }
input[type="text"], input[type="number"], select { width: 100%; min-height: 36px; margin-top: 4px; padding: 7px; border: 1px solid #cbd5e1; border-radius: 7px; background: white; font: inherit; }
.actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px; }
button, .file-button { min-height: 36px; padding: 7px; border: 1px solid #ea580c; border-radius: 7px; background: white; color: #c2410c; font: inherit; font-weight: 700; text-align: center; cursor: pointer; }
.file-button { margin: 0; }
.file-button input { display: none; }
button.primary { width: 100%; margin-top: 10px; color: white; background: #ea580c; }
button:disabled { opacity: .5; cursor: not-allowed; }
.fields { display: grid; grid-template-columns: 1fr 1fr; gap: 0 8px; }
.warning { color: #9a3412; font-size: 12px; line-height: 1.5; }
.preview { margin-top: 10px; padding: 10px; border: 1px solid #dbeafe; border-radius: 8px; background: #f8fafc; }
.preview strong, .preview span { display: block; }
.confirm { display: flex; align-items: flex-start; gap: 6px; font-size: 12px; }
.confirm input { margin-top: 3px; }
.message { margin: 10px 0 0; padding: 8px; border-radius: 7px; background: #f0fdf4; color: #166534; }
.message.error { background: #fef2f2; color: #991b1b; }
</style>
