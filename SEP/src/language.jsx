import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { translate } from './i18n.mjs'

const storageKey = 'sep-language'
const Language = createContext(null)

export function currentLanguage() {
  try {
    return localStorage.getItem(storageKey) === 'en' ? 'en' : 'zh'
  } catch {
    return document.documentElement.lang === 'en' ? 'en' : 'zh'
  }
}

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(currentLanguage)
  const value = useMemo(() => ({ language, setLanguage, t: (key, values) => translate(language, key, values) }), [language])
  useEffect(() => {
    document.documentElement.lang = language === 'en' ? 'en' : 'zh-Hans'
    document.title = language === 'en' ? 'Scheduled Event Planner · SEP' : '外围赛事规划器 · Scheduled Event Planner'
    try { localStorage.setItem(storageKey, language) } catch { /* Language remains available for this page. */ }
  }, [language])
  return <Language.Provider value={value}>{children}</Language.Provider>
}

export const useLanguage = () => useContext(Language)
export const useText = () => useLanguage().t

export function LanguageSwitch() {
  const { language, setLanguage } = useLanguage()
  return <div className="language-switch" role="group" aria-label={language === 'en' ? 'Language' : '语言'}>
    <button type="button" lang="zh-Hans" aria-pressed={language === 'zh'} onClick={() => setLanguage('zh')}>中文</button>
    <button type="button" lang="en" aria-pressed={language === 'en'} onClick={() => setLanguage('en')}>English</button>
  </div>
}
