import { useCallback, useEffect, useState } from "react"
import { Panel, GlowButton } from "@/components/kit"
import { ThreeStatementsRunner } from "@/components/ThreeStatementsRunner"
import { useContent } from "@/content/contentContext"
import type { ThreeStatementExercise } from "@/content/types"
import {
  discardStatementDrafts,
  getMeta,
  getStatementAttempt,
  getStatementAttempts,
  setMeta,
  type StatementAttempt,
} from "@/lib/db"
import { figureRows, initialEntries } from "@/lib/threeStatements"

const CURRENT_KEY = "threeStatements:current"
const fmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })

function newAttempt(exercise: ThreeStatementExercise): StatementAttempt {
  const now = Date.now()
  return {
    id: crypto.randomUUID(),
    exerciseId: exercise.id,
    startedAt: now,
    updatedAt: now,
    // A copy, so later updates to the exercise never change this attempt.
    snapshot: structuredClone(exercise),
    entries: initialEntries(exercise),
    status: "draft",
  }
}

export function ThreeStatementsView() {
  const { bank } = useContent()
  const [attempts, setAttempts] = useState<StatementAttempt[] | null>(null)
  const [open, setOpen] = useState<{ attempt: StatementAttempt; persisted: boolean } | null>(null)
  const [loaded, setLoaded] = useState(false)

  // On opening, return to an unfinished attempt that was open when the app last closed.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [all, currentId] = await Promise.all([getStatementAttempts(), getMeta<string | null>(CURRENT_KEY)])
      const current = typeof currentId === "string" && currentId ? await getStatementAttempt(currentId) : undefined
      if (cancelled) return
      setAttempts(all)
      if (current && current.status === "draft") setOpen({ attempt: current, persisted: true })
      setLoaded(true)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const refresh = useCallback(async () => setAttempts(await getStatementAttempts()), [])

  const show = useCallback((attempt: StatementAttempt | null, persisted = true) => {
    setOpen(attempt ? { attempt, persisted } : null)
    void setMeta(CURRENT_KEY, attempt ? attempt.id : null)
  }, [])

  const begin = useCallback(
    async (exercise: ThreeStatementExercise) => {
      await discardStatementDrafts(exercise.id) // one unfinished attempt per exercise
      show(newAttempt(exercise), false)
      await refresh()
    },
    [show, refresh],
  )

  const exit = useCallback(async () => {
    show(null)
    await refresh()
  }, [show, refresh])

  if (!loaded || !attempts) return null

  if (open) {
    const { attempt } = open
    const live = bank.threeStatementExercises.find((e) => e.id === attempt.exerciseId)
    return (
      <ThreeStatementsRunner
        key={attempt.id}
        initialAttempt={attempt}
        persisted={open.persisted}
        onExit={() => void exit()}
        // Retrying starts a new attempt from the current content (or, if it was removed, from this attempt's copy).
        onRetry={() => void begin(live ?? attempt.snapshot)}
      />
    )
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6" data-testid="statements-selector">
      <div>
        <h1 className="font-serif text-2xl font-semibold">Three Statements</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Update the income statement, cash flow statement and balance sheet for a change, then check your figures.
        </p>
      </div>

      {bank.threeStatementExercises.length === 0 ? (
        <Panel className="p-6">
          <p className="text-muted-foreground" data-testid="statements-empty">
            No exercises yet. Import a content pack that includes three-statement exercises in Settings → Content.
          </p>
        </Panel>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {bank.threeStatementExercises.map((exercise) => {
            const mine = attempts.filter((a) => a.exerciseId === exercise.id)
            const latest = mine[0] // newest first
            const submitted = mine.find((a) => a.status === "submitted")
            const figures = figureRows(exercise).length
            return (
              <Panel key={exercise.id} className="flex flex-col p-6" data-testid="exercise-card" data-exercise-id={exercise.id}>
                <p className="text-sm text-muted-foreground">
                  {exercise.category} · {exercise.subcategory}
                </p>
                <h2 className="mt-1 font-serif text-xl font-semibold">{exercise.title}</h2>
                <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{exercise.instructions[0]}</p>
                <p className="mt-3 text-sm text-muted-foreground" data-testid="exercise-status">
                  {exercise.statements.length} statements · {figures} figures · {exercise.steps.length} solution steps
                  {latest?.status === "draft"
                    ? " · Unfinished attempt"
                    : latest?.grade
                      ? ` · Last attempt ${latest.grade.correctFigures} of ${latest.grade.totalFigures} correct (${fmt.format(latest.submittedAt ?? latest.updatedAt)})`
                      : ""}
                </p>
                <div className="mt-5 flex flex-wrap gap-3">
                  {latest?.status === "draft" ? (
                    <>
                      <GlowButton tone="blue" solid className="h-10 px-4 text-sm" onClick={() => show(latest)} data-testid="exercise-resume">
                        Resume
                      </GlowButton>
                      <GlowButton className="h-10 px-4 text-sm" onClick={() => void begin(exercise)} data-testid="exercise-restart">
                        Start over
                      </GlowButton>
                    </>
                  ) : submitted ? (
                    <>
                      <GlowButton tone="blue" solid className="h-10 px-4 text-sm" onClick={() => show(submitted)} data-testid="exercise-view">
                        View results
                      </GlowButton>
                      <GlowButton className="h-10 px-4 text-sm" onClick={() => void begin(exercise)} data-testid="exercise-retry">
                        Try again
                      </GlowButton>
                    </>
                  ) : (
                    <GlowButton tone="blue" solid className="h-10 px-4 text-sm" onClick={() => void begin(exercise)} data-testid="exercise-start">
                      Start
                    </GlowButton>
                  )}
                </div>
              </Panel>
            )
          })}
        </div>
      )}
    </div>
  )
}
