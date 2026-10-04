import { useCallback, useEffect, useRef, useState } from "react"
import { ArrowLeft, Check, X } from "lucide-react"
import { GlowButton, Panel, ProgressBar } from "@/components/kit"
import { Badge } from "@/components/ui/badge"
import { advanceQuickMath, saveQuickMathDraft, submitQuickMathAnswer, type QuickMathSession } from "@/lib/db"
import { useShortcutHandlers, useKeybinds } from "@/lib/keybindsContext"
import { DIFFICULTY_LABEL } from "@/lib/quickMathGen"
import { formatAnswer, formatDuration, formatNumber, isCorrect, parseAnswer, summarise, unitHint, type SessionQuestion } from "@/lib/quickMath"

interface Props {
  initialSession: QuickMathSession
  /** Back to the session setup. The session stays resumable. */
  onExit: () => void
  /** Start a new session with the same choices. */
  onAgain: () => void
}

const SAVE_DELAY_MS = 400
const CLOCK_SAVE_MS = 1000
/** After feedback appears, "Next" is ignored for this long, so a double press cannot skip past it unread. */
const FEEDBACK_DWELL_MS = 300

function QuestionBody({ q }: { q: SessionQuestion }) {
  return (
    <>
      <p className="mt-2 font-serif text-[clamp(1.375rem,2.1vw,2rem)] leading-[1.3] font-semibold" data-testid="qm-prompt">
        {q.prompt}
      </p>
      {q.assumptions && q.assumptions.length > 0 && (
        <dl className="mt-4 grid max-w-xl grid-cols-[auto_1fr] gap-x-5 gap-y-1.5 text-sm" data-testid="qm-assumptions">
          {q.assumptions.map((a) => (
            <div key={a.label} className="contents">
              <dt className="text-muted-foreground">{a.label}</dt>
              <dd>{a.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {q.rounding && (
        <p className="mt-3 text-sm text-muted-foreground" data-testid="qm-rounding">
          {q.rounding}
        </p>
      )}
    </>
  )
}

/** Runs one Quick Maths session: one question at a time, then a summary. */
export function QuickMathRunner({ initialSession, onExit, onAgain }: Props) {
  const [session, setSession] = useState(initialSession)
  const [input, setInput] = useState(() => initialSession.draft)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const lock = useRef(false) // blocks a second submit or "next" while one is still being saved
  const feedbackAt = useRef(Number.NEGATIVE_INFINITY) // when feedback appeared, for the dwell guard
  const { label } = useKeybinds()

  const timed = session.mode === "timed"
  const total = session.questions.length
  const finished = session.index >= total || session.status !== "active"
  const q = finished ? undefined : session.questions[session.index]
  const result = q ? session.answers[q.key] : undefined
  const answered = !!result
  const continueHint = label("choiceContinue")

  // ---- Response clock: counts only while the question is waiting for an answer and the app is visible ----
  const banked = useRef(initialSession.elapsedMs) // milliseconds already counted for this question
  const runStart = useRef<number | null>(null)
  const [shownMs, setShownMs] = useState(initialSession.elapsedMs)
  const readMs = useCallback(() => banked.current + (runStart.current !== null ? performance.now() - runStart.current : 0), [])
  const startClock = useCallback(() => {
    if (runStart.current === null) runStart.current = performance.now()
  }, [])
  const stopClock = useCallback(() => {
    if (runStart.current !== null) {
      banked.current += performance.now() - runStart.current
      runStart.current = null
    }
  }, [])

  // ---- Saving the draft text and the clock ----
  const latest = useRef({ session, input })
  useEffect(() => {
    latest.current = { session, input }
  })
  const saveTimer = useRef(0)
  const persist = useCallback(() => {
    window.clearTimeout(saveTimer.current)
    const { session: s, input: text } = latest.current
    if (s.status !== "active" || s.index >= s.questions.length || s.answers[s.questions[s.index].key]) return
    void saveQuickMathDraft(s.id, s.index, text, s.mode === "timed" ? Math.round(readMs()) : 0).catch((err) => console.error("Could not save the draft", err))
  }, [readMs])

  const timing = timed && !finished && !answered
  useEffect(() => {
    if (!timing) return
    const visible = () => document.visibilityState === "visible"
    if (visible()) startClock()
    const tick = window.setInterval(() => setShownMs(readMs()), 250)
    const save = window.setInterval(persist, CLOCK_SAVE_MS)
    const onVisibility = () => {
      if (visible()) startClock()
      else {
        stopClock()
        persist()
      }
      setShownMs(readMs())
    }
    const onHide = () => {
      stopClock()
      persist()
    }
    document.addEventListener("visibilitychange", onVisibility)
    window.addEventListener("pagehide", onHide)
    return () => {
      window.clearInterval(tick)
      window.clearInterval(save)
      document.removeEventListener("visibilitychange", onVisibility)
      window.removeEventListener("pagehide", onHide)
      stopClock()
      persist() // leaving the screen keeps the clock and the text
    }
  }, [timing, session.id, session.index, startClock, stopClock, readMs, persist])

  // Focus the box whenever a question begins.
  useEffect(() => {
    if (!finished && !answered) inputRef.current?.focus()
  }, [session.index, finished, answered])

  function onInput(text: string) {
    setInput(text)
    setMessage(null)
    window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(persist, SAVE_DELAY_MS)
  }

  const submit = useCallback(async () => {
    if (!q || answered || lock.current) return
    const parsed = parseAnswer(latest.current.input)
    if (parsed.kind === "blank") {
      setMessage("Enter an answer before submitting.")
      return
    }
    if (parsed.kind === "invalid") {
      setMessage("That is not a number. Use digits only, for example 1,234.5, -7.5 or (7.5).")
      return
    }
    lock.current = true
    setError(null)
    setMessage(null)
    stopClock()
    const responseMs = timed ? Math.round(readMs()) : null
    try {
      const outcome = await submitQuickMathAnswer(
        session.id,
        session.index,
        { raw: latest.current.input, entered: parsed.value, responseMs, at: Date.now() },
        isCorrect(parsed.value, q.answer, q.tolerance),
      )
      // A duplicate means this question was already saved; show what is stored instead of writing again.
      if (outcome) {
        feedbackAt.current = outcome.duplicate ? Number.NEGATIVE_INFINITY : performance.now()
        setSession(outcome.session)
        inputRef.current?.blur()
      }
    } catch (err) {
      console.error("Could not save the answer", err)
      setError("The answer could not be saved. Try submitting again.")
      if (timed && document.visibilityState === "visible") startClock()
    } finally {
      lock.current = false
    }
  }, [q, answered, session.id, session.index, timed, readMs, stopClock, startClock])

  const next = useCallback(async () => {
    if (!answered || lock.current || performance.now() - feedbackAt.current < FEEDBACK_DWELL_MS) return
    lock.current = true
    setError(null)
    try {
      const outcome = await advanceQuickMath(session.id, session.index)
      if (outcome) {
        banked.current = 0
        runStart.current = null
        feedbackAt.current = Number.NEGATIVE_INFINITY
        setShownMs(0)
        setInput("")
        setMessage(null)
        setSession(outcome.session)
      }
    } catch (err) {
      console.error("Could not move to the next question", err)
      setError("Could not move to the next question. Try again.")
    } finally {
      lock.current = false
    }
  }, [answered, session.id, session.index])

  // Enter inside the box submits (the shared handler ignores typing, by design). With the box not focused,
  // Enter, or whatever key is bound to "Submit / next", submits or moves on. Held-down keys never repeat.
  const advance = useCallback(() => {
    if (finished) return
    if (answered) void next()
    else void submit()
  }, [finished, answered, next, submit])
  useShortcutHandlers({ choiceContinue: advance })

  const summary = summarise(session.questions, session.answers)
  const short = session.questions.length < session.requested

  const header = (
    <header className="shrink-0 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="flex min-w-0 items-center gap-2 text-sm font-medium">
          <span className="size-2 shrink-0 rounded-full bg-primary shadow-[0_0_10px_var(--primary)]" aria-hidden />
          <span className="truncate">
            Quick Maths
            <span className="font-normal text-muted-foreground"> · {timed ? "Timed practice" : "Untimed practice"}</span>
          </span>
        </p>
        <div className="flex items-center gap-4">
          <p className="text-sm text-muted-foreground tabular-nums" data-testid="qm-progress">
            {finished ? `${total} of ${total} questions` : `Question ${session.index + 1} of ${total}`}
          </p>
          <GlowButton className="h-8 gap-1.5 px-3 text-sm" onClick={onExit} onMouseUp={(e) => e.currentTarget.blur()} data-testid="qm-exit">
            <ArrowLeft className="size-4" aria-hidden />
            All sessions
          </GlowButton>
        </div>
      </div>
      <ProgressBar value={summary.answered} max={total} label="Session progress" />
      {short && (
        <p className="text-sm text-muted-foreground" data-testid="qm-short-note">
          Only {total} {total === 1 ? "question matches" : "questions match"} these choices, so this session has {total} instead of {session.requested}.
        </p>
      )}
    </header>
  )

  let body
  if (finished) {
    const wrong = session.questions.filter((x) => session.answers[x.key] && !session.answers[x.key].correct)
    const unanswered = session.questions.filter((x) => !session.answers[x.key]).length
    body = (
      <div className="study-card thin-scroll flex h-full flex-col overflow-y-auto px-6 py-8 sm:px-10" data-testid="qm-summary">
        <div className="mx-auto w-full max-w-3xl">
          <h1 className="font-serif text-3xl font-semibold">Session complete</h1>
          <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="panel-inset p-4">
              <dt className="text-sm text-muted-foreground">Accuracy</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums" data-testid="qm-accuracy">
                {Math.round(summary.accuracy * 100)}%
              </dd>
              <dd className="text-sm text-muted-foreground tabular-nums" data-testid="qm-score">
                {summary.correct} of {summary.answered} correct
              </dd>
            </div>
            <div className="panel-inset p-4">
              <dt className="text-sm text-muted-foreground">Total time</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums" data-testid="qm-total-time">
                {summary.totalMs === null ? "–" : formatDuration(summary.totalMs)}
              </dd>
              {!timed && <dd className="text-sm text-muted-foreground">Untimed practice</dd>}
            </div>
            <div className="panel-inset p-4">
              <dt className="text-sm text-muted-foreground">Average response</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums" data-testid="qm-average-time">
                {summary.averageMs === null ? "–" : formatDuration(summary.averageMs)}
              </dd>
              {timed && <dd className="text-sm text-muted-foreground">Feedback time excluded</dd>}
            </div>
            <div className="panel-inset p-4">
              <dt className="text-sm text-muted-foreground">Incorrect</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums" data-testid="qm-incorrect-count">
                {wrong.length}
              </dd>
              {unanswered > 0 && <dd className="text-sm text-muted-foreground">{unanswered} not answered</dd>}
            </div>
          </dl>

          <h2 className="mt-8 text-sm font-medium">{wrong.length === 0 ? "Review" : `Review of incorrect answers (${wrong.length})`}</h2>
          {wrong.length === 0 ? (
            <p className="mt-2 text-muted-foreground" data-testid="qm-review-empty">
              Every answer was correct.
            </p>
          ) : (
            <ul className="mt-3 space-y-3" data-testid="qm-review">
              {wrong.map((x) => {
                const r = session.answers[x.key]
                return (
                  <li key={x.key} className="panel-inset p-5" data-testid="qm-review-item">
                    <p className="text-sm text-muted-foreground">
                      {x.category} · {DIFFICULTY_LABEL[x.difficulty]}
                    </p>
                    <p className="mt-1 font-medium">{x.prompt}</p>
                    {x.assumptions && x.assumptions.length > 0 && (
                      <p className="mt-1 text-sm text-muted-foreground">{x.assumptions.map((a) => `${a.label}: ${a.value}`).join(" · ")}</p>
                    )}
                    <p className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm tabular-nums">
                      <span>
                        You entered <span className="font-medium text-grade-again">{formatNumber(r.entered)}</span>
                      </span>
                      <span>
                        Correct answer <span className="font-medium text-grade-easy">{formatAnswer(x)}</span>
                      </span>
                    </p>
                    <p className="mt-2 max-w-[66ch] text-[0.9375rem] leading-[1.65] text-foreground/90">{x.explanation}</p>
                  </li>
                )
              })}
            </ul>
          )}
          <p className="mt-6 text-sm text-muted-foreground">Results are saved in History.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <GlowButton tone="blue" solid className="h-10 px-4" onClick={onAgain} data-testid="qm-again">
              Practise again
            </GlowButton>
            <GlowButton className="h-10 px-4" onClick={onExit} data-testid="qm-done">
              All sessions
            </GlowButton>
          </div>
        </div>
      </div>
    )
  } else if (q) {
    const hint = unitHint(q.units)
    const exact = q.tolerance === 0
    body = (
      <div className="study-card flex h-full flex-col" data-testid="qm-card">
        <div className="thin-scroll min-h-0 flex-1 overflow-y-auto px-6 py-6 sm:px-10 sm:py-8">
          <div className="mx-auto w-full max-w-3xl">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="qm-context">
                {q.category} · {q.subcategory}
                <Badge variant="outline">{DIFFICULTY_LABEL[q.difficulty]}</Badge>
              </p>
              {timed && (
                <p className="text-sm text-muted-foreground tabular-nums" data-testid="qm-elapsed" aria-label="Time on this question">
                  {formatDuration(answered ? (result?.responseMs ?? 0) : shownMs)}
                </p>
              )}
            </div>
            <QuestionBody q={q} />

            <form
              className="mt-8"
              onSubmit={(e) => {
                e.preventDefault()
                void submit()
              }}
            >
              <label htmlFor="qm-answer" className="mb-2 block text-sm text-muted-foreground">
                Your answer{q.units ? ` (${q.units})` : ""}
              </label>
              <div className="flex max-w-md items-center gap-3">
                <input
                  id="qm-answer"
                  ref={inputRef}
                  data-testid="qm-input"
                  type="text"
                  inputMode="text"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  value={answered ? (result?.raw ?? "") : input}
                  readOnly={answered}
                  aria-invalid={message ? true : undefined}
                  aria-describedby="qm-hint qm-message"
                  onChange={(e) => onInput(e.target.value)}
                  onKeyDown={(e) => {
                    // Typing guard: Enter is read here, not by the shared handler, and a held key is ignored.
                    if (e.key !== "Enter" || e.nativeEvent.isComposing) return
                    e.preventDefault()
                    if (!e.repeat) void submit()
                  }}
                  className="h-14 min-w-0 flex-1 rounded-xl border border-white/12 bg-black/20 px-4 text-2xl tabular-nums outline-none transition-colors placeholder:text-muted-foreground/50 hover:border-white/25 focus-visible:ring-2 focus-visible:ring-ring read-only:opacity-80"
                  placeholder="0"
                />
                {q.units && (
                  <span className="min-w-8 text-lg text-muted-foreground" data-testid="qm-units">
                    {q.units}
                  </span>
                )}
              </div>
              <p id="qm-hint" className="mt-2 text-sm text-muted-foreground" data-testid="qm-hint">
                {hint}
              </p>
              <p id="qm-message" role="alert" className="mt-2 min-h-5 text-sm text-destructive" data-testid="qm-error">
                {message}
              </p>
            </form>

            {result && (
              <Panel inset className="mt-4 p-5" role="status" data-testid="qm-feedback">
                <p className="flex items-center gap-2 font-medium" data-testid="qm-verdict">
                  {result.correct ? (
                    <>
                      <Check className="size-5 text-grade-easy" aria-hidden />
                      <span className="text-grade-easy">Correct</span>
                    </>
                  ) : (
                    <>
                      <X className="size-5 text-grade-again" aria-hidden />
                      <span className="text-grade-again">Not quite</span>
                    </>
                  )}
                </p>
                <p className="mt-2 text-sm tabular-nums" data-testid="qm-correct-answer">
                  {result.correct ? "Answer: " : "The correct answer is "}
                  <span className="font-medium">{formatAnswer(q)}</span>
                  {!result.correct && (
                    <>
                      {" "}
                      (you entered <span className="font-medium">{formatNumber(result.entered)}</span>)
                    </>
                  )}
                </p>
                {!exact && <p className="mt-1 text-sm text-muted-foreground">Answers within ±{formatNumber(q.tolerance)} are accepted.</p>}
                <p className="mt-3 max-w-[66ch] text-[0.9375rem] leading-[1.65] text-foreground/90" data-testid="qm-explanation">
                  {q.explanation}
                </p>
              </Panel>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-4 border-t border-white/[0.07] px-6 py-4 sm:px-10">
          {error && (
            <p role="alert" className="mr-auto text-sm text-destructive" data-testid="qm-save-error">
              {error}
            </p>
          )}
          {answered ? (
            <GlowButton tone="blue" solid className="h-11 px-6" onClick={() => void next()} onMouseUp={(e) => e.currentTarget.blur()} data-testid="qm-next">
              {session.index + 1 >= total ? "See results" : "Next"}
              {continueHint && <kbd>{continueHint}</kbd>}
            </GlowButton>
          ) : (
            <GlowButton tone="blue" solid className="h-11 px-6" onClick={() => void submit()} onMouseUp={(e) => e.currentTarget.blur()} data-testid="qm-submit">
              Submit
              {continueHint && <kbd>{continueHint}</kbd>}
            </GlowButton>
          )}
        </div>
      </div>
    )
  } else {
    body = null
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4" data-testid="qm-runner" data-session-id={session.id}>
      {header}
      <div className="min-h-0 flex-1">{body}</div>
    </div>
  )
}
