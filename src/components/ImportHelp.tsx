import { useEffect, useMemo, useRef, useState } from "react"
import { Check, Copy, Download, HelpCircle, X } from "lucide-react"
import { GlowButton } from "@/components/kit"
import { selectClass } from "@/components/behavioural/fields"
import { useContent } from "@/content/contentContext"
import behaviouralExample from "@/content/examples/behavioural.json"
import conceptsExample from "@/content/examples/concepts.json"
import dealWalksExample from "@/content/examples/deal-walks.json"
import questionsExample from "@/content/examples/questions.json"
import quickMathsExample from "@/content/examples/quick-maths.json"
import scenariosExample from "@/content/examples/scenarios.json"
import threeStatementsExample from "@/content/examples/three-statements.json"
import valuationExample from "@/content/examples/valuation.json"
import { buildInstructions, HELP_MODES, type HelpMode } from "@/lib/importHelp"

const EXAMPLES: Record<HelpMode, unknown> = {
  questions: questionsExample,
  scenarios: scenariosExample,
  "deal-walks": dealWalksExample,
  "three-statements": threeStatementsExample,
  valuation: valuationExample,
  "quick-maths": quickMathsExample,
  behavioural: behaviouralExample,
  concepts: conceptsExample,
}
const exampleText = (mode: HelpMode) => JSON.stringify(EXAMPLES[mode], null, 2)

/** Copies text, falling back to a hidden text area where the clipboard API is unavailable. */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const box = document.createElement("textarea")
    box.value = text
    box.setAttribute("readonly", "")
    box.style.position = "fixed"
    box.style.opacity = "0"
    document.body.append(box)
    box.select()
    const ok = document.execCommand("copy")
    box.remove()
    return ok
  }
}

/** The small "?" button fixed at the bottom right of every screen. */
export function HelpButton({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      onMouseUp={(e) => e.currentTarget.blur()}
      aria-label="Import help: how to prepare a content pack with an LLM"
      aria-expanded={open}
      aria-controls="import-help"
      title="Import help"
      data-testid="help-button"
      className="group fixed right-3.5 bottom-4 z-[60] flex size-10 items-center justify-center rounded-full border border-primary/40 bg-card text-primary shadow-[0_8px_24px_-8px_rgb(0_0_0/0.7)] transition-colors outline-none hover:bg-primary/15 focus-visible:ring-2 focus-visible:ring-ring"
    >
      <HelpCircle className="size-5" aria-hidden />
      <span role="tooltip" className="pointer-events-none absolute right-12 rounded-lg border border-white/10 bg-popover px-2.5 py-1 text-xs whitespace-nowrap text-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
        Import help
      </span>
    </button>
  )
}

/** A dismissible panel explaining how to prepare a compatible content pack with an LLM. */
export function ImportHelpPanel({ onClose }: { onClose: () => void }) {
  const { bank } = useContent()
  const [mode, setMode] = useState<HelpMode>("questions")
  const [copied, setCopied] = useState<"idle" | "copied" | "failed">("idle")
  const closeRef = useRef<HTMLButtonElement>(null)
  const info = HELP_MODES.find((m) => m.id === mode)!

  useEffect(() => {
    closeRef.current?.focus()
  }, [])

  const instructions = useMemo(() => buildInstructions(mode, bank.concepts.map((c) => ({ id: c.id, name: c.name })), exampleText(mode)), [mode, bank.concepts])

  async function copy() {
    setCopied((await copyText(instructions)) ? "copied" : "failed")
    window.setTimeout(() => setCopied("idle"), 2500)
  }

  function download() {
    const blob = new Blob([exampleText(mode) + "\n"], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = info.file
    document.body.append(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden data-testid="help-backdrop" />
      <section
        id="import-help"
        role="dialog"
        aria-label="Import help"
        data-testid="help-panel"
        className="panel thin-scroll fixed right-3.5 bottom-[4.25rem] z-50 max-h-[calc(100vh-6rem)] w-[min(32rem,calc(100vw-1.75rem))] overflow-y-auto p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-medium">Prepare content with an LLM</h2>
            <p className="mt-1 text-sm text-muted-foreground">Have a chat assistant write a content pack for the mode you choose, then import it.</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close import help"
            data-testid="help-close"
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors outline-none hover:bg-white/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <div className="mt-4">
          <label htmlFor="help-mode" className="mb-1.5 block text-sm text-muted-foreground">
            Mode
          </label>
          <select id="help-mode" className={selectClass} value={mode} onChange={(e) => setMode(e.target.value as HelpMode)} data-testid="help-mode">
            {HELP_MODES.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-muted-foreground" data-testid="help-collections">
            Fills: {info.collections}
          </p>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <GlowButton tone="blue" solid className="h-10 gap-2 px-4 text-sm" onClick={() => void copy()} data-testid="help-copy">
            {copied === "copied" ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
            Copy LLM instructions
          </GlowButton>
          <GlowButton className="h-10 gap-2 px-4 text-sm" onClick={download} data-testid="help-download">
            <Download className="size-4" aria-hidden />
            Download example JSON
          </GlowButton>
        </div>
        <p role="status" aria-live="polite" className="mt-2 min-h-5 text-sm text-muted-foreground" data-testid="help-copy-status">
          {copied === "copied" ? `Copied ${instructions.length.toLocaleString()} characters. Paste them into your assistant.` : copied === "failed" ? "Copying was blocked by the browser. Use Download example JSON, or select the text in the preview below." : ""}
        </p>

        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed" data-testid="help-steps">
          <li>
            Choose the mode, press <strong>Copy LLM instructions</strong> and paste them into a chat assistant. Replace the last line with the topic you want.
          </li>
          <li>
            The instructions contain the format for that mode, a valid example, and the concept IDs that already exist, so the assistant can reference them without inventing any. They ask for plain JSON with no Markdown fences.
          </li>
          <li>
            Save the reply as a file ending in <code className="rounded bg-white/10 px-1">.json</code>.
          </li>
          <li>
            Open <strong>Settings → Content → Import pack</strong> and choose the file. Read the <strong>preview</strong>: it lists what will be added and what will update existing items. Nothing is stored until you confirm.
          </li>
          <li>
            If the app lists validation errors, paste the whole list back to the assistant and ask for the complete corrected JSON. You can also check a file with <code className="rounded bg-white/10 px-1">npm run validate-content -- file.json</code>.
          </li>
        </ol>
        <p className="mt-3 rounded-xl border border-primary/25 bg-primary/[0.06] p-3 text-sm" data-testid="help-merge-note">
          Imports <strong>merge by ID</strong>: a new ID adds an item, and an ID that already exists <strong>updates (replaces) that item</strong>. Nothing is deleted, collections you leave out are untouched, and your progress is never changed.
        </p>

        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-muted-foreground select-none">Preview the instructions that will be copied</summary>
          <pre className="thin-scroll mt-2 max-h-56 overflow-auto rounded-xl bg-black/30 p-3 text-xs leading-relaxed whitespace-pre-wrap" data-testid="help-preview">
            {instructions}
          </pre>
        </details>
      </section>
    </>
  )
}
