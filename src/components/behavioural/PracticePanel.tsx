import { useCallback, useEffect, useRef, useState } from "react"
import { Check, Pause, Play, RotateCcw } from "lucide-react"
import { GlowButton, Panel } from "@/components/kit"
import { fieldClass } from "@/components/behavioural/fields"
import { addBehaviouralSession, type BehaviouralNote, type BehaviouralSession } from "@/lib/db"
import { useKeybinds, useShortcutHandlers } from "@/lib/keybindsContext"
import { bulletLines, formatClock, type Outcome, type Question } from "@/lib/behavioural"
import { cn } from "@/lib/utils"

const MAX_REFLECTION = 500

/** A stopwatch that counts up (never a countdown) and pauses while the app is hidden. */
function useStopwatch() {
  const banked = useRef(0)
  const startedAt = useRef<number | null>(null)
  const [running, setRunning] = useState(false)
  const [shown, setShown] = useState(0)
  const read = useCallback(() => banked.current + (startedAt.current === null ? 0 : performance.now() - startedAt.current), [])
  const stop = useCallback(() => {
    if (startedAt.current !== null) {
      banked.current += performance.now() - startedAt.current
      startedAt.current = null
    }
    setRunning(false)
    setShown(banked.current)
  }, [])
  const start = useCallback(() => {
    if (startedAt.current === null) startedAt.current = performance.now()
    setRunning(true)
  }, [])
  const reset = useCallback(() => {
    banked.current = 0
    startedAt.current = null
    setRunning(false)
    setShown(0)
  }, [])
  useEffect(() => {
    if (!running) return
    const tick = window.setInterval(() => setShown(read()), 250)
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        if (startedAt.current !== null) {
          banked.current += performance.now() - startedAt.current
          startedAt.current = null
        }
      } else if (startedAt.current === null) startedAt.current = performance.now()
      setShown(read())
    }
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      window.clearInterval(tick)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [running, read])
  return { running, shown, start, stop, reset, read }
}

interface Props {
  question: Question
  note: BehaviouralNote | undefined
  /** Called once a session has been saved, so History and readiness refresh. */
  onRecorded: (session: BehaviouralSession) => void
}

/** Practise one question: the question first, optional timing, notes and checklist on request, then an honest self-rating. */
export function PracticePanel({ question, note, onRecorded }: Props) {
  const { label } = useKeybinds()
  const clock = useStopwatch()
  const [timed, setTimed] = useState(false)
  const [showNotes, setShowNotes] = useState(false)
  const [showChecklist, setShowChecklist] = useState(false)
  const [ticked, setTicked] = useState<Set<number>>(new Set())
  const [finishing, setFinishing] = useState(false)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [reflection, setReflection] = useState("")
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const startedAt = useRef(0)
  useEffect(() => {
    startedAt.current = Date.now() // when this practice began
  }, [])
  const lock = useRef(false)

  const bullets = bulletLines(note?.bullets ?? "")
  const hasWriting = bullets.length > 0 || (note?.answer.trim() ?? "") !== ""

  const toggleTimer = useCallback(() => {
    if (saved) return
    if (!timed) setTimed(true)
    if (clock.running) clock.stop()
    else clock.start()
  }, [saved, timed, clock])
  useShortcutHandlers({
    behavNotes: () => setShowNotes((v) => !v),
    behavChecklist: () => setShowChecklist((v) => !v),
    behavTimer: toggleTimer,
  })

  async function save() {
    if (lock.current || saved || outcome === null) return
    lock.current = true
    setError(null)
    clock.stop()
    const durationMs = timed && clock.read() > 0 ? Math.round(clock.read()) : null
    const session: Omit<BehaviouralSession, "id"> = {
      questionId: question.id,
      questionTitle: question.title,
      category: question.category,
      source: question.source,
      startedAt: startedAt.current,
      at: Date.now(),
      durationMs,
      outcome,
      reflection: reflection.trim(),
      checklist: question.checklist.length > 0 && showChecklist ? { checked: ticked.size, total: question.checklist.length } : null,
    }
    try {
      const id = await addBehaviouralSession(session)
      setSaved(true)
      onRecorded({ ...session, id })
    } catch (err) {
      console.error("Could not save the practice", err)
      setError("The practice could not be saved. Try again.")
    } finally {
      lock.current = false
    }
  }

  function again() {
    clock.reset()
    setTimed(false)
    setShowNotes(false)
    setShowChecklist(false)
    setTicked(new Set())
    setFinishing(false)
    setOutcome(null)
    setReflection("")
    setSaved(false)
    startedAt.current = Date.now()
  }

  const hint = (action: "behavNotes" | "behavChecklist" | "behavTimer") => {
    const l = label(action)
    return l ? <kbd>{l}</kbd> : null
  }

  return (
    <div className="space-y-4" data-testid="practice-panel">
      <div className="study-card px-6 py-8 sm:px-10">
        <p className="text-sm text-muted-foreground">
          {question.category}
          {question.firm ? ` · ${question.firm}` : ""}
        </p>
        <p className="mt-3 font-serif text-[clamp(1.5rem,2.4vw,2.25rem)] leading-[1.25] font-semibold" data-testid="practice-prompt">
          {question.prompt}
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <GlowButton className="h-10 gap-2 px-4 text-sm" onClick={() => setTimed((t) => !t)} aria-pressed={timed} data-testid="timer-toggle">
            {timed ? "Timing on" : "Time myself"}
          </GlowButton>
          {timed && (
            <>
              <span className="min-w-[4.5rem] text-2xl font-semibold tabular-nums" data-testid="timer-display" aria-label="Elapsed time">
                {formatClock(clock.shown)}
              </span>
              <GlowButton tone="blue" className="h-10 gap-2 px-4 text-sm" onClick={toggleTimer} data-testid="timer-button">
                {clock.running ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
                {clock.running ? "Pause" : "Start"}
                {hint("behavTimer")}
              </GlowButton>
              <GlowButton className="h-10 gap-2 px-3 text-sm" onClick={clock.reset} aria-label="Reset timer" data-testid="timer-reset">
                <RotateCcw className="size-4" aria-hidden />
              </GlowButton>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <GlowButton className="h-10 px-4 text-sm" onClick={() => setShowNotes((v) => !v)} aria-pressed={showNotes} data-testid="toggle-notes">
          {showNotes ? "Hide my notes" : "Show my notes"}
          {hint("behavNotes")}
        </GlowButton>
        <GlowButton className="h-10 px-4 text-sm" onClick={() => setShowChecklist((v) => !v)} aria-pressed={showChecklist} disabled={question.checklist.length === 0} data-testid="toggle-checklist">
          {showChecklist ? "Hide checklist" : "Show checklist"}
          {hint("behavChecklist")}
        </GlowButton>
      </div>

      {showNotes && (
        <Panel className="p-5" data-testid="practice-notes">
          <h3 className="text-sm font-medium">My notes</h3>
          {!hasWriting ? (
            <p className="mt-2 text-sm text-muted-foreground" data-testid="notes-empty">
              You have not written anything for this question yet. Add bullets or an answer on the Write tab.
            </p>
          ) : (
            <>
              {bullets.length > 0 && (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-[0.9375rem] leading-relaxed" data-testid="notes-bullets">
                  {bullets.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              )}
              {note && note.answer.trim() !== "" && (
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer text-muted-foreground select-none">Full answer</summary>
                  <p className="mt-2 max-w-[70ch] whitespace-pre-wrap leading-relaxed text-foreground/90" data-testid="notes-answer">
                    {note.answer}
                  </p>
                </details>
              )}
            </>
          )}
        </Panel>
      )}

      {showChecklist && question.checklist.length > 0 && (
        <Panel className="p-5" data-testid="practice-checklist">
          <h3 className="text-sm font-medium">Self-review checklist</h3>
          <ul className="mt-2 space-y-2">
            {question.checklist.map((item, i) => (
              <li key={item}>
                <label className="flex items-start gap-3 text-sm leading-snug">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 accent-[var(--primary)]"
                    checked={ticked.has(i)}
                    onChange={(e) =>
                      setTicked((prev) => {
                        const next = new Set(prev)
                        if (e.target.checked) next.add(i)
                        else next.delete(i)
                        return next
                      })
                    }
                    data-testid="checklist-item"
                  />
                  {item}
                </label>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground tabular-nums">
            {ticked.size} of {question.checklist.length} ticked
          </p>
        </Panel>
      )}

      <Panel className="p-5" data-testid="finish-panel">
        {saved ? (
          <div className="flex flex-wrap items-center justify-between gap-3" data-testid="practice-saved">
            <p className="flex items-center gap-2 text-sm text-grade-easy">
              <Check className="size-4" aria-hidden />
              Saved to History as {outcome === "ready" ? "Ready" : "Needs work"}.
            </p>
            <GlowButton className="h-9 px-4 text-sm" onClick={again} data-testid="practise-again">
              Practise again
            </GlowButton>
          </div>
        ) : !finishing ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">When you have said your answer out loud, finish and rate how it went.</p>
            <GlowButton tone="blue" solid className="h-10 px-5 text-sm" onClick={() => (clock.stop(), setFinishing(true))} data-testid="finish-practice">
              Finish practice
            </GlowButton>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-medium">How did it go?</h3>
              <div role="radiogroup" aria-label="Outcome" className="mt-2 flex gap-3" data-testid="outcome-group">
                {(["needs-work", "ready"] as Outcome[]).map((o) => (
                  <button
                    key={o}
                    type="button"
                    role="radio"
                    aria-checked={outcome === o}
                    data-value={o}
                    onClick={() => setOutcome(o)}
                    onMouseUp={(e) => e.currentTarget.blur()}
                    className={cn(
                      "h-11 flex-1 rounded-xl border px-4 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      o === "ready" ? "border-grade-easy/30 text-grade-easy hover:bg-grade-easy/10" : "border-grade-hard/30 text-grade-hard hover:bg-grade-hard/10",
                      outcome === o && (o === "ready" ? "border-grade-easy bg-grade-easy/15" : "border-grade-hard bg-grade-hard/15"),
                    )}
                  >
                    {o === "ready" ? "Ready" : "Needs work"}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label htmlFor="bq-reflection" className="mb-1.5 block text-sm text-muted-foreground">
                Short reflection (optional): what worked, what to change
              </label>
              <textarea id="bq-reflection" className={fieldClass} rows={3} maxLength={MAX_REFLECTION} value={reflection} onChange={(e) => setReflection(e.target.value)} data-testid="reflection-input" />
              <p className="mt-1 text-right text-xs text-muted-foreground tabular-nums">
                {reflection.length} / {MAX_REFLECTION}
              </p>
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive" data-testid="practice-error">
                {error}
              </p>
            )}
            <div className="flex gap-3">
              <GlowButton tone="blue" solid className="h-10 px-5 text-sm" disabled={outcome === null} onClick={() => void save()} data-testid="save-practice">
                Save practice
              </GlowButton>
              <GlowButton className="h-10 px-4 text-sm" onClick={() => setFinishing(false)} data-testid="cancel-finish">
                Back
              </GlowButton>
            </div>
          </div>
        )}
      </Panel>
    </div>
  )
}
