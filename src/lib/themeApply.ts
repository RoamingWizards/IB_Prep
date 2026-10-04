import { DEFAULT_THEME, sanitizeTheme, themeVariables, type ColourTheme } from "./theme"

export const THEME_STORAGE_KEY = "ib-prep-theme"

/** Writes a theme's variables onto the page so every screen, graph and statement follows it immediately. */
export function applyTheme(theme: ColourTheme) {
  const root = document.documentElement
  for (const [name, value] of Object.entries(themeVariables(theme))) {
    if (name === "color-scheme") root.style.colorScheme = value
    else root.style.setProperty(name, value)
  }
}

/** The theme last saved in this browser, read synchronously so the first paint already uses it. */
export function readStoredTheme(): ColourTheme {
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY)
    return raw ? sanitizeTheme(JSON.parse(raw)) : DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}

