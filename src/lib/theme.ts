// Appearance: four user-chosen colours (background, panel, accent, text) and everything derived from them.
// Pure functions with no browser APIs, so Node can check them. The success, error, warning and info colours are
// not part of a theme: they are fixed (with a darker set on light backgrounds) so right and wrong always look
// different whatever accent is chosen.

export interface ColourTheme {
  background: string
  panel: string
  accent: string
  text: string
}

export type ThemeKey = keyof ColourTheme
export const THEME_KEYS: ThemeKey[] = ["background", "panel", "accent", "text"]
export const THEME_LABEL: Record<ThemeKey, string> = { background: "Background", panel: "Panels", accent: "Accent", text: "Text" }

export const DEFAULT_THEME: ColourTheme = { background: "#050c0c", panel: "#0b1615", accent: "#2fd18b", text: "#e8f1ee" }

export interface Preset {
  id: string
  name: string
  theme: ColourTheme
}

export const PRESETS: Preset[] = [
  { id: "emerald", name: "Emerald", theme: DEFAULT_THEME },
  { id: "midnight", name: "Midnight blue", theme: { background: "#070b14", panel: "#0e1626", accent: "#5b9bff", text: "#e6ecf7" } },
  { id: "violet", name: "Violet", theme: { background: "#0a0813", panel: "#131022", accent: "#8b7cf6", text: "#ece9f8" } },
  { id: "amber", name: "Amber", theme: { background: "#0e0b06", panel: "#1a1510", accent: "#e8ac4e", text: "#f3ecdf" } },
  { id: "graphite", name: "Graphite", theme: { background: "#101113", panel: "#1b1d21", accent: "#aab4c8", text: "#eceef2" } },
  { id: "light", name: "Light", theme: { background: "#eef3f1", panel: "#ffffff", accent: "#0b8f62", text: "#13201c" } },
]

// ---- Colour maths ----

export const isHex = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v)

export function hexToRgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
}

const toHex = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, "0")
export const rgbToHex = ([r, g, b]: [number, number, number]) => `#${toHex(r)}${toHex(g)}${toHex(b)}`

/** `t` of the way from `a` to `b`. */
export function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a)
  const [br, bg, bb] = hexToRgb(b)
  return rgbToHex([ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t])
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG contrast ratio, 1 (none) to 21. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** Whichever of near-black or near-white reads better on `background`. */
export function readableOn(background: string): string {
  return contrastRatio(background, "#04130d") >= contrastRatio(background, "#ffffff") ? "#04130d" : "#ffffff"
}

export const isLight = (theme: ColourTheme) => luminance(theme.background) > 0.4

/** Fixed status colours: success, error, warning, info. A set tuned for dark backgrounds and one for light. */
export const STATUS_DARK = { again: "#f0657a", hard: "#e8ac4e", good: "#5b9bff", easy: "#38c98d" }
export const STATUS_LIGHT = { again: "#c8294a", hard: "#a8650b", good: "#1f5fd1", easy: "#0e7f55" }

/** Straight-line distance between two colours (0 to 441), a rough measure of how alike they look. */
export function colourDistance(a: string, b: string): number {
  const [ar, ag, ab] = hexToRgb(a)
  const [br, bg, bb] = hexToRgb(b)
  return Math.hypot(ar - br, ag - bg, ab - bb)
}

// ---- Validation ----

export function sanitizeTheme(raw: unknown): ColourTheme {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  const pick = (k: ThemeKey) => (isHex(r[k]) ? (r[k] as string).toLowerCase() : DEFAULT_THEME[k])
  return { background: pick("background"), panel: pick("panel"), accent: pick("accent"), text: pick("text") }
}

export const sameTheme = (a: ColourTheme, b: ColourTheme) => THEME_KEYS.every((k) => a[k].toLowerCase() === b[k].toLowerCase())

export interface Warning {
  id: string
  message: string
}

/** Problems the learner should know about before keeping a colour choice. Warnings only: nothing is refused. */
export function themeWarnings(t: ColourTheme): Warning[] {
  const out: Warning[] = []
  const text = contrastRatio(t.text, t.background)
  const onPanel = contrastRatio(t.text, t.panel)
  const accent = contrastRatio(t.accent, t.background)
  const onAccent = contrastRatio(readableOn(t.accent), t.accent)
  const panelEdge = contrastRatio(t.panel, t.background)
  if (text < 4.5) out.push({ id: "text-background", message: `Text on the background has a contrast of ${text.toFixed(1)}:1. Aim for at least 4.5:1 so it stays readable.` })
  if (onPanel < 4.5) out.push({ id: "text-panel", message: `Text on panels has a contrast of ${onPanel.toFixed(1)}:1. Aim for at least 4.5:1.` })
  if (accent < 3) out.push({ id: "accent-background", message: `The accent against the background has a contrast of ${accent.toFixed(1)}:1, so selected items and links may be hard to see. Aim for at least 3:1.` })
  if (onAccent < 4.5) out.push({ id: "text-accent", message: `Button text on the accent has a contrast of ${onAccent.toFixed(1)}:1. Choose a lighter or darker accent.` })
  if (panelEdge < 1.04) out.push({ id: "panel-background", message: "Panels are almost the same colour as the background, so cards will not stand out. Make one lighter or darker." })
  const status = isLight(t) ? STATUS_LIGHT : STATUS_DARK
  if (colourDistance(t.accent, status.again) < 80) {
    out.push({ id: "accent-status", message: "The accent is very close to the colour used for incorrect answers, so selected items may look like errors. Incorrect answers keep their own colour either way." })
  }
  return out
}

// ---- CSS variables ----

const triple = (hex: string) => hexToRgb(hex).join(" ")

/** Every CSS variable a theme sets on the page. Derived colours are computed here so contrast stays predictable. */
export function themeVariables(t: ColourTheme): Record<string, string> {
  const light = isLight(t)
  const status = light ? STATUS_LIGHT : STATUS_DARK
  const panelDeep = mix(t.panel, t.background, 0.55)
  const accentText = mix(t.accent, t.text, light ? 0.1 : 0.62)
  return {
    "color-scheme": light ? "light" : "dark",
    "--background": t.background,
    "--foreground": t.text,
    "--card": t.panel,
    "--card-foreground": t.text,
    "--popover": mix(t.panel, t.text, 0.05),
    "--popover-foreground": t.text,
    "--primary": t.accent,
    "--primary-foreground": readableOn(t.accent),
    "--secondary": mix(t.panel, t.text, 0.07),
    "--secondary-foreground": t.text,
    "--muted": mix(t.background, t.panel, 0.6),
    "--muted-foreground": mix(t.text, t.background, 0.4),
    "--accent": mix(t.panel, t.accent, 0.2),
    "--accent-foreground": t.text,
    "--destructive": status.again,
    "--border": `rgb(${triple(t.accent)} / 0.16)`,
    "--input": `rgb(${triple(t.accent)} / 0.2)`,
    "--ring": t.accent,
    "--chart-1": t.accent,
    "--sidebar": mix(t.background, t.panel, 0.4),
    "--sidebar-foreground": t.text,
    "--sidebar-primary": t.accent,
    "--sidebar-primary-foreground": readableOn(t.accent),
    "--sidebar-accent": mix(t.panel, t.accent, 0.2),
    "--sidebar-accent-foreground": t.text,
    "--sidebar-border": `rgb(${triple(t.accent)} / 0.12)`,
    "--sidebar-ring": t.accent,
    "--grade-again": status.again,
    "--grade-hard": status.hard,
    "--grade-good": status.good,
    "--grade-easy": status.easy,
    // Triples so styles can add transparency: rgb(var(--accent-rgb) / 0.3).
    "--again-rgb": triple(status.again),
    "--hard-rgb": triple(status.hard),
    "--good-rgb": triple(status.good),
    "--easy-rgb": triple(status.easy),
    "--panel-deep": panelDeep,
    "--bg-rgb": triple(t.background),
    "--panel-rgb": triple(t.panel),
    "--panel-deep-rgb": triple(panelDeep),
    "--accent-rgb": triple(t.accent),
    "--text-rgb": triple(t.text),
    "--accent-text": accentText,
    "--accent-soft": mix(t.accent, t.background, 0.5),
    // Tailwind's white and black utilities (bg-white/5, border-white/10, bg-black/20) follow the theme: a light wash
    // in the text colour on dark themes and a dark wash on light ones, and a shade in the background colour.
    "--color-white": t.text,
    "--color-black": light ? mix(t.text, t.background, 0.15) : "#000000",
  }
}
