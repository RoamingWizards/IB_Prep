// Keyboard shortcut model: actions, defaults, combo encoding, display and reserved-combo checks.
// Combos are stored as "Ctrl+Alt+Shift+Meta+<KeyboardEvent.code>", e.g. "Shift+KeyK", "Space".
// Using `code` keeps bindings tied to physical keys, so they don't change with the keyboard layout.

import { getMeta, setMeta, type Rating } from "./db"

export type ChoiceActionId = "choiceA" | "choiceB" | "choiceC" | "choiceD" | "choiceE"
export type ActionId = "flip" | "again" | "hard" | "good" | "easy" | "collapseMenu" | ChoiceActionId | "choiceContinue"

/** Multiple-choice options by position, so a question's first option is always "Choose option A". */
export const CHOICE_ACTIONS: ChoiceActionId[] = ["choiceA", "choiceB", "choiceC", "choiceD", "choiceE"]

export interface ActionDef {
  id: ActionId
  label: string
  description: string
}

export const ACTIONS: ActionDef[] = [
  { id: "flip", label: "Flip card", description: "Show the answer, or go back to the question" },
  { id: "again", label: "Rate Again", description: "Only while the answer is showing" },
  { id: "hard", label: "Rate Hard", description: "Only while the answer is showing" },
  { id: "good", label: "Rate Good", description: "Only while the answer is showing" },
  { id: "easy", label: "Rate Easy", description: "Only while the answer is showing" },
  { id: "collapseMenu", label: "Collapse menu", description: "Collapse the floating mode menu" },
  ...CHOICE_ACTIONS.map((id, i) => ({
    id,
    label: `Choose option ${String.fromCharCode(65 + i)}`,
    description: "Deal Walks: pick this option before submitting",
  })),
  { id: "choiceContinue", label: "Submit / next stage", description: "Deal Walks: submit the chosen option, then go to the next stage" },
]

export const ACTION_LABEL = Object.fromEntries(ACTIONS.map((a) => [a.id, a.label])) as Record<ActionId, string>

export type Bindings = Record<ActionId, string | null>

export const DEFAULT_BINDINGS: Record<ActionId, string> = {
  flip: "Space",
  again: "Digit1",
  hard: "Digit2",
  good: "Digit3",
  easy: "Digit4",
  collapseMenu: "Escape",
  choiceA: "KeyA",
  choiceB: "KeyB",
  choiceC: "KeyC",
  choiceD: "KeyD",
  choiceE: "KeyE",
  choiceContinue: "Enter",
}

export const RATING_ACTION: Record<Rating, ActionId> = {
  again: "again",
  hard: "hard",
  good: "good",
  easy: "easy",
}

export const isMac =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)

// ---- Events -> combos ----

const MODIFIER_CODES = new Set([
  "ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight", "AltLeft", "AltRight",
  "MetaLeft", "MetaRight", "OSLeft", "OSRight", "CapsLock", "Fn",
])

/** Number-pad digits count as the matching top-row digits. */
function normaliseCode(code: string) {
  const m = /^Numpad([0-9])$/.exec(code)
  return m ? `Digit${m[1]}` : code
}

/** Returns null while only modifier keys are held. */
export function eventToCombo(e: KeyboardEvent): string | null {
  if (!e.code || MODIFIER_CODES.has(e.code)) return null
  const mods: string[] = []
  if (e.ctrlKey) mods.push("Ctrl")
  if (e.altKey) mods.push("Alt")
  if (e.shiftKey) mods.push("Shift")
  if (e.metaKey) mods.push("Meta")
  return [...mods, normaliseCode(e.code)].join("+")
}

export function isValidCombo(value: unknown): value is string {
  return typeof value === "string" && /^((Ctrl|Alt|Shift|Meta)\+){0,4}[A-Za-z0-9]+$/.test(value)
}

// ---- Display ----

const KEY_NAMES: Record<string, string> = {
  Space: "Space", Escape: "Esc", Enter: isMac ? "Return" : "Enter", NumpadEnter: "Enter",
  Backspace: isMac ? "⌫" : "Backspace", Delete: isMac ? "⌦" : "Delete", Tab: "Tab",
  ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→",
  Minus: "-", Equal: "=", Comma: ",", Period: ".", Slash: "/", Semicolon: ";",
  Quote: "'", BracketLeft: "[", BracketRight: "]", Backslash: "\\", Backquote: "`",
  PageUp: "Page Up", PageDown: "Page Down", Home: "Home", End: "End",
}

function keyName(code: string) {
  if (KEY_NAMES[code]) return KEY_NAMES[code]
  const key = /^Key([A-Z])$/.exec(code) ?? /^Digit([0-9])$/.exec(code)
  return key ? key[1] : code
}

const MAC_MODS: Record<string, string> = { Ctrl: "⌃", Alt: "⌥", Shift: "⇧", Meta: "⌘" }
const PC_MODS: Record<string, string> = { Ctrl: "Ctrl", Alt: "Alt", Shift: "Shift", Meta: "Win" }

export function formatCombo(combo: string, mac = isMac): string {
  const parts = combo.split("+")
  const code = parts[parts.length - 1]
  const mods = parts.slice(0, -1).map((m) => (mac ? MAC_MODS : PC_MODS)[m])
  return mac ? [...mods, keyName(code)].join("") : [...mods, keyName(code)].join("+")
}

// ---- Reserved combinations ----
// Browsers and the OS act on these before (or instead of) the page, so they can't be relied on.

const MAC_CMD_RESERVED = new Set([
  "KeyQ", "KeyW", "KeyT", "KeyN", "KeyL", "KeyR", "KeyM", "KeyH", "KeyF", "KeyP", "KeyS", "KeyO",
  "KeyA", "KeyC", "KeyV", "KeyX", "KeyZ", "KeyY", "Digit0", "Digit1", "Digit2", "Digit3", "Digit4",
  "Digit5", "Digit6", "Digit7", "Digit8", "Digit9", "Tab", "Space", "Comma", "BracketLeft",
  "BracketRight", "ArrowLeft", "ArrowRight", "Backquote", "Minus", "Equal",
])
const PC_CTRL_RESERVED = new Set([
  "KeyW", "KeyT", "KeyN", "KeyQ", "KeyL", "KeyR", "KeyF", "KeyP", "KeyS", "KeyO", "KeyA", "KeyC",
  "KeyV", "KeyX", "KeyZ", "KeyY", "Tab", "PageUp", "PageDown", "F4", "Digit1", "Digit2", "Digit3",
  "Digit4", "Digit5", "Digit6", "Digit7", "Digit8", "Digit9",
])

/** Explains why a combo can't be assigned, or returns null if it is allowed. */
export function reservedReason(combo: string, mac = isMac): string | null {
  const parts = combo.split("+")
  const code = parts[parts.length - 1]
  const mods = new Set(parts.slice(0, -1))
  const who = mac ? "macOS or the browser" : "the browser or operating system"
  const reserved = (why: string) => `${formatCombo(combo, mac)} is ${why} and can't be assigned.`

  if (code === "Tab") return reserved("used for moving keyboard focus and switching tabs or apps")
  if (/^F(5|11|12)$/.test(code)) return reserved(`reserved by ${who}`)
  if (mac) {
    if (mods.has("Meta") && (MAC_CMD_RESERVED.has(code) || (mods.has("Alt") && code === "Escape"))) {
      return reserved(`reserved by ${who}`)
    }
    if (mods.has("Ctrl") && (code === "Space" || /^Arrow/.test(code))) {
      return reserved(`reserved by ${who}`)
    }
  } else {
    if (mods.has("Meta")) return reserved("a Windows key combination reserved by the operating system")
    if (mods.has("Ctrl") && PC_CTRL_RESERVED.has(code)) return reserved(`reserved by ${who}`)
    if (mods.has("Alt") && ["F4", "ArrowLeft", "ArrowRight", "Space"].includes(code)) {
      return reserved(`reserved by ${who}`)
    }
    if (mods.has("Ctrl") && mods.has("Alt") && code === "Delete") return reserved(`reserved by ${who}`)
  }
  return null
}

// ---- Conflicts ----

export function findConflict(bindings: Bindings, action: ActionId, combo: string): ActionId | null {
  for (const def of ACTIONS) {
    if (def.id !== action && bindings[def.id] === combo) return def.id
  }
  return null
}

// ---- Persistence (IndexedDB meta store, alongside saved progress) ----

/** Repairs stored data: drops invalid, reserved or duplicate entries; fills gaps with defaults. */
export function sanitizeBindings(raw: unknown): Bindings {
  const stored = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  const out = {} as Bindings
  const used = new Set<string>()
  const pending: ActionDef[] = []

  for (const def of ACTIONS) {
    const v = stored[def.id]
    if (v === null) out[def.id] = null
    else if (isValidCombo(v) && !reservedReason(v) && !used.has(v)) {
      out[def.id] = v
      used.add(v)
    } else pending.push(def)
  }
  for (const def of pending) {
    const d = DEFAULT_BINDINGS[def.id]
    const wasInvalid = def.id in stored && stored[def.id] !== undefined
    out[def.id] = !wasInvalid && !used.has(d) ? d : null
    if (out[def.id]) used.add(d)
  }
  return out
}

export async function loadBindings(): Promise<Bindings> {
  try {
    return sanitizeBindings(await getMeta<unknown>("keybinds"))
  } catch {
    return { ...DEFAULT_BINDINGS }
  }
}

export function saveBindings(bindings: Bindings) {
  return setMeta("keybinds", bindings)
}
