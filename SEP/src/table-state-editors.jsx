import { useState } from 'react'
import { TABLE_STATES, parseTableNumbers } from './planner.mjs'
import { useLanguage, useText } from './language.jsx'
import { Button, Dialog, ErrorMessage, Field, dayLabel, formObject, useSubmit } from './ui.jsx'

export function TableStateEditor({ table, status, save, close }) {
  const t = useText()
  const [kind, setKind] = useState(status?.kind ?? 'free')
  const { submit, busy, error } = useSubmit(save)
  return <Dialog title={t('编辑第 {table} 桌状态', { table })} close={close}>
    <form onSubmit={event => {
      const values = formObject(event)
      const label = values.label?.trim()
      submit(kind === 'free' ? null : { kind, ...(label ? { label } : {}) })
    }}>
      <div className="dialog-body">
        <Field label={t('状态')}><select value={kind} onChange={event => setKind(event.target.value)} autoFocus>
          {Object.entries(TABLE_STATES).map(([key, label]) => <option key={key} value={key}>{t(label)}</option>)}
        </select></Field>
        {kind !== 'free' ? <Field label={t('状态标签（可选）')}><input name="label" defaultValue={status?.label ?? ''} maxLength="100" /></Field> : null}
        <ErrorMessage text={error} />
      </div>
      <footer className="dialog-actions"><Button onClick={close}>{t('取消')}</Button><Button kind="primary" type="submit" disabled={busy}>{t('保存状态')}</Button></footer>
    </form>
  </Dialog>
}

export function BulkStateEditor({ total, save, close }) {
  const t = useText()
  const [invalid, setInvalid] = useState(false)
  const { submit, busy, error } = useSubmit(save)
  return <Dialog title={t('批量设置桌位状态')} close={close}>
    <form onSubmit={event => {
      const release = event.nativeEvent.submitter?.value === 'release'
      const { tables, label: text } = formObject(event)
      let numbers
      try {
        numbers = parseTableNumbers(tables, total)
      } catch {
        setInvalid(true)
        return
      }
      setInvalid(false)
      const label = text.trim()
      submit({ numbers, state: release ? null : { kind: 'unavailable', ...(label ? { label } : {}) } })
    }}>
      <div className="dialog-body">
        <Field label={t('桌号或范围')} hint={t('用逗号分隔单个桌号和范围，例如 1-8,73-78。')}><input name="tables" placeholder="1-8,73-78" required autoFocus onChange={() => setInvalid(false)} /></Field>
        <Field label={t('状态标签（可选）')}><input name="label" placeholder="Calling Top 8" maxLength="100" /></Field>
        <ErrorMessage text={invalid ? t('请输入 1 至 {max} 范围内的有效桌号。', { max: total }) : error} />
      </div>
      <footer className="dialog-actions"><Button onClick={close}>{t('取消')}</Button><Button type="submit" value="release" disabled={busy}>{t('释放这些桌位')}</Button><Button kind="primary" type="submit" value="mark" disabled={busy}>{t('标记为不可用')}</Button></footer>
    </form>
  </Dialog>
}

export function LayoutPicker({ days, apply, close }) {
  const { language, t } = useLanguage()
  return <Dialog title={t('代入已有布局')} close={close}>
    <form onSubmit={event => {
      const { day } = formObject(event)
      apply(days.find(item => item.id === day))
    }}>
      <div className="dialog-body">
        <Field label={t('布局来源日期')}><select name="day" defaultValue={days[0].id} autoFocus>
          {days.map(day => <option key={day.id} value={day.id}>{dayLabel(day.date, language)} · {t('{count} 桌', { count: day.tables })}</option>)}
        </select></Field>
        <p className="small muted">{t('代入分区、桌号位置和桌位状态。保存布局后生效。')}</p>
      </div>
      <footer className="dialog-actions"><Button onClick={close}>{t('取消')}</Button><Button kind="primary" type="submit">{t('代入布局')}</Button></footer>
    </form>
  </Dialog>
}
