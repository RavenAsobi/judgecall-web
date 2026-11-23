import { useState } from 'react'
import { TABLE_STATES, allocateTables, stateSignature } from './planner.mjs'
import { useText } from './language.jsx'
import { Button, Dialog } from './ui.jsx'

export function useTableReview(day) {
  const [task, setTask] = useState(null)
  function advance(next) {
    const result = allocateTables(day, next.first, next.count, next.choices, 'ask')
    if (result.warning) {
      setTask({ ...next, warning: result.warning })
      return
    }
    setTask(null)
    next.finish(result, next.choices)
  }
  return {
    warning: task?.warning,
    start: (first, count, choices, finish) => advance({ first, count, choices, finish }),
    clear: () => setTask(null),
    choose(choice, wholeGroup = false) {
      const { table, state, through } = task.warning
      const choices = { ...task.choices }
      const decision = { choice, state: stateSignature(state) }
      const last = wholeGroup ? through ?? table : table
      for (let number = table; number <= last; number++) choices[number] = decision
      advance({ ...task, choices })
    },
  }
}

export function tableStateName(t, state) {
  const name = t(TABLE_STATES[state?.kind ?? 'free'])
  return state?.label ? `${name} · ${state.label}` : name
}

export function TableReview({ review, onLayout, onDetail }) {
  const t = useText()
  if (!review.warning) return null
  const { table, state, through } = review.warning
  const name = tableStateName(t, state)
  const title = through
    ? t('{first}–{last} 号桌状态为{state}', { first: table, last: through, state: name })
    : t('{table}号桌状态为{state}', { table, state: name })
  return <Dialog title={title} close={review.clear}>
    <div className="dialog-body review-actions">
      <Button kind="primary" onClick={() => review.choose('skip')}>{t('跳过此桌继续排号')}</Button>
      <Button onClick={() => review.choose('include')}>{t('包含此桌继续排号')}</Button>
      {through ? <>
        <Button onClick={() => review.choose('skip', true)}>{t('跳过这组桌位')}</Button>
        <Button onClick={() => review.choose('include', true)}>{t('包含这组桌位')}</Button>
      </> : null}
      <Button onClick={() => { review.clear(); onLayout() }}>{t('返回布局')}</Button>
      <Button onClick={() => { review.clear(); onDetail?.() }}>{t('返回赛事详情')}</Button>
    </div>
  </Dialog>
}
