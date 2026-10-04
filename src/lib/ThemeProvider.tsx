import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { getMeta, setMeta } from "./db"
import { DEFAULT_THEME, sameTheme, sanitizeTheme, type ColourTheme, type ThemeKey } from "./theme"
import { applyTheme, readStoredTheme, THEME_STORAGE_KEY } from "./themeApply"
import { ThemeContext, type ThemeApi } from "./themeContext"

const SAVE_DELAY_MS = 250

/** Keeps the chosen colours, applies them live, and saves them locally (IndexedDB, plus a copy for a flash-free first paint). */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ColourTheme>(() => readStoredTheme())
  const timer = useRef(0)
  const latest = useRef(theme)

  useEffect(() => {
    latest.current = theme
    applyTheme(theme)
  }, [theme])

  // The IndexedDB copy is authoritative if it exists; the localStorage copy only avoids a flash on load.
  useEffect(() => {
    let cancelled = false
    getMeta<unknown>("theme")
      .then((saved) => {
        if (cancelled || saved === undefined) return
        const next = sanitizeTheme(saved)
        if (!sameTheme(next, latest.current)) setThemeState(next)
      })
      .catch((err) => console.error("Could not read the saved theme", err))
    return () => {
      cancelled = true
    }
  }, [])

  const persist = useCallback((next: ColourTheme) => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(next))
      } catch {
        /* storage may be unavailable; IndexedDB still holds it */
      }
      void setMeta("theme", next).catch((err) => console.error("Could not save the theme", err))
    }, SAVE_DELAY_MS)
  }, [])

  const setTheme = useCallback(
    (next: ColourTheme) => {
      setThemeState(next)
      persist(next)
    },
    [persist],
  )
  const setColour = useCallback(
    (key: ThemeKey, hex: string) => setTheme({ ...latest.current, [key]: hex.toLowerCase() }),
    [setTheme],
  )
  const restoreDefaults = useCallback(() => setTheme(DEFAULT_THEME), [setTheme])

  const api = useMemo<ThemeApi>(
    () => ({ theme, setColour, setTheme, restoreDefaults, isDefault: sameTheme(theme, DEFAULT_THEME) }),
    [theme, setColour, setTheme, restoreDefaults],
  )
  return <ThemeContext.Provider value={api}>{children}</ThemeContext.Provider>
}
