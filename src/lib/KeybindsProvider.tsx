import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import {
  ACTION_LABEL,
  DEFAULT_BINDINGS,
  eventToCombo,
  findConflict,
  formatCombo,
  loadBindings,
  reservedReason,
  saveBindings,
  type ActionId,
  type Bindings,
} from "./keybinds"
import { KeybindsContext, type KeybindsApi, type SetResult } from "./keybindsContext"

function isTyping(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
}

const ACTIVATION_CODES = new Set(["Space", "Enter", "NumpadEnter"])

export function KeybindsProvider({ children }: { children: ReactNode }) {
  const [bindings, setBindings] = useState<Bindings>({ ...DEFAULT_BINDINGS })
  const bindingsRef = useRef(bindings)
  const handlers = useRef(new Map<ActionId, () => void>())
  const recording = useRef(false)

  useEffect(() => {
    bindingsRef.current = bindings
  }, [bindings])

  useEffect(() => {
    let cancelled = false
    void loadBindings().then((loaded) => {
      if (cancelled) return
      bindingsRef.current = loaded
      setBindings(loaded)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const commit = useCallback((next: Bindings) => {
    bindingsRef.current = next
    setBindings(next)
    void saveBindings(next)
  }, [])

  const setBinding = useCallback(
    (action: ActionId, combo: string): SetResult => {
      const reason = reservedReason(combo)
      if (reason) return { ok: false, reason }
      const other = findConflict(bindingsRef.current, action, combo)
      if (other) {
        return {
          ok: false,
          reason: `${formatCombo(combo)} is already used by "${ACTION_LABEL[other]}". Clear that shortcut first, or choose a different combination.`,
        }
      }
      commit({ ...bindingsRef.current, [action]: combo })
      return { ok: true }
    },
    [commit],
  )

  const clearBinding = useCallback(
    (action: ActionId) => commit({ ...bindingsRef.current, [action]: null }),
    [commit],
  )
  const resetDefaults = useCallback(() => commit({ ...DEFAULT_BINDINGS }), [commit])
  const setRecording = useCallback((value: boolean) => {
    recording.current = value
  }, [])
  const register = useCallback((action: ActionId, fn: () => void) => {
    handlers.current.set(action, fn)
    return () => {
      if (handlers.current.get(action) === fn) handlers.current.delete(action)
    }
  }, [])

  // The single shortcut handler. Capture phase so components can see `defaultPrevented`.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (recording.current || e.repeat || e.isComposing || isTyping(e.target)) return
      const combo = eventToCombo(e)
      if (!combo) return
      const current = bindingsRef.current
      const action = (Object.keys(current) as ActionId[]).find((a) => current[a] === combo)
      const fn = action && handlers.current.get(action)
      if (!fn) return
      // A focused button or link keeps its own Space/Enter activation, so one press can't act twice.
      const plainActivation = ACTIVATION_CODES.has(e.code) && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey
      if (plainActivation && e.target instanceof HTMLElement && e.target.closest("button, a[href], summary")) {
        return
      }
      e.preventDefault()
      fn()
    }
    window.addEventListener("keydown", onKeyDown, true)
    return () => window.removeEventListener("keydown", onKeyDown, true)
  }, [])

  const api = useMemo<KeybindsApi>(
    () => ({
      bindings,
      label: (action) => (bindings[action] ? formatCombo(bindings[action]) : null),
      setBinding,
      clearBinding,
      resetDefaults,
      setRecording,
      register,
    }),
    [bindings, setBinding, clearBinding, resetDefaults, setRecording, register],
  )

  return <KeybindsContext.Provider value={api}>{children}</KeybindsContext.Provider>
}
