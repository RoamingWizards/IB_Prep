import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ArrowLeft, ChevronLeft, ChevronRight, RotateCcw } from "lucide-react"
import { GlowButton, Panel } from "@/components/kit"
import { StatementArrows } from "@/components/StatementArrows"
import { StatementGrid } from "@/components/StatementGrid"
import { prefersReducedMotion } from "@/components/kit/motion"
import {
  saveStatementDraft,
  saveStatementView,
  submitStatementAttempt,
  type StatementAttempt,
} from "@/lib/db"
import { editedCount, findRow, gradeAttempt, initialEntries } from "@/lib/threeStatements"

interface Props {
  initialAttempt: StatementAttempt
  /** True when this draft already exists in storage (so a reload resumes it). */
  persisted: boolean
  onExit: () => void
  /** Start a new attempt at the same exercise. */
  onRetry: () => void
}

const SAVE_DELAY_MS = 400
const NARROW_PX = 640

/**
 * One attempt at a Three Statements exercise. Everything shown comes from the attempt's own copy of the
 * exercise, so content updated later never changes an attempt already begun.
 */
export function ThreeStatementsRunner({ initialAttempt, persisted, onExit, onRetry }: Props) {
  const [attempt, setAttempt] = useState(initialAttempt)
  const [entries, setEntries] = useState(initialAttempt.entries)
  const [touched, setTouched] = useState<Set<string>>(new Set())
  const [confirmReset, setConfirmReset] = useState(false)
  const [solution, setSolution] = useState(initialAttempt.solution ?? { shown: false, step: 0 })
  const [narrow, setNarrow] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const lock = useRef(false)

  const exercise = attempt.snapshot
  const submitted = attempt.status === "submitted"
  const grade = attempt.grade
  const edited = editedCount(exercise, entries)

  // ---- Draft autosave: unfinished entries survive a reload ----
  const latest = useRef({ attempt, entries })
  useEffect(() => {
    latest.current = { attempt, entries }
  })
  const timer = useRef(0)
  const savedJson = useRef<string | null>(persisted ? JSON.stringify(initialAttempt.entries) : null)
  const flush = useCallback(() => {
    window.clearTimeout(timer.current)
    const { attempt: a, entries: e } = latest.current
    if (a.status === "submitted") return
    const json = JSON.stringify(e)
    if (json === savedJson.current) return
    // Merely opening an exercise does not create a record; the first edit does.
    if (savedJson.current === null && editedCount(a.snapshot, e) === 0) return
    savedJson.current = json
    void saveStatementDraft({ ...a, entries: e, updatedAt: Date.now() })
  }, [])
  useEffect(() => {
    timer.current = window.setTimeout(flush, SAVE_DELAY_MS)
    return () => window.clearTimeout(timer.current)
  }, [entries, flush])
  useEffect(() => () => flush(), [flush])

  // ---- Layout: arrows when statements sit side by side, numbered markers when they stack ----
  useEffect(() => {
    const el = gridRef.current
    if (!el) return
    let frame = 0
    const check = () => {
      const statements = [...el.querySelectorAll<HTMLElement>("[data-statement]")]
      const columns = new Set(statements.map((s) => Math.round(s.offsetLeft))).size
      // Stacked statements would need long arrows across other tables, and a very narrow area has no room for
      // them, so those cases use numbered markers. One statement in a wide window still gets arrows.
      setNarrow((statements.length > 1 && columns <= 1) || el.clientWidth < NARROW_PX)
    }
    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(check)
    }
    schedule()
    const observer = new ResizeObserver(schedule)
    observer.observe(el)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [solution.shown, submitted])

  const step = exercise.steps[Math.min(solution.step, exercise.steps.length - 1)]
  const showSolution = submitted && solution.shown

  const highlight = useMemo(() => {
    const ids = new Set<string>()
    if (showSolution) {
      step.rows.forEach((r) => ids.add(r))
      step.connections.forEach((c) => {
        ids.add(c.from)
        ids.add(c.to)
      })
    }
    return ids
  }, [showSolution, step])

  const markers = useMemo(() => {
    const m = new Map<string, number[]>()
    if (showSolution && narrow) {
      step.connections.forEach((c, i) => {
        for (const id of [c.from, c.to]) m.set(id, [...(m.get(id) ?? []), i + 1])
      })
    }
    return m
  }, [showSolution, narrow, step])

  const changeSolution = useCallback(
    (next: { shown: boolean; step: number }) => {
      setSolution(next)
      void saveStatementView(attempt.id, next)
    },
    [attempt.id],
  )

  // Bring the step's rows into view when the step changes.
  const scrolledFor = useRef("")
  useEffect(() => {
    if (!showSolution) return
    const key = `${attempt.id}-${solution.step}`
    if (scrolledFor.current === key) return
    scrolledFor.current = key
    const frame = requestAnimationFrame(() => {
      const first = [...highlight][0]
      const row = first ? gridRef.current?.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(first)}"]`) : null
      row?.scrollIntoView({ block: "center", behavior: prefersReducedMotion() ? "auto" : "smooth" })
    })
    return () => cancelAnimationFrame(frame)
  }, [showSolution, solution.step, attempt.id, highlight])

  const onChange = useCallback((rowId: string, text: string) => {
    setEntries((e) => ({ ...e, [rowId]: text }))
  }, [])
  const onBlur = useCallback((rowId: string) => setTouched((t) => new Set(t).add(rowId)), [])

  const submit = useCallback(async () => {
    if (submitted || lock.current) return
    lock.current = true
    setError(null)
    window.clearTimeout(timer.current)
    try {
      const outcome = await submitStatementAttempt({ ...attempt, entries }, gradeAttempt(exercise, entries))
      setAttempt(outcome.attempt)
      setEntries(outcome.attempt.entries)
      setConfirmReset(false)
    } catch (err) {
      console.error("Could not save the attempt", err)
      setError("Your attempt could not be saved. Try submitting again.")
    } finally {
      lock.current = false
    }
  }, [submitted, attempt, entries, exercise])

  const reset = useCallback(() => {
    setEntries(initialEntries(exercise))
    setTouched(new Set())
    setConfirmReset(false)
  }, [exercise])

  const labelOf = (rowId: string) => {
    const found = findRow(exercise, rowId)
    return found ? `${found.row.label} (${found.statement.title.replace(/ \(.*\)$/, "")})` : rowId
  }

  const correctPct = grade ? `${grade.correctFigures} of ${grade.totalFigures}` : ""
  const minColumn = showSolution || submitted ? "30rem" : "25rem"

  return (
    <div className="mx-auto w-full space-y-6" data-testid="statements-runner">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">
            {exercise.category} · {exercise.subcategory}
          </p>
          <h1 className="font-serif text-2xl font-semibold" data-testid="exercise-title">
            {exercise.title}
          </h1>
        </div>
        <GlowButton className="h-8 gap-1.5 px-3 text-sm" onClick={onExit} onMouseUp={(e) => e.currentTarget.blur()} data-testid="statements-exit">
          <ArrowLeft className="size-4" aria-hidden />
          All exercises
        </GlowButton>
      </div>

      <Panel className="grid gap-6 p-6 lg:grid-cols-2" data-testid="exercise-brief">
        <section>
          <h2 className="text-sm font-medium text-muted-foreground">Instructions</h2>
          <div className="mt-2 max-w-[66ch] space-y-3 text-[0.9375rem] leading-[1.65]">
            {exercise.instructions.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </section>
        <section>
          <h2 className="text-sm font-medium text-muted-foreground">Assumptions</h2>
          <dl className="mt-2 grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-[0.9375rem]" data-testid="exercise-assumptions">
            {exercise.assumptions.map((a) => (
              <div key={a.label} className="contents">
                <dt className="text-muted-foreground">{a.label}</dt>
                <dd>{a.value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-sm" data-testid="exercise-units">
            <span className="text-muted-foreground">Units: </span>All figures are in {exercise.units}.
          </p>
        </section>
      </Panel>

      {/* Actions and results */}
      {submitted && grade ? (
        <Panel glow="blue" className="p-6" data-testid="statements-summary">
          <h2 className="font-serif text-xl font-semibold">Your results</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Panel inset className="p-4">
              <p className="text-sm text-muted-foreground">Figures correct</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums" data-testid="stat-correct">{correctPct}</p>
            </Panel>
            <Panel inset className="p-4">
              <p className="text-sm text-muted-foreground">Required changes completed correctly</p>
              <p className="mt-1 text-2xl font-semibold text-grade-easy tabular-nums" data-testid="stat-completed">
                {grade.completed} <span className="text-base font-normal text-muted-foreground">of {grade.requiredChanges}</span>
              </p>
            </Panel>
            <Panel inset className="p-4">
              <p className="text-sm text-muted-foreground">Missed changes</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums" data-testid="stat-missed">{grade.missed}</p>
            </Panel>
            <Panel inset className="p-4">
              <p className="text-sm text-muted-foreground">Unnecessary changes</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums" data-testid="stat-unnecessary">{grade.unnecessary}</p>
            </Panel>
          </div>
          <p className="mt-3 max-w-[70ch] text-sm text-muted-foreground">
            Figures marked in red are incorrect, including required figures you left unchanged. Missed changes are required figures that are unchanged, wrong, blank or not a number.
            Unnecessary changes are figures that needed no change but were altered. Your attempt is saved in History.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <GlowButton
              tone="blue"
              solid
              className="h-10 px-4 text-sm"
              onClick={() => changeSolution({ shown: !solution.shown, step: solution.step })}
              onMouseUp={(e) => e.currentTarget.blur()}
              data-testid="toggle-solution"
            >
              {solution.shown ? "Hide correct answers" : "Show correct answers"}
            </GlowButton>
            <GlowButton className="h-10 px-4 text-sm" onClick={onRetry} onMouseUp={(e) => e.currentTarget.blur()} data-testid="statements-retry">
              Try again
            </GlowButton>
          </div>
        </Panel>
      ) : (
        <Panel className="p-5" data-testid="statements-actions">
          <div className="flex flex-wrap items-center gap-3">
            <GlowButton tone="blue" solid className="h-10 px-5 text-sm" onClick={() => void submit()} onMouseUp={(e) => e.currentTarget.blur()} data-testid="statements-submit">
              Submit
            </GlowButton>
            <GlowButton
              className="h-10 gap-1.5 px-4 text-sm"
              disabled={edited === 0 && touched.size === 0}
              onClick={() => (edited > 0 ? setConfirmReset(true) : reset())}
              onMouseUp={(e) => e.currentTarget.blur()}
              data-testid="statements-reset"
            >
              <RotateCcw className="size-4" aria-hidden />
              Reset
            </GlowButton>
            <p className="text-sm text-muted-foreground" data-testid="edited-count">
              {edited === 0 ? "No figures edited yet" : `${edited} ${edited === 1 ? "figure" : "figures"} edited`}
            </p>
          </div>
          {confirmReset && (
            <div role="alertdialog" aria-label="Confirm reset" className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4" data-testid="reset-confirm">
              <p className="text-sm">
                Reset all figures to their originals? Your {edited} edited {edited === 1 ? "figure" : "figures"} will be lost.
              </p>
              <GlowButton tone="again" className="h-9 px-3 text-sm" onClick={reset} data-testid="reset-confirm-yes">
                Reset figures
              </GlowButton>
              <GlowButton className="h-9 px-3 text-sm" onClick={() => setConfirmReset(false)} data-testid="reset-confirm-no">
                Keep editing
              </GlowButton>
            </div>
          )}
          {error && (
            <p role="alert" className="mt-3 text-sm text-destructive" data-testid="statements-error">
              {error}
            </p>
          )}
        </Panel>
      )}

      {/* Worked solution */}
      {showSolution && (
        <Panel glow="violet" className="stmt-sticky relative z-30 p-5" data-testid="solution-panel">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground tabular-nums" data-testid="solution-step-count">
                Step {solution.step + 1} of {exercise.steps.length}
              </p>
              <h2 className="font-serif text-lg font-semibold" data-testid="solution-title">{step.title}</h2>
            </div>
            <div className="flex gap-2">
              <GlowButton
                className="h-9 gap-1 px-3 text-sm"
                disabled={solution.step === 0}
                onClick={() => changeSolution({ shown: true, step: solution.step - 1 })}
                onMouseUp={(e) => e.currentTarget.blur()}
                data-testid="solution-prev"
              >
                <ChevronLeft className="size-4" aria-hidden />
                Previous
              </GlowButton>
              <GlowButton
                tone="blue"
                className="h-9 gap-1 px-3 text-sm"
                disabled={solution.step >= exercise.steps.length - 1}
                onClick={() => changeSolution({ shown: true, step: solution.step + 1 })}
                onMouseUp={(e) => e.currentTarget.blur()}
                data-testid="solution-next"
              >
                Next
                <ChevronRight className="size-4" aria-hidden />
              </GlowButton>
            </div>
          </div>
          <p className="mt-2 max-w-[80ch] text-[0.9375rem] leading-[1.6]" data-testid="solution-text">{step.text}</p>
          {step.connections.length > 0 && (
            <ol className="mt-3 space-y-1 text-sm text-muted-foreground" data-testid="solution-connections">
              {step.connections.map((c, i) => (
                <li key={i} className="flex items-baseline gap-2">
                  <span className="stmt-marker !ml-0 shrink-0">{i + 1}</span>
                  <span className="min-w-0">
                    {labelOf(c.from)} → {labelOf(c.to)}
                    {c.label ? ` · ${c.label}` : ""}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      )}

      {/* The statements, side by side where they fit and stacked where they do not */}
      <div ref={gridRef} className="relative pr-8" data-testid="statements-grid" data-layout={narrow ? "stacked" : "side-by-side"}>
        <div className="grid gap-x-12 gap-y-10" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${minColumn}), 1fr))` }}>
          {exercise.statements.map((statement) => (
            <Panel key={statement.id} className="thin-scroll min-w-0 overflow-x-auto p-3 sm:p-5">
              <StatementGrid
                statement={statement}
                exercise={exercise}
                entries={entries}
                onChange={submitted ? undefined : onChange}
                onBlur={onBlur}
                touched={touched}
                grade={grade}
                showCorrect={showSolution}
                highlight={highlight}
                markers={markers}
              />
            </Panel>
          ))}
        </div>
        <StatementArrows
          containerRef={gridRef}
          connections={showSolution ? step.connections : []}
          enabled={showSolution && !narrow}
          layoutKey={`${solution.step}-${narrow}-${showSolution}`}
        />
      </div>
    </div>
  )
}
