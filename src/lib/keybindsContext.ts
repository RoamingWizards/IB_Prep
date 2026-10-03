import { createContext, useContext, useEffect, useRef } from "react"
import type { ActionId, Bindings } from "./keybinds"

export type SetResult = { ok: true } | { ok: false; reason: string }

export interface KeybindsApi {
  bindings: Bindings
  /** Display text for an action's current shortcut, or null if it has none. */
  label: (action: ActionId) => string | null
  setBinding: (action: ActionId, combo: string) => SetResult
  clearBinding: (action: ActionId) => void
  resetDefaults: () => void
  /** While true the shared handler ignores all keys (used when recording a binding). */
  setRecording: (recording: boolean) => void
  register: (action: ActionId, fn: () => void) => () => void
}

export const KeybindsContext = createContext<KeybindsApi | null>(null)

export function useKeybinds(): KeybindsApi {
  const api = useContext(KeybindsContext)
  if (!api) throw new Error("useKeybinds must be used inside KeybindsProvider")
  return api
}

/**
 * Attach handlers to actions. The one shared listener in KeybindsProvider decides
 * which key triggers which action using the user's current bindings.
 */
export function useShortcutHandlers(handlers: Partial<Record<ActionId, () => void>>) {
  const { register } = useKeybinds()
  const latest = useRef(handlers)
  useEffect(() => {
    latest.current = handlers
  })
  useEffect(() => {
    const offs = (Object.keys(latest.current) as ActionId[]).map((action) =>
      register(action, () => latest.current[action]?.()),
    )
    return () => offs.forEach((off) => off())
  }, [register])
}
