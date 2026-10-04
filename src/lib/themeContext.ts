import { createContext, useContext } from "react"
import type { ColourTheme, ThemeKey } from "./theme"

export interface ThemeApi {
  theme: ColourTheme
  /** Change one colour. Applied to the whole app at once and saved. */
  setColour: (key: ThemeKey, hex: string) => void
  /** Replace all four colours (a preset). */
  setTheme: (theme: ColourTheme) => void
  restoreDefaults: () => void
  isDefault: boolean
}

export const ThemeContext = createContext<ThemeApi | null>(null)

export function useTheme(): ThemeApi {
  const api = useContext(ThemeContext)
  if (!api) throw new Error("useTheme must be used inside ThemeProvider")
  return api
}
