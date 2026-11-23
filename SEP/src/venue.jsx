import { useEffect, useRef, useState } from 'react'
import { CORNERS, LIMITS, TABLE_STATES, applyZoneRanges, dropTable, generateLayout, hasSavedLayout, occupiedTables, resizeZone, zoneRange } from './planner.mjs'
import { useText } from './language.jsx'
import { Button, ErrorMessage, Field, Icon, useSubmit } from './ui.jsx'
import { BulkStateEditor, LayoutPicker, TableStateEditor } from './table-state-editors.jsx'
import { tableStateName } from './table-review.jsx'

const zoneName = (t, index) => t('{name} 区', { name: index < 26 ? String.fromCharCode(65 + index) : index + 1 })

function Zone({ zone, index, total, range, editRange, occupied, selected, activate, move, drag, modify, editing, tableStates, editStatus }) {
  const t = useText()
  const name = zoneName(t, index)
  const count = zone.tiles.filter(Boolean).length
  const fromLayout = zoneRange(zone)
  const values = range ?? fromLayout
  return <section className="zone panel">
    <div className="line"><h3><span className="zone-marker" style={{ '--zone-color': ['#89acd9', '#8db58b', '#d9b767', '#ad94d2'][index % 4] }} />{name}</h3><span className="muted">{t('{count} 桌', { count })}</span></div>
    {editing ? <><div className="zone-fields range-fields">
      {[['first', '起始桌号'], ['last', '结束桌号']].map(([field, label]) => <Field key={field} label={t(label)}>
        <input aria-label={`${name} · ${t(label)}`} type="number" min="1" max={total} value={values[field]}
          onChange={event => editRange(index, { ...values, [field]: event.target.value })} />
      </Field>)}
    </div>
    {!range && count > 0 && fromLayout.first === '' ? <p className="small muted">{t('本区桌号不连续')}</p> : null}
    <div className="zone-fields">
      <Field label={t('排数')}><input aria-label={`${name} · ${t('排数')}`} type="number" min="1" max={LIMITS.dimension} key={`r${zone.rows}`} defaultValue={zone.rows} onBlur={e => {
        if (modify(+e.target.value, zone.columns, zone.corner) === false) e.target.value = zone.rows
      }} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }} /></Field>
      <Field label={t('每排桌数')}><input aria-label={`${name} · ${t('每排桌数')}`} type="number" min="1" max={LIMITS.dimension} key={`c${zone.columns}`} defaultValue={zone.columns} onBlur={e => {
        if (modify(zone.rows, +e.target.value, zone.corner) === false) e.target.value = zone.columns
      }} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }} /></Field>
      <Field label={t('最小桌号位置')}><select aria-label={`${name} · ${t('最小桌号位置')}`} value={zone.corner} onChange={e => modify(zone.rows, zone.columns, e.target.value)}>
        {CORNERS.map(([key, label]) => <option value={key} key={key}>{t(label)}</option>)}
      </select></Field>
    </div></> : null}
    <div className="zone-scroll"><div className="table-tiles" style={{ '--columns': zone.columns }}>
      {zone.tiles.map((number, cell) => {
        const owner = occupied.get(number)
        const state = tableStates?.[number]
        const active = selected?.zone === index && selected?.cell === cell
        const tileLabel = number
          ? owner ? t('第 {table} 桌，{owner}占用', { table: number, owner: owner.name })
            : t(state ? '第 {table} 桌' : '第 {table} 桌，空闲', { table: number })
          : t('{zone} 空格 {cell}', { zone: name, cell: cell + 1 })
        const description = state ? `${tileLabel} · ${tableStateName(t, state)}` : tileLabel
        return <button type="button" key={cell} data-zone={index} data-cell={cell} data-state={state?.kind}
          aria-pressed={editing ? active : undefined} aria-label={description}
          title={number ? description : t('空格')} disabled={!editing && !number}
          className={`table-tile${number ? '' : ' blank'}${owner ? ' occupied' : ''}${active ? ' active' : ''}`}
          style={owner ? { '--event-color': owner.color } : undefined}
          onClick={event => {
            if (drag.current?.completed && event.detail > 0) {
              drag.current = null
              return
            }
            if (editing) activate({ zone: index, cell }, number)
            else if (number) editStatus(number)
          }}
          onContextMenu={event => {
            if (!number) return
            event.preventDefault()
            clearTimeout(drag.current?.timer)
            drag.current = { completed: true }
            editStatus(number)
          }}
          onPointerDown={event => {
            if (!event.isPrimary || event.button !== 0) return
            clearTimeout(drag.current?.timer)
            if (!number) return void (drag.current = null)
            drag.current = { x: event.clientX, y: event.clientY, timer: setTimeout(() => {
              drag.current = { completed: true }
              editStatus(number)
            }, 500) }
            event.currentTarget.setPointerCapture(event.pointerId)
          }}
          onPointerMove={event => {
            const start = drag.current
            if (event.isPrimary && start?.timer && Math.hypot(start.x - event.clientX, start.y - event.clientY) >= 6) {
              clearTimeout(start.timer)
              start.timer = null
            }
          }}
          onPointerCancel={() => { clearTimeout(drag.current?.timer); drag.current = null }}
          onPointerUp={event => {
            const start = drag.current
            if (!event.isPrimary || !start || start.completed || !number) return
            clearTimeout(start.timer)
            if (Math.hypot(start.x - event.clientX, start.y - event.clientY) < 6) {
              drag.current = null
              return
            }
            drag.current = { completed: true }
            const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('.table-tile')
            if (editing && target) move({ zone: index, cell }, { zone: Number(target.dataset.zone), cell: Number(target.dataset.cell) })
          }}
        >{number}</button>
      })}
    </div></div>
  </section>
}

export function Venue({ day, days, revision, save }) {
  const t = useText()
  const [draft, setDraft] = useState(null)
  const [rangeDraft, setRangeDraft] = useState(null)
  const [tables, setTables] = useState(null)
  const [count, setCount] = useState(null)
  const [selected, setSelected] = useState(null)
  const [validation, setValidation] = useState(null)
  const [editing, setEditing] = useState(() => !hasSavedLayout(day))
  const [panel, setPanel] = useState(null)
  const { submit, busy, error } = useSubmit(async () => {
    await commit(layout, draftRevision ?? revision)
  })
  const layout = draft ?? day
  const occupied = occupiedTables(day)
  const owners = [...new Map([...occupied.values()].map(match => [match.id, match])).values()]
  const drag = useRef(null)
  useEffect(() => () => clearTimeout(drag.current?.timer), [])
  const savedDays = days.filter(other => other.id !== day.id && hasSavedLayout(other)).toSorted((a, b) => a.date.localeCompare(b.date))
  const selectedTable = selected ? layout.zones[selected.zone]?.tiles[selected.cell] : null
  const needsGenerate = (tables != null && +tables !== layout.tables) || (count != null && +count !== layout.zones.length)
  const draftRevision = draft?.revision ?? rangeDraft?.revision
  const stale = draftRevision != null && draftRevision !== revision
  const validate = (key, values) => setValidation({ key, values })
  const dirty = Boolean(draft || rangeDraft || needsGenerate)

  function reset() {
    setDraft(null)
    setRangeDraft(null)
    setTables(null)
    setCount(null)
    setSelected(null)
    setValidation(null)
  }
  function update(total, zones, tableStates = layout.tableStates ?? {}) {
    setDraft({ tables: total, zones, tableStates, revision: draftRevision ?? revision })
    setValidation(null)
  }
  async function commit({ tables, zones, tableStates }, version) {
    await save({ tables, zones, tableStates }, version)
    reset()
    setEditing(false)
  }
  function editStatus(table) {
    setSelected(null)
    setPanel({ type: 'table', table })
  }
  async function changeStates(numbers, state) {
    const updated = { ...layout.tableStates }
    for (const number of numbers) {
      if (state) updated[number] = state
      else delete updated[number]
    }
    if (dirty) update(layout.tables, layout.zones, updated)
    else await commit({ ...layout, tableStates: updated }, revision)
    setPanel(null)
  }
  function copyLayout(source) {
    if (!source) return
    setPanel(null)
    if ([...occupied.keys()].some(number => number > source.tables)) {
      return validate('请先释放超出新桌数范围的桌位。')
    }
    setTables(null)
    setCount(null)
    setRangeDraft(null)
    setSelected(null)
    update(source.tables, source.zones, source.tableStates ?? {})
    setEditing(true)
  }
  function editRange(index, value) {
    setRangeDraft(previous => ({ revision: draftRevision ?? revision, values: { ...previous?.values, [index]: value } }))
    setValidation(null)
  }
  function applyRanges() {
    const ranges = Object.fromEntries(Object.entries(rangeDraft.values)
      .filter(([, { first, last }]) => first !== '' || last !== '')
      .map(([index, { first, last }]) => [index, { first: Number(first), last: Number(last) }]))
    try {
      update(layout.tables, applyZoneRanges(layout, ranges))
      setRangeDraft(null)
      setSelected(null)
    } catch (failure) {
      const { cause } = failure
      if (failure.message === 'invalidRange') validate('{zone}的起止桌号须为 1–{max} 的整数，且起始桌号不能大于结束桌号。', { index: cause.index, max: cause.max })
      else if (failure.message === 'duplicateTable') validate('第 {table} 桌同时分配给了{other}和{zone}。', cause)
      else if (failure.message === 'missingTable') validate('第 {table} 桌未分配到任何分区。', cause)
      else if (failure.message === 'tooManyCells') validate('布局最多支持 8192 个格位。')
      else throw failure
    }
  }
  function move(source, target) {
    if (source.zone !== target.zone || source.cell !== target.cell) {
      update(layout.tables, dropTable(layout.zones, source, target))
    }
    setSelected(null)
  }
  function modify(index, rows, columns, corner) {
    const zone = layout.zones[index]
    if (rows === zone.rows && columns === zone.columns && corner === zone.corner) return true
    if (![rows, columns].every(n => Number.isInteger(n) && n >= 1 && n <= LIMITS.dimension)) {
      validate('排数和每排桌数须为 1–{max} 的整数。', { max: LIMITS.dimension })
      return false
    }
    if (rows * columns < zone.tiles.filter(Boolean).length) {
      validate('这个分区的格位数少于现有桌数。请先增加排数或每排桌数。')
      return false
    }
    const otherCells = layout.zones.reduce((sum, other, i) => i === index ? sum : sum + other.tiles.length, 0)
    if (rows * columns + otherCells > 8192) {
      validate('布局最多支持 8192 个格位。')
      return false
    }
    update(layout.tables, layout.zones.map((other, i) => i === index ? resizeZone(zone, rows, columns, corner) : other))
    setSelected(null)
    return true
  }
  const params = validation?.values
  const validationText = validation && t(validation.key, {
    ...params,
    ...(params?.index != null ? { zone: zoneName(t, params.index) } : {}),
    ...(params?.other != null ? { other: zoneName(t, params.other) } : {}),
  })
  return <>
    <div className="line section-heading layout-heading"><h2>{t('赛场布局')}</h2><div className="actions">
      {savedDays.length ? <Button icon="layers" onClick={() => setPanel({ type: 'copy' })} disabled={busy || stale}>{t('代入已有布局')}</Button> : null}
      <Button icon="table" onClick={() => setPanel({ type: 'bulk' })} disabled={busy || stale}>{t('批量设置桌位状态')}</Button>
      <Button icon="edit" aria-expanded={editing} onClick={() => { setEditing(!editing); setSelected(null) }}>{t(editing ? '收起设置' : '编辑布局')}</Button>
      {dirty || validation ? <Button icon="reset" onClick={reset}>{t('还原布局')}</Button> : null}
      {editing || dirty ? <Button icon="check" kind="primary" disabled={!!rangeDraft || needsGenerate || busy || stale} onClick={() => submit()}>{t('保存布局')}</Button> : null}
    </div></div>
    {dirty ? <p className="small muted layout-unsaved" role="status">{t('有未保存的更改')}</p> : null}
    {editing ? <><form className="panel layout-toolbar" onSubmit={event => {
      event.preventDefault()
      const total = +(tables ?? layout.tables)
      const zones = +(count ?? layout.zones.length)
      if (zones > total) return validate('分区数量不能超过总桌数。')
      if ([...occupied.keys()].some(number => number > total)) return validate('请先释放超出新桌数范围的桌位。')
      const states = Object.fromEntries(Object.entries(layout.tableStates ?? {}).filter(([table]) => +table <= total))
      update(total, generateLayout(total, zones), states)
      setRangeDraft(null)
      setSelected(null)
    }}>
      <Field label={t('总桌数')}><input type="number" min="1" max={LIMITS.tables} required value={tables ?? layout.tables} onChange={e => setTables(e.target.value)} /></Field>
      <Field label={t('分区数量')}><input type="number" min="1" max={LIMITS.zones} required value={count ?? layout.zones.length} onChange={e => setCount(e.target.value)} /></Field>
      <Button type="submit" icon="grid">{t('生成布局')}</Button>
    </form>
    <div className="range-toolbar">
      <p className="small muted">{t('修改各区的起止桌号后一起应用。每张桌必须分配到一个分区。')}</p>
      <Button onClick={applyRanges} disabled={!rangeDraft || needsGenerate || busy || stale}>{t('应用分区范围')}</Button>
    </div></> : null}
    <ErrorMessage text={stale ? t('赛事资料已更新。请还原布局以加载最新版，再重新修改。') : validationText || error} />
    <div className="layout-grid">
      {layout.zones.map((zone, index) => <Zone key={index} {...{ zone, index, occupied, selected, move, drag, editing, editStatus }} tableStates={layout.tableStates}
        total={layout.tables} range={rangeDraft?.values[index]} editRange={editRange}
        modify={(rows, columns, corner) => modify(index, rows, columns, corner)}
        activate={(tile, number) => { if (selected) move(selected, tile); else if (number) setSelected(tile) }} />)}
    </div>
    <p className="layout-instruction" aria-live="polite">{selectedTable ? t('已选中第 {table} 桌。点选目标格位即可交换或移动。', { table: selectedTable })
      : t(editing ? '拖动桌号可交换位置，也可以先点一个桌号再点目标位置。' : '点选或长按桌号可编辑桌位状态。')}{editing ? <> · {t('长按桌号可编辑桌位状态。')}</> : null}</p>
    <div className="legend"><strong>{t('桌位图例')}</strong><span><i className="legend-free" />{t('空闲')}</span>
      {Object.entries(TABLE_STATES).filter(([kind]) => kind !== 'free').map(([kind, label]) => <span key={kind}><i className="state-marker" data-state={kind} />{t(label)}</span>)}
      {owners.map(match => <span key={match.id}><i style={{ background: match.color }} />{match.name}</span>)}
      <span className="legend-total"><Icon name="table" size={15} />{t('{zones} 个分区 · {tables} 桌', { zones: layout.zones.length, tables: layout.tables })}</span>
    </div>
    {panel?.type === 'table' ? <TableStateEditor key={panel.table} table={panel.table} status={layout.tableStates?.[panel.table]}
      save={state => changeStates([panel.table], state)} close={() => setPanel(null)} /> : null}
    {panel?.type === 'bulk' ? <BulkStateEditor total={layout.tables} save={({ numbers, state }) => changeStates(numbers, state)} close={() => setPanel(null)} /> : null}
    {panel?.type === 'copy' && savedDays.length ? <LayoutPicker days={savedDays} apply={copyLayout} close={() => setPanel(null)} /> : null}
  </>
}
