import { currentLanguage, LanguageProvider, LanguageSwitch, useLanguage, useText } from './language.jsx'
import { translate } from './i18n.mjs'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AlternateTable, DayEditor, DeleteEventEditor, DeleteMatchEditor, EventEditor, MatchDetail, MatchEditor, OperationsEditor, TableAllocationNotes } from './editors.jsx'
import { LIMITS, currentRange, currentRound, estimate, forecastsFor, formatTableRange, formatTime, localNow, occupiedTables, ordered, plansFor, tablesFor } from './planner.mjs'
import { Brand, Button, Dialog, Empty, ErrorMessage, Field, Icon, dayLabel, formObject, useSubmit } from './ui.jsx'
import { Venue } from './venue.jsx'
import './style.css'

async function api(path, method = 'GET', data) {
  const language = currentLanguage()
  const headers = { 'Accept-Language': language === 'en' ? 'en' : 'zh-Hans' }
  if (data) headers['Content-Type'] = 'application/json'
  const response = await fetch(`/api/${path}`, {
    method,
    headers,
    ...(data ? { body: JSON.stringify(data) } : {}),
  })
  const result = await response.json().catch(() => null)
  if (!response.ok || !result) throw Object.assign(new Error(result?.error || translate(language, '请求失败。')), { status: response.status })
  return result
}

function Login({ onLogin }) {
  const t = useText()
  const { submit, busy, error } = useSubmit(async values => onLogin((await api('login', 'POST', values)).user))
  return <main className="login-shell">
    <section className="login-card panel">
      <Brand />
      <LanguageSwitch />
      <h1>{t('登录')}</h1>
      <form onSubmit={e => submit(formObject(e))}>
        <Field label={t('用户名')}><input name="name" autoComplete="username" maxLength="32" required autoFocus /></Field>
        <Field label={t('密码')}><input name="password" type="password" autoComplete="current-password" maxLength="128" required /></Field>
        <ErrorMessage text={error} />
        <Button kind="primary" type="submit" disabled={busy}>{busy ? t('正在登录…') : t('登录')}</Button>
      </form>
    </section>
  </main>
}

function Shell({ user, page, navigate, project, projects, choose, signOut, children }) {
  const t = useText()
  const sections = [['events', t('赛事总览'), 'calendar'], ['day', t('比赛日'), 'calendar'], ['venue', t('赛场布局'), 'grid'], ['users', t('用户管理'), 'user']]
  return <div className="app-shell">
    <aside className="sidebar">
      <Brand />
      <nav aria-label={t('主导航')}>
        {sections.map(([key, title, icon]) => <button type="button" key={key} onClick={() => navigate(key)}
          aria-current={page === key ? 'page' : undefined} disabled={!project && ['day', 'venue'].includes(key)}><Icon name={icon} />{title}</button>)}
      </nav>
      <div className="sidebar-footer"><LanguageSwitch />
        <div className="sidebar-user"><span className="avatar"><Icon name="user" size={17} /></span><strong>{user.name}</strong><button type="button" className="icon-button" aria-label={t('退出登录')} title={t('退出登录')} onClick={signOut}><Icon name="exit" /></button></div>
      </div>
    </aside>
    <main className="main-content">
      {project && ['day', 'venue'].includes(page) ? <header className="project-bar">
        <label className="project-selector panel"><span>{t('赛事')}</span><select value={project.id} onChange={e => choose(e.target.value, page)}>
          {projects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></label>
        <span className="game-label">{project.game}</span>
      </header> : null}
      {children}
    </main>
  </div>
}

function EventList({ events, choose, create, edit }) {
  const t = useText()
  return <>
    <header className="line page-title"><h1>{t('赛事总览')}</h1><Button kind="primary" icon="plus" onClick={create}>{t('创建赛事')}</Button></header>
    {events.length ? <div className="panel event-list">
      {events.map(project => {
        const dates = project.days.map(day => day.date).toSorted()
        const first = dates[0]
        const last = dates.at(-1)
        return <article className="event-list-row" key={project.id}>
          <div><span className="game-label">{project.game}</span><h2><button className="text-button" type="button" onClick={() => choose(project.id)}>{project.name}</button></h2>
            <p className="muted">{project.lead} · {first ? <>{first === last ? first : t('{first} 至 {last}', { first, last })} · </> : null}
              {t('{count} 个比赛日', { count: dates.length })}</p></div>
          <div className="actions"><Button icon="edit" onClick={() => edit(project.id)}>{t('编辑赛事')}</Button><Button kind="primary" onClick={() => choose(project.id)}>{t('打开比赛日')}</Button></div>
        </article>
      })}
    </div> : <Empty title={t('还没有赛事')} description={t('创建赛事并选择比赛日期，开始规划桌位。')} />}
  </>
}

function DayBar({ project, day, onSelect, addDay, editDay }) {
  const { language, t } = useLanguage()
  return <div className="day-bar">
    {day ? <nav aria-label={t('比赛日')} className="day-tabs">{project.days.toSorted((a, b) => a.date.localeCompare(b.date)).map(item => (
      <button key={item.id} type="button" onClick={() => onSelect(item.id)} aria-current={item.id === day.id ? 'date' : undefined}>{dayLabel(item.date, language)}</button>
    ))}</nav> : null}
    <div className="actions"><Button icon="plus" onClick={addDay} disabled={project.days.length >= LIMITS.days}>{t('添加比赛日')}</Button>
      {day ? <Button icon="edit" onClick={editDay}>{t('编辑比赛日')}</Button> : null}</div>
  </div>
}

function Schedule({ day, forecast, plans, open, create, deleteMatch }) {
  const t = useText()
  const [hide, setHide] = useState(false)
  const occupied = occupiedTables(day)
  const marked = Object.keys(day.tableStates ?? {}).filter(table => !occupied.has(+table)).length
  const matches = ordered(day).filter(match => !hide || !match.endedAt)
  const metrics = [[t('总桌数'), day.tables, 'table'], [t('已占用'), occupied.size, 'users'], [t('可用'), day.tables - occupied.size - marked, 'chair'], [t('子赛事'), day.matches.length, 'layers']]
  return <>
    <dl className="metrics">{metrics.map(([label, value, icon]) => <div className="panel metric" key={label}><Icon name={icon} size={28} /><div><dt>{label}</dt><dd>{value}</dd></div></div>)}</dl>
    <section className="schedule">
      <div className="line section-heading"><h2>{t('子赛事')}</h2><div className="actions"><label className="toggle"><input type="checkbox" checked={hide} onChange={e => setHide(e.target.checked)} /><span />{t('隐藏已结束比赛')}</label>
        <Button kind="primary" icon="plus" onClick={create} disabled={day.matches.length >= LIMITS.matches}>{t('新建子赛事')}</Button></div></div>
      {matches.length ? <div className="panel table-scroll">
        <table className="schedule-table"><thead><tr><th scope="col">{t('开始时间')}</th><th scope="col">{t('子赛事')}</th><th scope="col">{t('人数 / 容量')}</th><th scope="col">{t('桌数 / 桌号')}</th><th scope="col">{t('瑞士轮预计结束')}</th><th scope="col">{t('状态')}</th><th scope="col"><span className="sr-only">{t('操作')}</span></th></tr></thead>
          <tbody>{matches.map(match => {
            const plan = plans.get(match.id)
            const warning = forecast.get(match.id)
            const round = match.history.at(-1)
            const live = !match.endedAt && Boolean(round || match.actualStart)
            const assignment = round ? currentRange(match, day) : plan
            const count = round ? tablesFor(round.players, day) : plan.tables
            const status = match.endedAt ? t('已结束') : live ? round ? t('第 {n} 轮', { n: currentRound(match) }) : t('进行中') : t('待开赛')
            const short = warning?.playersShort || warning?.capacityShort
            return <tr key={match.id}>
              <td className="time-cell">{match.time}{match.actualStart ? <small>{t('实际 {time}', { time: formatTime(match.actualStart, day.date) })}</small> : null}</td>
              <td><button className="text-button match-name" type="button" onClick={() => open(match.id)}><span className="dot" style={{ '--event-color': match.color }} />{match.name}</button><small className="match-meta">{match.format} · {match.lead}</small></td>
              <td data-label={t('人数 / 容量')} className={short ? 'shortage' : ''}>{round && round.players !== match.players ? <>{round.players} <small className="inline">{t('当前')}</small><br /></> : null}{match.players} / {match.capacity}</td>
              <td data-label={t('桌数 / 桌号')}>{match.endedAt ? t('已释放') : <>{t('{count} 桌', { count })}{assignment.last != null ? <small>{formatTableRange(assignment)}</small> : null}<TableAllocationNotes range={assignment} /></>}</td>
              <td data-label={match.endedAt ? t('完赛时间') : t('瑞士轮预计结束')}>{match.endedAt ? <>{formatTime(match.endedAt, day.date)}<small>{t('已完赛')}</small></>
                : match.actualStart ? formatTime(estimate(match.actualStart, match), day.date) : '—'}</td>
              <td><span className={`status ${match.endedAt ? 'ended' : short ? 'short' : live ? 'live' : 'pending'}`}>{short ? t(warning.playersShort ? '桌数短缺' : '满额风险') : status}</span>
                {short ? <small className="shortage">{warning.playersShort
                  ? t('当前报名情景可容纳 {limit} 人', { limit: warning.registeredLimit })
                  : t('满额时超出桌段')}<br />{t('建议售票 ≤ {limit}', { limit: warning.salesLimit })}</small> : null}
                <AlternateTable forecast={warning} />
              </td>
              <td><div className="schedule-row-actions">
                {match.endedAt ? <Button kind="danger-outline" icon="trash" onClick={() => deleteMatch(match.id)} aria-label={t('删除子赛事：{name}', { name: match.name })}>{t('删除')}</Button> : null}
                <button className="icon-button more-button" type="button" aria-label={t('查看{name}', { name: match.name })} onClick={() => open(match.id)}><Icon name="more" /></button>
              </div></td>
            </tr>
          })}</tbody>
        </table>
      </div> : <Empty title={day.matches.length ? t('没有未结束的子赛事') : t('还没有子赛事')} description={day.matches.length ? '' : t('添加子赛事以规划开赛时间、售票人数和桌段。')} />}
    </section>
  </>
}

function UserAdmin({ current, logout }) {
  const t = useText()
  const [users, setUsers] = useState([])
  const [loadError, setLoadError] = useState('')
  const [open, setOpen] = useState('')
  useEffect(() => {
    let ignore = false
    api('users').then(data => { if (!ignore) setUsers(data.users) }).catch(error => { if (!ignore) setLoadError(error.message) })
    return () => { ignore = true }
  }, [])
  return <>
    <header className="line page-title"><h1>{t('用户管理')}</h1>
      <div className="actions"><Button onClick={() => setOpen('password')}>{t('修改我的密码')}</Button><Button kind="primary" icon="plus" onClick={() => setOpen('users')}>{t('新建用户')}</Button></div>
    </header>
    <ErrorMessage text={loadError} />
    <div className="panel table-scroll"><table className="schedule-table"><thead><tr><th>{t('用户名')}</th><th>{t('权限')}</th></tr></thead><tbody>
      {users.map(user => <tr key={user.name}><td>{user.name}{user.name === current.name ? t('（当前用户）') : ''}</td><td>{t('管理员')}</td></tr>)}
    </tbody></table></div>
    {open ? <Dialog title={open === 'users' ? t('新建用户') : t('修改我的密码')} close={() => setOpen('')}>
      <AccountForm mode={open} close={() => setOpen('')} save={async values => {
        const result = await api(open, 'POST', values)
        if (open === 'password') logout()
        else setUsers(result.users)
        setOpen('')
      }} />
    </Dialog> : null}
  </>
}

function AccountForm({ mode, save, close }) {
  const t = useText()
  const { submit, busy, error } = useSubmit(save)
  const isNew = mode === 'users'
  return <form onSubmit={e => submit(formObject(e))}>
    <div className="dialog-body">
      {isNew ? <Field label={t('用户名')}><input name="name" required minLength="2" maxLength="32" autoComplete="off" pattern="[A-Za-z0-9_.\-]{2,32}" autoFocus /></Field>
        : <Field label={t('当前密码')}><input name="current" type="password" autoComplete="current-password" required maxLength="128" autoFocus /></Field>}
      <Field label={isNew ? t('密码') : t('新密码')} hint={t('至少 10 个字符')}><input name={isNew ? 'password' : 'next'} type="password" autoComplete="new-password" required minLength="10" maxLength="128" /></Field>
      <ErrorMessage text={error} />
    </div>
    <footer className="dialog-actions"><Button onClick={close}>{t('取消')}</Button><Button type="submit" kind="primary" disabled={busy}>{isNew ? t('创建用户') : t('更新密码')}</Button></footer>
  </form>
}

const operationTitles = { newEvent: '创建赛事', editEvent: '编辑赛事', addDay: '添加比赛日', editDay: '编辑比赛日',
  addMatch: '新建子赛事', editMatch: '编辑子赛事', actualStart: '实际开赛时间', end: '结束赛事',
  correctRound: '更正当前轮次', deleteEvent: '删除赛事', deleteMatch: '删除子赛事' }

function Workspace({ user, logout }) {
  const t = useText()
  const [projects, setProjects] = useState([])
  const [projectId, setProjectId] = useState('')
  const [dayId, setDayId] = useState('')
  const [page, setPage] = useState('events')
  const [modal, setModal] = useState(null)
  const [ready, setReady] = useState(false)
  const [failure, setFailure] = useState('')
  const pollVersion = useRef(0)
  const refresh = useCallback(async () => {
    const ticket = ++pollVersion.current
    try {
      const result = await api('events')
      if (ticket !== pollVersion.current) return
      setProjects(current => result.events.map(event => {
        const stored = current.find(item => item.id === event.id)
        return stored && stored.revision >= event.revision ? stored : event
      }))
      setFailure('')
    } catch (error) {
      if (ticket !== pollVersion.current) return
      if (error.status === 401) logout()
      else setFailure(error.message)
    } finally {
      setReady(true)
    }
  }, [logout])
  useEffect(() => {
    refresh()
    const timer = setInterval(() => { if (!document.hidden) refresh() }, 15000)
    window.addEventListener('focus', refresh)
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh) }
  }, [refresh])

  const project = projects.find(event => event.id === projectId) ?? projects[0]
  const day = project?.days.find(day => day.id === dayId) ?? project?.days.toSorted((a, b) => a.date.localeCompare(b.date))[0]
  const now = page === 'day' && day ? localNow(project.timeZone) : null
  const plans = now ? plansFor(day) : null
  const forecast = now ? forecastsFor(day, plans, now) : null
  const match = day?.matches.find(m => m.id === modal?.matchId)
  const editedProject = projects.find(item => item.id === modal?.projectId)
  const editedDay = editedProject?.days.find(item => item.id === modal?.dayId)
  const displayedPage = !project && ['day', 'venue'].includes(page) ? 'events' : page
  const showModal = modal && (modal.action === 'newEvent' || (editedProject && (!modal.matchId || match) && (modal.action !== 'editDay' || editedDay)))
  const close = () => setModal(null)
  const onLayout = () => { close(); setPage('venue') }
  const choose = (id, next = 'day') => { setProjectId(id); setDayId(''); setPage(next) }
  const open = (action, matchId, target = project) => setModal({ action, matchId, dayId: day?.id, projectId: target?.id, revision: target?.revision })
  function merge(updated) {
    pollVersion.current++
    setProjects(list => list.some(item => item.id === updated.id)
      ? list.map(item => item.id === updated.id && item.revision <= updated.revision ? updated : item)
      : [updated, ...list])
  }
  async function persist(action, values, revision, target = project, matchId = modal?.matchId) {
    const targetDayId = action === 'editDay' || action === 'deleteDay' ? modal?.dayId : day?.id
    try {
      const result = action === 'newEvent' ? await api('events', 'POST', values)
        : await api(`events/${target.id}`, 'PATCH', { ...values, dayId: targetDayId, matchId, action, revision })
      merge(result.event)
      return result.event
    } catch (error) {
      if (error.status === 401) logout()
      if (error.status === 404 || error.status === 409) await refresh()
      throw error
    }
  }
  async function save(values) {
    const { action, matchId, revision } = modal
    const updated = await persist(action, values, revision, editedProject, matchId)
    if (action === 'newEvent') choose(updated.id)
    if (action === 'addDay') setDayId(updated.days.at(-1).id)
    if (matchId && ['editMatch', 'round', 'correctRound', 'actualStart', 'end'].includes(action)) open('detail', matchId, updated)
    else close()
  }
  async function deleteEvent(values) {
    try {
      await api(`events/${editedProject.id}`, 'DELETE', { ...values, revision: modal.revision })
      pollVersion.current++
      setProjects(events => events.filter(event => event.id !== editedProject.id))
      if (projectId === editedProject.id) { setProjectId(''); setDayId('') }
      close()
    } catch (error) {
      if (error.status === 401) logout()
      if (error.status === 404 || error.status === 409) await refresh()
      throw error
    }
  }
  async function deleteDay(values) {
    const updated = await persist('deleteDay', values, modal.revision, editedProject)
    const remaining = updated.days.toSorted((a, b) => a.date.localeCompare(b.date))
    const next = remaining.find(item => item.date > editedDay.date) ?? remaining.at(-1)
    setDayId(next?.id ?? '')
    close()
  }
  function editor() {
    const { action } = modal
    if (action === 'newEvent' || action === 'editEvent') return <EventEditor event={action === 'editEvent' ? editedProject : null} {...{ save, close }}
      onDelete={() => open('deleteEvent', null, editedProject)} />
    if (action === 'deleteEvent') return <DeleteEventEditor event={editedProject} save={deleteEvent} close={() => open('editEvent', null, editedProject)} />
    if (action === 'deleteMatch') return <DeleteMatchEditor {...{ match, save, close }} />
    if (action === 'addDay' || action === 'editDay') return <DayEditor event={editedProject} day={action === 'editDay' ? editedDay : null} {...{ save, close, deleteDay }} />
    if (action === 'addMatch' || action === 'editMatch') return <MatchEditor game={project.game} projectId={project.id} {...{ day, match, now, projects, save, close, onLayout }}
      onDetail={match ? () => open('detail', match.id) : undefined} />
    const next = action => open(action, match.id)
    const plan = plans.get(match.id)
    if (action === 'detail') return <MatchDetail {...{ day, match, plan, onLayout }} open={next} forecast={forecast.get(match.id)}
      savePlan={planChoices => persist('plan', { planChoices }, project.revision)} />
    return <OperationsEditor mode={action} event={project} {...{ day, match, plan, save, onLayout }} close={() => next('detail')} />
  }

  return <Shell {...{ user, project, projects, choose }} page={displayedPage} navigate={setPage} signOut={async () => {
    try { await api('logout', 'POST', {}); logout() } catch (error) {
      if (error.status === 401) logout()
      else setFailure(error.message)
    }
  }}>
    <ErrorMessage text={failure} />
    {!ready ? <p className="muted" role="status">{t('正在加载赛事…')}</p> : null}
    {ready && displayedPage === 'events' ? <EventList events={projects} choose={choose} create={() => open('newEvent')} edit={id => open('editEvent', null, projects.find(project => project.id === id))} /> : null}
    {page === 'users' ? <UserAdmin current={user} logout={logout} /> : null}
    {project && ['day', 'venue'].includes(page) ? <>
      <DayBar {...{ project, day }} onSelect={setDayId} addDay={() => open('addDay')} editDay={() => open('editDay')} />
      {!day ? <Empty title={t('暂时没有比赛日')} description={t('点击「添加比赛日」继续安排赛事。')} />
        : page === 'day' ? <Schedule key={day.id} {...{ day, forecast, plans }} open={id => open('detail', id)} create={() => open('addMatch')}
        deleteMatch={id => open('deleteMatch', id)} />
        : <Venue key={day.id} day={day} days={project.days} revision={project.revision} save={(values, revision) => persist('layout', values, revision)} />}
    </> : null}
    {showModal ? <Dialog key={modal.action} wide={['newEvent', 'detail', 'addMatch', 'editMatch'].includes(modal.action)} close={close}
      title={modal.action === 'detail' ? match.name : modal.action === 'round' ? t('开始第 {n} 轮', { n: currentRound(match) + 1 }) : t(operationTitles[modal.action])}>{editor()}</Dialog> : null}
  </Shell>
}

function App() {
  const t = useText()
  const [user, setUser] = useState(undefined)
  const [error, setError] = useState('')
  const logout = useCallback(() => setUser(null), [])
  function initialize() {
    setError('')
    api('session').then(result => setUser(result.user)).catch(failure => setError(failure.message))
  }
  useEffect(initialize, [])
  if (user === undefined) return <main className="login-shell">
    <div className="panel login-card"><Brand /><LanguageSwitch />{error ? <><ErrorMessage text={error} /><Button onClick={initialize}>{t('重新连接')}</Button></> : <p role="status" className="muted">{t('正在连接…')}</p>}</div>
  </main>
  return user ? <Workspace {...{ user, logout }} /> : <Login onLogin={setUser} />
}

createRoot(document.getElementById('root')).render(<LanguageProvider><App /></LanguageProvider>)
