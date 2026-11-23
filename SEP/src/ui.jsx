import { useEffect, useId, useRef, useState } from 'react'
import { useLanguage, useText } from './language.jsx'
import sepLogo from './sep-logo.png'

const paths = {
  calendar: 'M8 2v4m8-4v4M3 9h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Z',
  grid: 'M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm11 0h7v7h-7z',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2m12-13a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m13-16a4 4 0 0 1 0 7m7 9v-2a4 4 0 0 0-3-4M13 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  table: 'M3 7h18v4H3zm2 4v9m14-9v9M5 16h14',
  chair: 'M6 13V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v7M4 13h16v4H4zm1 4v4m14-4v4',
  layers: 'm12 3 9 5-9 5-9-5zm-9 9 9 5 9-5M3 16l9 5 9-5',
  plus: 'M12 4v16M4 12h16',
  close: 'm6 6 12 12M18 6 6 18',
  edit: 'm14 5 5 5M4 20l5-1L21 7l-5-5L4 14z',
  chevron: 'm6 9 6 6 6-6',
  more: 'M4 12h.02M12 12h.02M20 12h.02',
  warning: 'M12 8v5m0 3h.02M12 3 2 21h20L12 3Z',
  check: 'm4 12 5 5L20 6',
  exit: 'M10 3H4v18h6m4-14 5 5-5 5m5-5H9',
  clock: 'M12 7v5l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  reset: 'M4 12a8 8 0 1 1 2.5 5.8M4 5v7h7',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5m4-5v5',
}

export function Icon({ name, size = 19 }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={name === 'more' ? 3 : 1.7} strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} /></svg>
}

export function Button({ icon, kind = 'secondary', children, type = 'button', ...props }) {
  return <button type={type} className={`button ${kind}`} {...props}>{icon ? <Icon name={icon} size={17} /> : null}{children}</button>
}

export function Brand() {
  const { language } = useLanguage()
  return <div className="brand"><img className="brand-mark" src={sepLogo} alt="" width="42" height="42" />
    {language === 'en' ? <span>Scheduled Event Planner<small>SEP</small></span> : <span>外围赛事规划器<small lang="en">Scheduled Event Planner</small></span>}
  </div>
}

export function Field({ label, children, hint }) {
  return <label className="field"><span>{label}</span>{children}{hint ? <small>{hint}</small> : null}</label>
}

export function ErrorMessage({ text }) {
  return text ? <div className="error-message" role="alert"><Icon name="warning" size={16} />{text}</div> : null
}

export function Empty({ icon = 'calendar', title, description, children }) {
  return <div className="empty"><div className="empty-icon"><Icon name={icon} size={28} /></div><h2>{title}</h2>{description ? <p>{description}</p> : null}{children}</div>
}

export function Dialog({ title, children, close, wide = false }) {
  const t = useText()
  const titleId = useId()
  const ref = useRef(null)
  useEffect(() => {
    const dialog = ref.current
    dialog.showModal()
    return () => dialog.close()
  }, [])
  return <dialog className={wide ? 'dialog wide' : 'dialog'} ref={ref} aria-labelledby={titleId} onCancel={event => { event.preventDefault(); event.stopPropagation(); close() }}>
    <header className="dialog-head"><h2 id={titleId}>{title}</h2><button className="icon-button" type="button" aria-label={t('关闭')} onClick={close}><Icon name="close" /></button></header>
    {children}
  </dialog>
}

export function useSubmit(action) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(value) {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await action(value)
    } catch (failure) {
      setError(failure.message)
    } finally {
      setBusy(false)
    }
  }
  return { submit, busy, error }
}

export function formObject(event) {
  event.preventDefault()
  return Object.fromEntries(new FormData(event.currentTarget))
}

export const dayLabel = (date, language) => new Intl.DateTimeFormat(language === 'en' ? 'en-US' : 'zh-CN', {
  month: language === 'en' ? 'short' : 'numeric', day: 'numeric', weekday: 'short', timeZone: 'UTC',
})
  .format(new Date(date))
