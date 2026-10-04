import { useEffect, useRef, useState } from "react"
import { X } from "lucide-react"
import { AppearanceSettings } from "@/components/AppearanceSettings"
import { ContentSettings } from "@/components/ContentSettings"
import { PrivacyData } from "@/components/PrivacyData"
import { PrivacyNotice } from "@/components/PrivacyNotice"
import { GlowButton, Panel } from "@/components/kit"
import { ACTIONS, DEFAULT_BINDINGS, eventToCombo, isMac, type ActionDef } from "@/lib/keybinds"
import { useKeybinds } from "@/lib/keybindsContext"
import { cn } from "@/lib/utils"

function KeybindRow({ action }: { action: ActionDef }) {
  const { label, setBinding, clearBinding, setRecording } = useKeybinds()
  const [active, setActive] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const suppressKeyUp = useRef<string | null>(null)
  const current = label(action.id)

  // While recording: every key is captured here and none reach the study shortcuts.
  useEffect(() => {
    if (!active) return
    setRecording(true)

    function onKeyDown(e: KeyboardEvent) {
      // Plain Tab keeps moving focus (which also cancels recording).
      if (e.key === "Tab" && !e.ctrlKey && !e.altKey && !e.metaKey) return
      e.preventDefault()
      e.stopPropagation()
      if (e.repeat) return
      const combo = eventToCombo(e)
      if (!combo) return // only modifiers held so far
      const result = setBinding(action.id, combo)
      if (result.ok) {
        suppressKeyUp.current = e.code // stop the key's release from re-activating the field
        setError(null)
        setActive(false)
      } else {
        setError(result.reason)
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      e.preventDefault()
      e.stopPropagation()
    }
    window.addEventListener("keydown", onKeyDown, true)
    window.addEventListener("keyup", onKeyUp, true)
    return () => {
      window.removeEventListener("keydown", onKeyDown, true)
      window.removeEventListener("keyup", onKeyUp, true)
      setRecording(false)
    }
  }, [active, action.id, setBinding, setRecording])

  return (
    <li className="py-4">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <p className="text-[0.9375rem] font-medium">{action.label}</p>
          <p className="text-sm text-muted-foreground">{action.description}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label={`Shortcut for ${action.label}: ${current ?? "not set"}. Activate to record a new one.`}
            data-testid={`keybind-${action.id}`}
            onClick={() => {
              setError(null)
              setActive(true)
            }}
            onKeyUp={(e) => {
              // The release of the key just assigned must not re-open recording.
              if (suppressKeyUp.current === e.code) {
                e.preventDefault()
                suppressKeyUp.current = null
              }
            }}
            onBlur={() => {
              setActive(false)
              setError(null)
            }}
            className={cn(
              "h-10 min-w-40 rounded-xl border border-white/12 bg-black/20 px-4 text-sm transition-colors outline-none hover:border-white/25 focus-visible:ring-2 focus-visible:ring-ring",
              active && "border-primary/70 bg-primary/10 text-[var(--accent-text)] shadow-[0_0_24px_-8px_var(--primary)]",
              !active && !current && "text-muted-foreground",
            )}
          >
            {active ? "Press keys…" : (current ?? "Not set")}
          </button>
          <GlowButton
            className="size-10"
            aria-label={`Clear shortcut for ${action.label}`}
            disabled={!current}
            onClick={() => clearBinding(action.id)}
            onMouseUp={(e) => e.currentTarget.blur()}
          >
            <X className="size-4" aria-hidden />
          </GlowButton>
        </div>
      </div>
      {active && !error && (
        <p className="mt-2 text-sm text-muted-foreground">
          Press the combination you want. Click elsewhere to cancel.
        </p>
      )}
      {error && (
        <p role="alert" data-testid={`keybind-error-${action.id}`} className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </li>
  )
}

export function SettingsView() {
  const { bindings, resetDefaults } = useKeybinds()
  const isDefault = ACTIONS.every((a) => bindings[a.id] === DEFAULT_BINDINGS[a.id])

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <h1 className="font-serif text-2xl font-semibold">Settings</h1>
      <nav aria-label="Settings sections" className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground" data-testid="settings-nav">
        {[["Appearance", "appearance-settings"], ["Keybinds", "keybinds"], ["Content", "content-settings"], ["Privacy & Data", "privacy-data"], ["Privacy notice", "privacy-notice"]].map(([label, id]) => (
          <a key={id} href={`#${id}`} onClick={(e) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }) }} className="underline decoration-white/20 underline-offset-2 hover:text-foreground">
            {label}
          </a>
        ))}
      </nav>

      <AppearanceSettings />

      <Panel className="p-6" id="keybinds">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-medium">Keybinds</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Click a shortcut, then press the keys you want to use. Modifier keys work too.
            </p>
          </div>
          <GlowButton
            className="h-10 px-4 text-sm"
            disabled={isDefault}
            onClick={resetDefaults}
            onMouseUp={(e) => e.currentTarget.blur()}
          >
            Restore defaults
          </GlowButton>
        </div>

        <ul className="mt-4 divide-y divide-white/[0.06]">
          {ACTIONS.map((a) => (
            <KeybindRow key={a.id} action={a} />
          ))}
        </ul>

        <p className="mt-4 border-t border-white/[0.06] pt-4 text-sm text-muted-foreground">
          {isMac ? "macOS and the browser" : "The browser and operating system"} handle some combinations before
          this app sees them, such as {isMac ? "⌘Q, ⌘W, ⌘T, ⌘Tab and ⌘Space" : "Ctrl+W, Ctrl+T, Alt+F4 and Alt+Tab"}.
          Those can't be assigned, and the app will say so. Shortcuts don't run while you type in a text field or
          record a new one.
        </p>
      </Panel>

      <ContentSettings />

      <PrivacyData />

      <PrivacyNotice />
    </div>
  )
}
