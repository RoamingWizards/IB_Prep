import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { GlowButton, Panel } from "@/components/kit"
import { QuickMathRunner } from "@/components/QuickMathRunner"
import { QuickMathStats } from "@/components/QuickMathStats"
import { useContent } from "@/content/contentContext"
import type { Difficulty } from "@/content/types"
import {
  abandonQuickMathSession,
  getMeta,
  getQuickMathResults,
  getQuickMathSession,
  getQuickMathSessions,
  setMeta,
  startQuickMathSession,
  type QuickMathResult,
  type QuickMathSession,
} from "@/lib/db"
import {
  buildSession,
  capacity,
  categoriesFor,
  DEFAULT_SELECTION,
  DIFFICULTIES,
  QUICK_MATH_SELECTION_KEY,
  SESSION_LENGTHS,
  type Mode,
  type Selection,
  type SessionLength,
} from "@/lib/quickMath"
import { DIFFICULTY_LABEL } from "@/lib/quickMathGen"
import { cn } from "@/lib/utils"

const CURRENT_KEY = "quickMath:current"

const selectClass =
  "h-10 w-full rounded-xl border border-white/12 bg-black/20 px-3 text-sm outline-none transition-colors hover:border-white/25 focus-visible:ring-2 focus-visible:ring-ring"

function randomSeed() {
  return crypto.getRandomValues(new Uint32Array(1))[0] & 0x7fffffff
}

/** A row of mutually exclusive buttons, used for session length and mode. */
function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
  testId,
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  testId: string
}) {
  return (
    <div>
      <p id={`${testId}-label`} className="mb-1.5 text-sm text-muted-foreground">
        {label}
      </p>
      <div role="radiogroup" aria-labelledby={`${testId}-label`} className="flex gap-2" data-testid={testId}>
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            data-value={String(o.value)}
            onClick={() => onChange(o.value)}
            onMouseUp={(e) => e.currentTarget.blur()}
            className={cn(
              "h-10 flex-1 rounded-xl border border-white/12 bg-black/20 px-3 text-sm text-muted-foreground transition-colors outline-none hover:border-white/25 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
              value === o.value &&
                "border-primary/40 bg-primary/12 font-medium text-[#cfe0ff] shadow-[inset_0_0_0_1px_rgb(91_155_255/0.25),0_0_24px_-10px_rgb(91_155_255/0.6)]",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/** `presetCategory` comes from a link in another screen: used for this visit and never saved. */
export function QuickMathView({ presetCategory }: { presetCategory?: string }) {
  const { bank } = useContent()
  const [open, setOpen] = useState<QuickMathSession | null>(null)
  const [active, setActive] = useState<QuickMathSession | null>(null)
  const [results, setResults] = useState<QuickMathResult[]>([])
  const [selection, setSelection] = useState<Selection>(DEFAULT_SELECTION)
  const [loaded, setLoaded] = useState(false)
  const [starting, setStarting] = useState(false)
  const presetRef = useRef(presetCategory)

  const refresh = useCallback(async () => {
    const [sessions, all] = await Promise.all([getQuickMathSessions(), getQuickMathResults()])
    setActive(sessions.find((s) => s.status === "active") ?? null)
    setResults(all)
  }, [])

  // On opening, return to the session that was open when the app last closed, if it is unfinished.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [saved, currentId] = await Promise.all([getMeta<Selection>(QUICK_MATH_SELECTION_KEY), getMeta<string | null>(CURRENT_KEY)])
      const current = typeof currentId === "string" && currentId ? await getQuickMathSession(currentId) : undefined
      await refresh()
      if (cancelled) return
      const base = { ...DEFAULT_SELECTION, ...(saved && typeof saved === "object" ? saved : {}) }
      setSelection(presetRef.current ? { ...base, category: presetRef.current, difficulty: null } : base)
      if (current && current.status === "active") setOpen(current)
      setLoaded(true)
    })()
    return () => {
      cancelled = true
    }
  }, [refresh])

  const show = useCallback((session: QuickMathSession | null) => {
    setOpen(session)
    void setMeta(CURRENT_KEY, session ? session.id : null)
  }, [])

  const categories = useMemo(() => categoriesFor(bank.quickMathQuestions), [bank.quickMathQuestions])
  // A saved category may no longer exist; fall back to all.
  const category = selection.category && categories.includes(selection.category) ? selection.category : null
  const cap = capacity(bank.quickMathQuestions, { category, difficulty: selection.difficulty })
  const count = Math.min(selection.length, cap)

  const update = (patch: Partial<Selection>) => {
    const next = { ...selection, ...patch }
    setSelection(next)
    void setMeta(QUICK_MATH_SELECTION_KEY, next)
  }

  const begin = useCallback(
    async (sel: Selection) => {
      const questions = buildSession(bank.quickMathQuestions, sel, randomSeed())
      if (questions.length === 0) return
      const now = Date.now()
      const session: QuickMathSession = {
        id: crypto.randomUUID(),
        startedAt: now,
        updatedAt: now,
        mode: sel.mode,
        selection: sel,
        requested: sel.length,
        questions,
        index: 0,
        draft: "",
        elapsedMs: 0,
        answers: {},
        status: "active",
      }
      setStarting(true)
      try {
        await startQuickMathSession(session)
        show(session)
        await refresh()
      } finally {
        setStarting(false)
      }
    },
    [bank.quickMathQuestions, show, refresh],
  )

  const exit = useCallback(async () => {
    show(null)
    await refresh()
  }, [show, refresh])

  if (!loaded) return null

  if (open) {
    return (
      <QuickMathRunner
        key={open.id}
        initialSession={open}
        onExit={() => void exit()}
        onAgain={() => void begin(open.selection)}
      />
    )
  }

  const answeredInActive = active ? Object.keys(active.answers).length : 0

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6" data-testid="qm-selector">
      <div>
        <h1 className="font-serif text-2xl font-semibold">Quick Maths</h1>
        <p className="mt-1 text-sm text-muted-foreground">Short numerical practice for interviews: arithmetic, percentages, multiples and enterprise value bridges.</p>
      </div>

      {active && (
        <Panel className="flex flex-wrap items-center justify-between gap-4 p-5" data-testid="qm-resume">
          <div>
            <h2 className="text-sm font-medium">Session in progress</h2>
            <p className="mt-1 text-sm text-muted-foreground tabular-nums">
              {answeredInActive} of {active.questions.length} answered · {active.mode === "timed" ? "Timed" : "Untimed"} ·{" "}
              {active.selection.category ?? "All categories"}
            </p>
          </div>
          <div className="flex gap-3">
            <GlowButton tone="blue" solid className="h-10 px-4 text-sm" onClick={() => show(active)} data-testid="qm-resume-button">
              Resume
            </GlowButton>
            <GlowButton
              className="h-10 px-4 text-sm"
              onClick={() => void abandonQuickMathSession(active.id).then(refresh)}
              data-testid="qm-discard"
            >
              Discard
            </GlowButton>
          </div>
        </Panel>
      )}

      <Panel className="space-y-5 p-6" data-testid="qm-setup">
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="qm-category" className="mb-1.5 block text-sm text-muted-foreground">
              Category
            </label>
            <select id="qm-category" data-testid="qm-category" className={selectClass} value={category ?? ""} onChange={(e) => update({ category: e.target.value || null })}>
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="qm-difficulty" className="mb-1.5 block text-sm text-muted-foreground">
              Difficulty
            </label>
            <select
              id="qm-difficulty"
              data-testid="qm-difficulty"
              className={selectClass}
              value={selection.difficulty ?? ""}
              onChange={(e) => update({ difficulty: (e.target.value || null) as Difficulty | null })}
            >
              <option value="">All difficulties</option>
              {DIFFICULTIES.map((d) => (
                <option key={d} value={d}>
                  {DIFFICULTY_LABEL[d]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <Segmented
          label="Session length"
          testId="qm-length"
          value={selection.length}
          options={SESSION_LENGTHS.map((n) => ({ value: n, label: `${n} questions` }))}
          onChange={(v: SessionLength) => update({ length: v })}
        />

        <div>
          <Segmented
            label="Mode"
            testId="qm-mode"
            value={selection.mode}
            options={[
              { value: "untimed", label: "Untimed practice" },
              { value: "timed", label: "Timed practice" },
            ]}
            onChange={(v: Mode) => update({ mode: v })}
          />
          <p className="mt-2 text-sm text-muted-foreground">
            {selection.mode === "timed"
              ? "Timed practice records how long each answer takes, from the question appearing to Submit. There is no countdown."
              : "Untimed practice records accuracy only."}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] pt-5">
          <p className="text-sm text-muted-foreground tabular-nums" data-testid="qm-available">
            {count === 0
              ? "No questions match these choices."
              : count < selection.length
                ? `Only ${count} ${count === 1 ? "question matches" : "questions match"} these choices, so the session will have ${count}.`
                : `${count} questions in this session.`}
          </p>
          <GlowButton
            tone="blue"
            solid
            className="h-10 px-5 text-sm"
            disabled={count === 0 || starting}
            onClick={() => void begin({ ...selection, category })}
            data-testid="qm-start"
          >
            Start session
          </GlowButton>
        </div>
      </Panel>

      <QuickMathStats results={results} />
    </div>
  )
}
