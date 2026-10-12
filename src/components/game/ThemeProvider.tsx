import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react'
import { useSecureStorage } from '@/hooks/useSecureStorage'

export type UiTheme = 'light' | 'dark'
export const UI_THEME_STORAGE_KEY = 'poke-hunt:ui-theme:v1'
const ThemeContext = createContext<{ theme: UiTheme; setTheme: (theme: UiTheme) => void } | null>(null)

/** Só altera tokens CSS. Canvas, partida e árvore de menus não são recriados. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const { getItem, setItem } = useSecureStorage()
  const [theme, setTheme] = useState<UiTheme>(() => getItem(UI_THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark')

  useLayoutEffect(() => {
    const root = document.documentElement
    root.dataset.uiTheme = theme
    root.classList.toggle('dark', theme === 'dark')
    root.style.colorScheme = theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#101218' : '#faf7ef')
  }, [theme])

  useEffect(() => { setItem(UI_THEME_STORAGE_KEY, theme) }, [theme, setItem])
  const value = useMemo(() => ({ theme, setTheme }), [theme])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useUiTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useUiTheme requer ThemeProvider')
  return context
}
