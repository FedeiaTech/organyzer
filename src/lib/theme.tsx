import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type Theme = 'auto' | 'light' | 'dark'
export const THEMES: Theme[] = ['auto', 'light', 'dark']

const STORAGE_KEY = 'organyzer.theme'
const query = () => window.matchMedia('(prefers-color-scheme: dark)')

function initialTheme(): Theme {
  const saved = localStorage.getItem(STORAGE_KEY)
  return saved === 'light' || saved === 'dark' ? saved : 'auto'
}

function apply(theme: Theme) {
  const resolved = theme === 'auto' ? (query().matches ? 'dark' : 'light') : theme
  document.documentElement.dataset.theme = resolved
}

interface ThemeState {
  theme: Theme
  setTheme: (t: Theme) => void
}

const ThemeContext = createContext<ThemeState | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(initialTheme)

  useEffect(() => {
    apply(theme)
    if (theme !== 'auto') return
    const mq = query()
    const onChange = () => apply('auto')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [theme])

  const setTheme = (t: Theme) => {
    if (t === 'auto') localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, t)
    setThemeState(t)
  }

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider')
  return ctx
}
