import { useLanguage, useText } from './language.jsx'
import { useId, useState } from 'react'
import { FORMATS, LIMITS, TABLE_STATES, allocateTables, currentRange, currentRound, estimate, firstAssignedTable, forecastsFor, formatTableRange, formatTime, localNow, ordered, plansFor, roundMinutes, roundRange, tablesFor } from './planner.mjs'
import { Button, Dialog, dayLabel, ErrorMessage, Field, formObject, useSubmit } from './ui.jsx'
import { TableReview, useTableReview } from './table-review.jsx'

const number = (min, max, value) => ({ type: 'number', min, max, defaultValue: value, required: true })
const textInput = value => ({ defaultValue: value, required: true, maxLength: 100 })
const nextDate = date => date ? new Date(Date.parse(date) + 86400000).toISOString().slice(0, 10) : ''

function DayFields({ day = {}, index = '', onDate }) {
  const { language, t } = useLanguage()
  const [date, setDate] = useState(day.date || '')
  return <div className="fields day-fields">
    <Field label={t('比赛日期')} hint={date ? dayLabel(date, language) : ''}><input name={`date${index}`} type="date" required value={date} onChange={event => { setDate(event.target.value); onDate?.(event.target.value) }} /></Field>
    <Field label={t('总桌数')}><input name={`tables${index}`} {...number(1, LIMITS.tables, day.tables || 128)} /></Field>
    <Field label={t('每桌人数')}><input name={`seats${index}`} {...number(1, 100, day.seats || 2)} readOnly={day.matches?.some(match => match.history.length)} /></Field>
  </div>
}

export function EventEditor({ event, save, close, onDelete }) {
  const t = useText()
  const { submit, busy, error } = useSubmit(save)
  const [dates, setDates] = useState([localNow('Asia/Hong_Kong').slice(0, 10)])
  const zones = useId()
  return <form onSubmit={e => {
    const values = formObject(e)
    const { name, lead, game, timeZone } = values
    const days = dates.map((_, i) => ({ date: values[`date${i}`], tables: +values[`tables${i}`], seats: +values[`seats${i}`] }))
    submit({ name, lead, game, timeZone, days })
  }}>
    <div className="dialog-body">
      <div className="fields">
        <Field label={t('赛事名称')}><input name="name" autoFocus {...textInput(event?.name)} /></Field>
        <Field label={t('总负责人')}><input name="lead" {...textInput(event?.lead)} /></Field>
        <Field label={t('游戏')}><select name="game" defaultValue={event?.game || 'FAB'}><option>FAB</option><option>MTG</option></select></Field>
        <Field label={t('赛事时区')}><input name="timeZone" list={zones} required defaultValue={event?.timeZone || 'Asia/Hong_Kong'} maxLength="80" />
          <datalist id={zones}>{['Asia/Hong_Kong', 'Asia/Shanghai', 'Asia/Taipei', 'Asia/Tokyo', 'Asia/Singapore', 'Europe/London', 'Europe/Paris', 'America/New_York', 'America/Los_Angeles', 'Australia/Sydney'].map(zone => <option key={zone} value={zone} />)}</datalist>
        </Field>
      </div>
      {!event ? <div className="form-section">
        <div className="line"><h3>{t('比赛日')}</h3><span className="muted">{t('{count} / {limit} 天', { count: dates.length, limit: LIMITS.days })}</span></div>
        {dates.map((date, index) => <DayFields key={index} index={index} day={{ date }} onDate={value => setDates(list => list.map((d, i) => i === index ? value : d))} />)}
        <div className="actions start"><Button icon="plus" disabled={dates.length >= LIMITS.days} onClick={() => setDates([...dates, nextDate(dates.at(-1))])}>{t('添加比赛日')}</Button>
          {dates.length > 1 ? <Button kind="ghost" onClick={() => setDates(dates.slice(0, -1))}>{t('移除最后一天')}</Button> : null}</div>
      </div> : null}
      <ErrorMessage text={error} />
    </div>
    <footer className={event ? 'dialog-actions spread' : 'dialog-actions'}>
      {event ? <Button kind="danger-outline" onClick={onDelete} disabled={busy}>{t('删除赛事')}</Button> : null}
      <div className="actions"><Button onClick={close}>{t('取消')}</Button><Button kind="primary" type="submit" disabled={busy}>{event ? t('保存赛事') : t('创建赛事')}</Button></div>
    </footer>
  </form>
}

function DeleteConfirmation({ message, save, close, cancelLabel }) {
  const t = useText()
  const { submit, busy, error } = useSubmit(save)
  return <form onSubmit={e => submit(formObject(e))}>
    <div className="dialog-body">
      <p>{message}</p>
      <Field label={t('输入「删除」或「DELETE」确认')}><input name="confirmation" maxLength="20" autoFocus required autoComplete="off" /></Field>
      <ErrorMessage text={error} />
    </div>
    <footer className="dialog-actions"><Button onClick={close} disabled={busy}>{cancelLabel}</Button><Button kind="danger" type="submit" disabled={busy}>{t('确认删除')}</Button></footer>
  </form>
}

export function DeleteEventEditor({ event, save, close }) {
  const t = useText()
  return <DeleteConfirmation message={t('删除「{name}」会一并删除比赛日、子赛事和赛场布局。', { name: event.name })}
    {...{ save, close }} cancelLabel={t('返回')} />
}

export function DeleteMatchEditor({ match, save, close }) {
  const t = useText()
  const { submit, busy, error } = useSubmit(save)
  return <form onSubmit={event => {
    event.preventDefault()
    submit({})
  }}>
    <div className="dialog-body">
      <p>{t('删除「{name}」会同时移除它的轮次与完赛记录。', { name: match.name })}</p>
      <ErrorMessage text={error} />
    </div>
    <footer className="dialog-actions">
      <Button onClick={close} disabled={busy} autoFocus>{t('取消')}</Button>
      <Button kind="danger" type="submit" disabled={busy}>{t('确认删除')}</Button>
    </footer>
  </form>
}

export function DayEditor({ day, event, save, close, deleteDay }) {
  const t = useText()
  const { submit, busy, error } = useSubmit(save)
  const [confirming, setConfirming] = useState(false)
  const initialDay = day ?? { date: nextDate(event.days.map(item => item.date).toSorted().at(-1)) || localNow(event.timeZone).slice(0, 10) }
  return <>
    <form onSubmit={e => {
      const { date, tables, seats } = formObject(e)
      submit({ date, tables: +tables, seats: +seats })
    }}>
      <div className="dialog-body">
        <DayFields day={initialDay} />
        {day ? <p className="muted small">{t('调整总桌数会按现有分区数重新生成桌号布局。')}</p> : null}
        <ErrorMessage text={error} />
      </div>
      <footer className={day ? 'dialog-actions spread' : 'dialog-actions'}>
        {day ? <Button kind="danger-outline" onClick={() => setConfirming(true)} disabled={busy}>{t('删除此日')}</Button> : null}
        <div className="actions"><Button onClick={close}>{t('取消')}</Button><Button kind="primary" type="submit" disabled={busy}>{t('保存比赛日')}</Button></div>
      </footer>
    </form>
    {confirming ? <Dialog title={t('删除此日')} close={() => setConfirming(false)}>
      <DeleteConfirmation message={t('删除 {date} 会一并删除当天的子赛事、轮次和赛场布局。', { date: day.date })}
        save={deleteDay} close={() => setConfirming(false)} cancelLabel={t('取消')} />
    </Dialog> : null}
  </>
}

export function PlanSummary({ plan, day, forecast }) {
  const t = useText()
  return <div className="plan-summary">
    <dl className="fact-grid">
      <div><dt>{t('所需桌数')}</dt><dd>{plan.tables}</dd></div>
      <div><dt>{t('建议起始桌号')}</dt><dd>{firstAssignedTable(plan) ?? plan.first}</dd></div>
      <div><dt>{t('首轮尾桌桌号')}</dt><dd>{plan.last ?? '—'}</dd></div>
      <div><dt>{t('按计划的瑞士轮预计结束')}</dt><dd>{formatTime(plan.end, day.date)}</dd></div>
    </dl>
    <TableAllocationNotes range={plan} />
    <p className="small muted">{t(plan.firstFrom)}</p>
    {forecast ? <p className="small muted">{t('当前报名情景可容纳 {registered} 人 · 满额情景建议售票上限 {limit} 人 · 换桌段最高 {best} 人', {
      registered: forecast.registeredLimit, limit: forecast.salesLimit, best: forecast.bestLimit,
    })}</p> : null}
    {forecast?.capacityShort || forecast?.playersShort ? <ErrorMessage text={forecast.playersShort ? t('按当前报名人数，预计桌数短缺。') : t('按售票容量，预计桌数短缺。')} /> : null}
    <AlternateTable forecast={forecast} />
  </div>
}

export function AlternateTable({ forecast }) {
  const t = useText()
  return forecast?.alternativeFirst != null
    ? <small className="table-alternative">{t(forecast.playersShort ? '按当前报名，可从 {table} 号桌起排' : '按满额测算，可从 {table} 号桌起排', {
      table: forecast.alternativeFirst,
    })}</small>
    : null
}

export function TableAllocationNotes({ range }) {
  const t = useText()
  return <>
    {range?.skipped?.length ? <small className="allocation-note">{t('跳过桌号：{tables}', { tables: range.skipped.join(', ') })}</small> : null}
    {range?.included?.map(({ first, last, kind, label }) => <small key={first} className="allocation-note">
      {t(label ? '{tables}桌{state}但已包含在内，{label}' : '{tables}桌{state}但已包含在内', {
        tables: first === last ? first : `${first}-${last}`, state: t(TABLE_STATES[kind]), label,
      })}
    </small>)}
  </>
}

function CopyMatchEditor({ projects, projectId, currentDay, game, copy, close }) {
  const { t, language } = useLanguage()
  const [sourceProjectId, setSourceProjectId] = useState(projectId)
  const [sourceDayId, setSourceDayId] = useState(currentDay.id)
  const [sourceMatchId, setSourceMatchId] = useState('')
  const sources = projects.map(project => ({
    ...project,
    days: project.days.map(day => ({
      ...day, matches: ordered(day).filter(match => FORMATS[game].includes(match.format)),
    })).filter(day => day.matches.length).sort((a, b) => a.date.localeCompare(b.date)),
  })).filter(project => project.days.length)
  const source = sources.find(project => project.id === sourceProjectId) ?? sources[0]
  const day = source?.days.find(day => day.id === sourceDayId) ?? source?.days[0]
  const match = day?.matches.find(match => match.id === sourceMatchId) ?? day?.matches[0]

  return <Dialog title={t('从已有比赛中复制')} close={close}>
    <form onSubmit={event => {
      event.preventDefault()
      if (match) copy(match)
    }}>
      <div className="dialog-body">
        {match ? <>
          <Field label={t('来源赛事')}><select value={source.id} onChange={event => {
            setSourceProjectId(event.target.value)
            setSourceDayId('')
            setSourceMatchId('')
          }} autoFocus>{sources.map(project => <option key={project.id} value={project.id}>{project.name} · {project.game}</option>)}</select></Field>
          <Field label={t('来源比赛日')}><select value={day.id} onChange={event => {
            setSourceDayId(event.target.value)
            setSourceMatchId('')
          }}>{source.days.map(day => <option key={day.id} value={day.id}>{day.date} · {dayLabel(day.date, language)}</option>)}</select></Field>
          <Field label={t('来源子赛事')}><select value={match.id} onChange={event => setSourceMatchId(event.target.value)}>
            {day.matches.map(match => <option key={match.id} value={match.id}>{match.time} · {match.name} · {match.format}</option>)}
          </select></Field>
          <p className="small muted">{t('复制名称、计划开始时间、赛制、每轮标准时间和瑞士轮数量。')}</p>
        </> : <p>{t('暂无赛制适用于当前游戏的子赛事。')}</p>}
      </div>
      <footer className="dialog-actions">
        <Button onClick={close}>{t('取消')}</Button>
        {match ? <Button kind="primary" type="submit">{t('复制到表单')}</Button> : null}
      </footer>
    </form>
  </Dialog>
}

export function MatchEditor({ game, day, match, now, projects, projectId, save, close, onLayout, onDetail }) {
  const t = useText()
  const { submit, busy, error } = useSubmit(save)
  const review = useTableReview(day)
  const [copiedFields, setCopiedFields] = useState(() => {
    const format = match?.format ?? FORMATS[game][0]
    return {
      name: match?.name ?? '', time: match?.time ?? '09:00', format,
      minutes: match?.minutes ?? roundMinutes(game, format), rounds: match?.rounds ?? 3,
    }
  })
  const [copyOpen, setCopyOpen] = useState(false)
  const [preview, setPreview] = useState(null)
  const formId = useId()
  function editCopiedField(field, value) {
    setCopiedFields(values => ({ ...values, [field]: value,
      ...(field === 'format' ? { minutes: roundMinutes(game, value) } : {}),
    }))
  }
  function copyMatch({ name, time, format, minutes, rounds }) {
    setCopiedFields({ name, time, format, minutes, rounds })
    setPreview(null)
    setCopyOpen(false)
  }
  const toMatch = fields => ({
    ...fields, capacity: +fields.capacity, players: +fields.players,
    first: fields.first === '' ? null : +fields.first, minutes: +fields.minutes, rounds: +fields.rounds,
  })
  function previewPlan(form) {
    if (!form.reportValidity()) return
    const draft = { history: [], actualStart: null, endedAt: null, ...match, ...toMatch(Object.fromEntries(new FormData(form))), id: match?.id ?? 'preview' }
    const matches = match ? day.matches.map(m => m.id === match.id ? draft : m) : [...day.matches, draft]
    const proposal = { ...day, matches }
    const plan = plansFor(proposal).get(draft.id)
    review.start(plan.first, plan.tables, {}, (_, choices) => {
      draft.planChoices = choices
      const plans = plansFor(proposal)
      setPreview({ plan: plans.get(draft.id), forecast: forecastsFor(proposal, plans, now).get(draft.id), choices })
    })
  }
  return <><form id={formId} onChange={() => setPreview(null)} onSubmit={event => {
    const values = toMatch(formObject(event))
    submit(preview ? { ...values, planChoices: preview.choices } : values)
  }}>
    <div className="dialog-body">
      {!match ? <div className="match-copy-actions"><Button icon="layers" onClick={() => setCopyOpen(true)}>{t('从已有比赛中复制')}</Button></div> : null}
      <div className="fields">
        <Field label={t('子赛事名称')}><input name="name" autoFocus required maxLength="100" value={copiedFields.name} onChange={event => editCopiedField('name', event.target.value)} /></Field>
        <Field label={t('主裁判 / 负责人')}><input name="lead" {...textInput(match?.lead)} /></Field>
        <Field label={t('计划开始时间')}><input name="time" type="time" value={copiedFields.time} required onChange={event => editCopiedField('time', event.target.value)} /></Field>
        <Field label={t('赛制')}><select name="format" value={copiedFields.format} onChange={event => editCopiedField('format', event.target.value)}>
          {FORMATS[game].map(value => <option key={value}>{value}</option>)}</select></Field>
        <Field label={t('赛事容量')}><input name="capacity" {...number(1, LIMITS.players, match?.capacity ?? 32)} /></Field>
        <Field label={t('赛事人数')}><input name="players" {...number(Math.max(0, ...(match?.history ?? []).map(round => round.players)), LIMITS.players, match?.players ?? 0)} /></Field>
        <Field label={t('起始桌号（可留空）')}><input name="first" type="number" min="1" max={Math.max(day.tables, match?.first ?? 0)} defaultValue={match?.first ?? ''} /></Field>
        <Field label={t('每轮标准时间（分钟）')}><input name="minutes" type="number" min="1" max={LIMITS.roundMinutes} value={copiedFields.minutes}
          onChange={event => editCopiedField('minutes', event.target.value)} required /></Field>
        <Field label={t('瑞士轮数量')}><input name="rounds" type="number" min={Math.max(1, match ? currentRound(match) : 0)} max={LIMITS.rounds}
          value={copiedFields.rounds} onChange={event => editCopiedField('rounds', event.target.value)} required /></Field>
      </div>
      {preview ? <PlanSummary {...preview} day={day} /> : null}
      <ErrorMessage text={error} />
    </div>
    <footer className="dialog-actions spread"><Button icon="layers" onClick={e => previewPlan(e.currentTarget.form)}>{t('Plan for me / 为我规划')}</Button>
      <div className="actions"><Button onClick={close}>{t('取消')}</Button><Button kind="primary" type="submit" disabled={busy}>{t('保存子赛事')}</Button></div>
    </footer>
  </form>
    {copyOpen ? <CopyMatchEditor {...{ projects, projectId, game }} currentDay={day} copy={copyMatch} close={() => setCopyOpen(false)} /> : null}
    <TableReview {...{ review, onLayout, onDetail }} />
  </>
}

export function MatchDetail({ day, match, open, plan, forecast, savePlan, onLayout }) {
  const t = useText()
  const [planning, setPlanning] = useState(false)
  const [finishedPlan, setFinishedPlan] = useState(null)
  const review = useTableReview(day)
  const { submit, busy, error } = useSubmit(async choices => {
    if (JSON.stringify(choices) !== JSON.stringify(match.planChoices ?? {})) await savePlan(choices)
    setPlanning(true)
  })
  const range = currentRange(match, day)
  const round = currentRound(match)
  const officialEnd = match.actualStart ? estimate(match.actualStart, match) : null
  return <><div className="dialog-body">
    <div className="detail-meta"><span className="dot" style={{ '--event-color': match.color }} />{match.format} · {match.lead}</div>
    <dl className="fact-grid detail-facts">
      <div><dt>{t('计划开始')}</dt><dd>{match.time}</dd></div>
      <div><dt>{t('赛事人数 / 容量')}</dt><dd>{match.players} / {match.capacity}</dd></div>
      <div><dt>{t('瑞士轮 / 每轮')}</dt><dd>{match.rounds} / {t('{minutes} 分', { minutes: match.minutes })}</dd></div>
      <div><dt>{t('实际开赛')}</dt><dd>{formatTime(match.actualStart, day.date)}</dd></div>
      <div><dt>{t('瑞士轮预计结束')}</dt><dd>{formatTime(officialEnd, day.date)}</dd></div>
      <div><dt>{match.endedAt ? t('完赛时间') : t('当前占桌')}</dt><dd>{match.endedAt ? formatTime(match.endedAt, day.date) : formatTableRange(range)}</dd>{match.endedAt ? null : <TableAllocationNotes range={range} />}</div>
    </dl>
    <div className="actions detail-actions">
      <Button icon="layers" disabled={busy} onClick={() => {
        if (planning) return setPlanning(false)
        review.start(plan.first, plan.tables, {}, (allocation, choices) => {
          if (match.endedAt) {
            setFinishedPlan({ ...plan, ...allocation })
            setPlanning(true)
          } else submit(choices)
        })
      }} aria-expanded={planning}>{t('Plan for me / 为我规划')}</Button>
      {!match.endedAt ? <>
        <Button icon="edit" onClick={() => open('editMatch')}>{t('编辑信息')}</Button>
        {round ? <Button icon="edit" onClick={() => open('correctRound')}>{t('更正当前轮次')}</Button> : null}
        <Button icon="clock" onClick={() => open('actualStart')}>{t('实际开赛时间')}</Button>
        <Button kind="danger-outline" onClick={() => open('end')}>{t('结束赛事')}</Button>
        <Button kind="primary" disabled={round >= match.rounds} onClick={() => open('round')}>{round >= match.rounds ? t('全部瑞士轮已开始') : t('开始第 {n} 轮', { n: round + 1 })}</Button>
      </> : null}
    </div>
    <ErrorMessage text={error} />
    {planning ? <PlanSummary plan={finishedPlan ?? plan} forecast={forecast} day={day} /> : null}
    {round ? <div className="form-section">
      <h3>{t('轮次记录')}</h3>
      <div className="table-scroll"><table className="compact-table"><thead><tr><th>{t('轮次')}</th><th>{t('人数')}</th><th>{t('累计退赛')}</th><th>{t('桌号')}</th><th>{t('登记时间')}</th></tr></thead>
        <tbody>{match.history.map((item, index) => {
          const range = roundRange(item, day)
          return <tr key={index}><td>{t('第 {n} 轮', { n: item.round ?? index + 1 })}</td><td>{item.players}</td><td>{match.players - item.players}</td><td>{formatTableRange(range)}<TableAllocationNotes range={range} /></td><td>{formatTime(item.at, day.date)}</td></tr>
        })}</tbody>
      </table></div>
    </div> : null}
  </div><TableReview {...{ review, onLayout }} /></>
}

export function OperationsEditor({ mode, event, day, match, plan, save, close, onLayout }) {
  const t = useText()
  const { submit, busy, error } = useSubmit(save)
  const review = useTableReview(day)
  const previousRound = currentRound(match)
  const nextRound = previousRound + 1
  const lastRound = match.history.at(-1)
  const [start, setStart] = useState(lastRound?.first ?? (plan.first <= day.tables ? plan.first : ''))
  const [players, setPlayers] = useState(lastRound?.players ?? match.players)
  const [registered, setRegistered] = useState(match.players)
  const [reviewedChoices, setReviewedChoices] = useState(null)
  const drops = players === '' || registered === '' ? '' : Math.max(0, Number(registered) - Number(players))
  const needed = players === '' ? null : tablesFor(+players, day)
  const correcting = mode === 'correctRound'
  const defaultChoices = correcting ? lastRound?.choices ?? {} : { ...match.planChoices, ...lastRound?.choices }
  const choices = reviewedChoices ?? defaultChoices
  const validStart = start !== '' && Number.isInteger(+start) && +start >= 1 && +start <= day.tables
  const allocation = validStart && needed != null ? allocateTables(day, +start, needed, choices) : null
  const canReview = correcting && allocation && Boolean(allocateTables(day, +start, needed, {}, 'ask').warning)
  const isRound = mode === 'round' || correcting
  const isEnd = mode === 'end'
  return <><form onSubmit={e => {
    const values = formObject(e)
    if (!isRound) return submit(values)
    review.start(+values.first, needed, choices, (_, finalChoices) => {
      submit({ first: +values.first, players: +players, registered: +registered, round: correcting ? +values.round : nextRound, previousRound, choices: finalChoices })
    })
  }}>
    <div className="dialog-body">
      <p className="modal-context"><span className="dot" style={{ '--event-color': match.color }} />{match.name}</p>
      {isRound ? <>
        <div className="fields round-fields">
          {correcting ? <Field label={t('轮次')}><input name="round" {...number((match.history.at(-2)?.round ?? Math.max(0, match.history.length - 1)) + 1, match.rounds, previousRound)} /></Field> : null}
          <Field label={t(correcting ? '排桌起始桌号' : '实际起始桌号')} hint={correcting
            ? t('从此桌开始检查。下方显示实际占用范围。')
            : nextRound === 1 ? t('建议第 {table} 桌', { table: firstAssignedTable(plan) ?? plan.first }) : ''}>
            <input name="first" type="number" min="1" max={day.tables} autoFocus required value={start} onChange={e => setStart(e.target.value)} />
          </Field>
          {correcting ? <Field label={t('赛事人数')}><input type="number" min={Math.max(0, ...match.history.slice(0, -1).map(item => item.players))} max={LIMITS.players} required value={registered} onChange={e => setRegistered(e.target.value)} /></Field> : null}
          {!correcting && nextRound === 1 ? <Field label={t('首轮人数')}><input value={players} readOnly /></Field> : <>
            <Field label={t('当前比赛人数')}><input type="number" min="0" max={registered} required value={players} onChange={e => setPlayers(e.target.value)} /></Field>
            <Field label={t('退赛人数（累计）')} hint={t('当前人数与退赛人数合计须为 {count}。', { count: registered })}><input type="number" min="0" max={registered} required value={drops}
              onChange={e => setPlayers(e.target.value === '' ? '' : Number(registered) - Number(e.target.value))} /></Field>
          </>}
        </div>
        <div className="plan-summary round-table-preview">
          <dl className="fact-grid"><div><dt>{t('占用桌数')}</dt><dd>{needed ?? '—'}</dd></div><div><dt>{t('占桌范围')}</dt><dd>{formatTableRange(allocation)}</dd></div></dl>
          <TableAllocationNotes range={allocation} />
        </div>
        {canReview ? <div className="actions round-table-actions"><Button icon="edit" disabled={busy} onClick={e => {
          if (e.currentTarget.form.reportValidity()) {
            review.start(+start, needed, {}, (_, nextChoices) => setReviewedChoices(nextChoices))
          }
        }}>{t('重新选择标记桌位')}</Button></div> : null}
      </> : isEnd ? <>
        <p>{t('结束后会释放已占用桌位，并登记完赛时间。')}</p>
        <Field label={t('输入「结束」或「End」确认')}><input name="confirmation" maxLength="20" autoFocus required autoComplete="off" /></Field>
      </> : <Field label={t('实际开赛时间')} hint={t('赛事时区：{zone}', { zone: event.timeZone })}><input type="datetime-local" name="start" defaultValue={match.actualStart ?? localNow(event.timeZone)} max={localNow(event.timeZone)} autoFocus required /></Field>}
      <ErrorMessage text={error} />
    </div>
    <footer className="dialog-actions"><Button onClick={close}>{t('返回')}</Button><Button type="submit" kind={isEnd ? 'danger' : 'primary'} disabled={busy}>{isEnd ? t('确认结束') : correcting ? t('保存更正') : isRound ? t('确认开始') : t('保存时间')}</Button></footer>
  </form><TableReview {...{ review, onLayout }} onDetail={close} /></>
}
