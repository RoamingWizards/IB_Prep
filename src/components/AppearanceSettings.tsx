import { useState } from "react"
import { AlertTriangle, Check, X } from "lucide-react"
import { GlowButton, Panel } from "@/components/kit"
import { contrastRatio, PRESETS, sameTheme, THEME_KEYS, THEME_LABEL, themeWarnings, type ThemeKey } from "@/lib/theme"
import { useTheme } from "@/lib/themeContext"
import { cn } from "@/lib/utils"

/** A colour as typed: "2fd18b" and "#2FD18B" both mean #2fd18b. Returns null until it is a full six-digit colour. */
function parseTyped(text: string): string | null {
  const t = text.trim().replace(/^#/, "")
  return /^[0-9a-fA-F]{6}$/.test(t) ? `#${t.toLowerCase()}` : null
}

function ColourRow({ id, value, onChange }: { id: ThemeKey; value: string; onChange: (hex: string) => void }) {
  // What is being typed; null means show the saved colour (after a preset, the picker, a valid code or leaving the box).
  const [typed, setTyped] = useState<string | null>(null)
  const draft = typed ?? value
  const invalid = typed !== null && typed.trim() !== "" && typed.replace("#", "").length >= 6 && parseTyped(typed) === null
  return (
    <div className="flex flex-wrap items-center gap-3" data-testid={`colour-row-${id}`}>
      <label htmlFor={`colour-${id}`} className="w-28 text-sm">
        {THEME_LABEL[id]}
      </label>
      <input
        id={`colour-${id}`}
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-14 cursor-pointer rounded-lg border border-white/12 bg-transparent p-1"
        aria-label={`${THEME_LABEL[id]} colour picker`}
        data-testid={`colour-picker-${id}`}
      />
      <input
        type="text"
        value={draft}
        spellCheck={false}
        maxLength={7}
        aria-label={`${THEME_LABEL[id]} colour as a hex code`}
        aria-invalid={invalid || undefined}
        data-testid={`colour-hex-${id}`}
        onChange={(e) => {
          const parsed = parseTyped(e.target.value)
          setTyped(parsed ? null : e.target.value)
          if (parsed) onChange(parsed)
        }}
        onBlur={() => setTyped(null)}
        className="h-10 w-28 rounded-xl border border-white/12 bg-black/25 px-3 font-mono text-sm uppercase outline-none transition-colors hover:border-white/25 focus-visible:ring-2 focus-visible:ring-ring aria-[invalid=true]:border-destructive"
      />
      {invalid && <span className="text-xs text-destructive">Use six hex digits, such as #2fd18b.</span>}
    </div>
  )
}

/** Settings → Appearance: presets and custom colours, applied to the whole app as you choose them. */
export function AppearanceSettings() {
  const { theme, setColour, setTheme, restoreDefaults, isDefault } = useTheme()
  const warnings = themeWarnings(theme)
  const textRatio = contrastRatio(theme.text, theme.background)

  return (
    <Panel className="p-6" id="appearance-settings" data-testid="appearance-settings">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-medium">Appearance</h2>
          <p className="mt-1 text-sm text-muted-foreground">Choose a preset or set your own colours. Changes apply to every screen straight away and are saved on this device.</p>
        </div>
        <GlowButton className="h-10 px-4 text-sm" disabled={isDefault} onClick={restoreDefaults} onMouseUp={(e) => e.currentTarget.blur()} data-testid="restore-theme">
          Restore defaults
        </GlowButton>
      </div>

      <div role="group" aria-label="Theme presets" className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="theme-presets">
        {PRESETS.map((p) => {
          const active = sameTheme(theme, p.theme)
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={active}
              data-preset={p.id}
              onClick={() => setTheme(p.theme)}
              onMouseUp={(e) => e.currentTarget.blur()}
              className={cn(
                "flex items-center justify-between gap-3 rounded-xl border border-white/12 bg-black/20 px-4 py-3 text-left text-sm transition-colors outline-none hover:border-white/30 focus-visible:ring-2 focus-visible:ring-ring",
                active && "border-primary/70 bg-primary/10 shadow-[0_0_24px_-8px_var(--primary)]",
              )}
            >
              <span className="flex items-center gap-2 font-medium">
                {p.name}
                {active && <Check className="size-4 text-primary" aria-label="In use" />}
              </span>
              <span className="flex -space-x-1" aria-hidden>
                {THEME_KEYS.map((k) => (
                  <span key={k} className="size-5 rounded-full border border-white/25" style={{ background: p.theme[k] }} />
                ))}
              </span>
            </button>
          )
        })}
      </div>

      <h3 className="mt-6 text-sm font-medium">Custom colours</h3>
      <div className="mt-3 space-y-3" data-testid="custom-colours">
        {THEME_KEYS.map((k) => (
          <ColourRow key={k} id={k} value={theme[k]} onChange={(hex) => setColour(k, hex)} />
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Correct, incorrect, warning and information colours keep their own fixed colours, so they stay distinct whatever you choose.</p>

      <div className="mt-4 space-y-2" role="status" aria-live="polite" data-testid="theme-warnings">
        {warnings.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-grade-easy" data-testid="contrast-ok">
            <Check className="size-4" aria-hidden />
            Text contrast is good ({textRatio.toFixed(1)}:1 on the background).
          </p>
        ) : (
          warnings.map((w) => (
            <p key={w.id} className="flex items-start gap-2 text-sm text-grade-hard" data-testid="theme-warning" data-warning={w.id}>
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              {w.message}
            </p>
          ))
        )}
      </div>

      <h3 className="mt-6 mb-3 text-sm font-medium">Preview</h3>
      <div className="panel-inset grid gap-4 p-5 sm:grid-cols-[minmax(0,1fr)_auto]" data-testid="theme-preview">
        <div>
          <p className="font-serif text-xl font-semibold">Discounted cash flow</p>
          <p className="mt-1 text-sm">Body text is shown in the text colour.</p>
          <p className="mt-1 text-sm text-muted-foreground">Secondary text is a softer version of it.</p>
          <p className="mt-2 text-sm text-primary">An accent link or selected item</p>
        </div>
        <div className="flex flex-col items-start gap-2">
          <GlowButton tone="blue" solid className="h-9 px-4 text-sm">
            Primary button
          </GlowButton>
          <span className="flex items-center gap-2 text-sm text-grade-easy">
            <Check className="size-4" aria-hidden /> Correct
          </span>
          <span className="flex items-center gap-2 text-sm text-grade-again">
            <X className="size-4" aria-hidden /> Incorrect
          </span>
        </div>
      </div>
    </Panel>
  )
}
