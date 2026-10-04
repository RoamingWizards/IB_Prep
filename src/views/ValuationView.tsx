import { useCallback, useEffect, useState } from "react"
import { GlowButton, Panel } from "@/components/kit"
import { ValuationRunner } from "@/components/ValuationRunner"
import { useContent } from "@/content/contentContext"
import type { ValuationExercise } from "@/content/types"
import {
  discardValuationDrafts,
  getMeta,
  getValuationAttempt,
  getValuationAttempts,
  setMeta,
  type ValuationAttempt,
} from "@/lib/db"
import { shuffled } from "@/lib/walks"

const CURRENT_KEY = "valuation:current"
const fmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })

function newAttempt(exercise: ValuationExercise): ValuationAttempt {
  const now = Date.now()
  return {
    id: crypto.randomUUID(),
    exerciseId: exercise.id,
    startedAt: now,
    updatedAt: now,
    // A copy, so later updates to the exercise never change this attempt.
    snapshot: structuredClone(exercise),
    bankOrder: shuffled(exercise.steps.map((s) => s.id)), // shuffled once per attempt
    placed: {},
    edges: [],
    status: "draft",
  }
}

export function ValuationView() {
  const { bank } = useContent()
  const [attempts, setAttempts] = useState<ValuationAttempt[] | null>(null)
  const [open, setOpen] = useState<{ attempt: ValuationAttempt; persisted: boolean } | null>(null)
  const [loaded, setLoaded] = useState(false)

  // On opening, return to an unfinished attempt that was open when the app last closed.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [all, currentId] = await Promise.all([getValuationAttempts(), getMeta<string | null>(CURRENT_KEY)])
      const current = typeof currentId === "string" && currentId ? await getValuationAttempt(currentId) : undefined
      if (cancelled) return
      setAttempts(all)
      if (current && current.status === "draft") setOpen({ attempt: current, persisted: true })
      setLoaded(true)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const refresh = useCallback(async () => setAttempts(await getValuationAttempts()), [])

  const show = useCallback((attempt: ValuationAttempt | null, persisted = true) => {
    setOpen(attempt ? { attempt, persisted } : null)
    void setMeta(CURRENT_KEY, attempt ? attempt.id : null)
  }, [])

  const begin = useCallback(
    async (exercise: ValuationExercise) => {
      await discardValuationDrafts(exercise.id) // one unfinished attempt per exercise
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
    const live = bank.valuationExercises.find((e) => e.id === attempt.exerciseId)
    return (
      <ValuationRunner
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
    <div className="mx-auto w-full max-w-5xl space-y-6" data-testid="valuation-selector">
      <div>
        <h1 className="font-serif text-2xl font-semibold">Valuation Builder</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose the steps of a valuation process, arrange them as bubbles and connect what depends on what.
        </p>
      </div>

      {bank.valuationExercises.length === 0 ? (
        <Panel className="p-6">
          <p className="text-muted-foreground" data-testid="valuation-empty">
            No exercises yet. Import a content pack that includes valuation exercises in Settings → Content.
          </p>
        </Panel>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {bank.valuationExercises.map((exercise) => {
            const mine = attempts.filter((a) => a.exerciseId === exercise.id)
            const latest = mine[0] // newest first
            const submitted = mine.find((a) => a.status === "submitted")
            return (
              <Panel key={exercise.id} className="flex flex-col p-6" data-testid="exercise-card" data-exercise-id={exercise.id}>
                <p className="text-sm text-muted-foreground">
                  {exercise.category} · {exercise.subcategory}
                </p>
                <h2 className="mt-1 font-serif text-xl font-semibold">{exercise.title}</h2>
                <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{exercise.task}</p>
                <p className="mt-3 text-sm text-muted-foreground" data-testid="exercise-status">
                  {exercise.steps.length} steps · {exercise.distractors.length} do not belong
                  {latest?.status === "draft"
                    ? " · Unfinished attempt"
                    : latest?.grade
                      ? ` · Last attempt ${latest.grade.perfect ? "matched a solution" : `${latest.grade.correctSteps} of ${latest.grade.requiredSteps} steps and ${latest.grade.correctEdges} of ${latest.grade.requiredEdges} connections`} (${fmt.format(latest.submittedAt ?? latest.updatedAt)})`
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
                      {submitted && (
                        <GlowButton className="h-10 px-4 text-sm" onClick={() => show(submitted)} data-testid="exercise-view">
                          View last results
                        </GlowButton>
                      )}
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
