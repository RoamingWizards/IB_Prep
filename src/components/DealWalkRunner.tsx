import { useCallback, useMemo, useRef, useState } from "react"
import { ArrowLeft, Check, X } from "lucide-react"
import { GlowButton, Panel, ProgressBar, SlideStage, useSlideSequence } from "@/components/kit"
import { MultipleChoice } from "@/components/MultipleChoice"
import { useContent } from "@/content/contentContext"
import type { Process } from "@/content/types"
import { saveWalk, submitStage, type Walk } from "@/lib/db"
import { useShortcutHandlers } from "@/lib/keybindsContext"
import { reconcileOrder, shuffled, walkScore } from "@/lib/walks"

interface Props {
  process: Process
  initialWalk: Walk
  /** Back to the process list. */
  onExit: () => void
  /** Start a fresh walk of the same process. */
  onRestart: () => void
}

/** Runs one Deal Walk: one multiple-choice question per stage, then a final score. */
export function DealWalkRunner({ process, initialWalk, onExit, onRestart }: Props) {
  const { choicesById } = useContent()
  const [walk, setWalk] = useState(initialWalk)
  const [selected, setSelected] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const lock = useRef(false) // blocks a second submit or next while one is still being saved
  const slide = useSlideSequence()

  const total = process.stages.length
  const finished = walk.stageIndex >= total
  const stage = finished ? undefined : process.stages[walk.stageIndex]
  const choice = stage ? choicesById.get(stage.choiceId) : undefined
  const result = stage ? walk.results[stage.id] : undefined
  const storedOrder = stage ? walk.order[stage.id] : undefined

  // A stage's options are shuffled once, when the stage is first shown, and kept with the walk (see `start`
  // and `next`). Only a walk resumed after its process gained a stage has no stored order; for that case a
  // shuffle is made once here and saved when the answer is submitted.
  const fallbackOrder = useMemo(
    () => (choice && !storedOrder ? shuffled(choice.options.map((o) => o.id)) : undefined),
    [choice, storedOrder],
  )
  const order = storedOrder ?? fallbackOrder

  const options = useMemo(() => {
    if (!choice || !order) return []
    const byId = new Map(choice.options.map((o) => [o.id, o]))
    return reconcileOrder(
      order,
      choice.options.map((o) => o.id),
    ).flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []))
  }, [choice, order])

  const shownSelection = result ? result.selectedOptionId : selected

  const select = useCallback(
    (optionId: string) => {
      if (!result) setSelected(optionId)
    },
    [result],
  )

  const submit = useCallback(async () => {
    if (!stage || !choice || result || !selected || lock.current) return
    lock.current = true
    setError(null)
    try {
      if (!storedOrder && order) await saveWalk({ ...walk, order: { ...walk.order, [stage.id]: order }, updatedAt: Date.now() })
      const outcome = await submitStage(
        walk.sessionId,
        {
          processId: process.id,
          stageId: stage.id,
          choiceId: choice.id,
          conceptIds: choice.conceptIds,
          selectedOptionId: selected,
          correct: selected === choice.correctOptionId,
          at: Date.now(),
        },
        total,
      )
      // A duplicate means this stage was already saved; show what is stored instead of writing again.
      if (outcome) setWalk(outcome.walk)
    } catch (err) {
      console.error("Could not save the result", err)
      setError("The result could not be saved. Try submitting again.")
    } finally {
      lock.current = false
    }
  }, [stage, choice, result, selected, storedOrder, order, walk, process.id, total])

  const next = useCallback(async () => {
    if (!result || lock.current) return
    lock.current = true
    try {
      const index = walk.stageIndex + 1
      const updated: Walk = { ...walk, stageIndex: index, updatedAt: Date.now() }
      const upcoming = index < total ? choicesById.get(process.stages[index].choiceId) : undefined
      if (upcoming) updated.order = { ...walk.order, [process.stages[index].id]: shuffled(upcoming.options.map((o) => o.id)) }
      await saveWalk(updated)
      await slide.run(() => {
        setWalk(updated)
        setSelected(null)
      })
    } catch (err) {
      console.error("Could not move to the next stage", err)
      setError("Could not move to the next stage. Try again.")
    } finally {
      lock.current = false
    }
  }, [result, walk, total, process.stages, choicesById, slide])

  const advance = useCallback(() => {
    if (finished) return
    if (result) void next()
    else void submit()
  }, [finished, result, next, submit])

  useShortcutHandlers({
    choiceA: () => options[0] && select(options[0].id),
    choiceB: () => options[1] && select(options[1].id),
    choiceC: () => options[2] && select(options[2].id),
    choiceD: () => options[3] && select(options[3].id),
    choiceE: () => options[4] && select(options[4].id),
    choiceContinue: advance,
  })

  const score = walkScore(walk, process)

  const header = (
    <header className="shrink-0 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="flex min-w-0 items-center gap-2 text-sm font-medium">
          <span className="size-2 shrink-0 rounded-full bg-primary shadow-[0_0_10px_var(--primary)]" aria-hidden />
          <span className="truncate">
            {process.title}
            <span className="font-normal text-muted-foreground"> · Deal Walk</span>
          </span>
        </p>
        <div className="flex items-center gap-4">
          <p className="text-sm text-muted-foreground tabular-nums" data-testid="walk-progress">
            {finished ? `${total} of ${total} stages` : `Stage ${walk.stageIndex + 1} of ${total}`}
          </p>
          <GlowButton className="h-8 gap-1.5 px-3 text-sm" onClick={onExit} onMouseUp={(e) => e.currentTarget.blur()} data-testid="walk-exit">
            <ArrowLeft className="size-4" aria-hidden />
            All processes
          </GlowButton>
        </div>
      </div>
      <ProgressBar value={score.answered} max={total} label="Deal walk progress" />
    </header>
  )

  let body
  if (finished) {
    body = (
      <div className="study-card flex h-full flex-col overflow-y-auto px-6 py-8 sm:px-10" data-testid="walk-score">
        <div className="mx-auto w-full max-w-2xl">
          <h1 className="font-serif text-3xl font-semibold">Deal walk complete</h1>
          <p className="mt-2 text-lg" data-testid="walk-score-text">
            You scored {score.correct} out of {score.total}.
          </p>
          <ul className="mt-6 divide-y divide-white/[0.07] rounded-xl border border-white/[0.07] bg-black/15">
            {process.stages.map((s, i) => {
              const r = walk.results[s.id]
              return (
                <li key={s.id} className="flex items-center gap-3 px-4 py-3 text-sm" data-testid="walk-score-row">
                  {r?.correct ? (
                    <Check className="size-4 shrink-0 text-grade-easy" aria-label="Correct" />
                  ) : (
                    <X className="size-4 shrink-0 text-grade-again" aria-label={r ? "Incorrect" : "Not answered"} />
                  )}
                  <span className="text-muted-foreground tabular-nums">{i + 1}.</span>
                  <span>{s.title}</span>
                </li>
              )
            })}
          </ul>
          <p className="mt-4 text-sm text-muted-foreground">Results are saved in History.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <GlowButton tone="blue" solid className="h-10 px-4" onClick={onRestart}>
              Walk again
            </GlowButton>
            <GlowButton className="h-10 px-4" onClick={onExit}>
              All processes
            </GlowButton>
          </div>
        </div>
      </div>
    )
  } else if (!stage || !choice) {
    body = (
      <Panel className="m-auto w-full max-w-xl p-8" data-testid="walk-missing">
        <h1 className="font-serif text-xl font-semibold">This stage is unavailable</h1>
        <p className="mt-2 text-muted-foreground">Its question is no longer in the content. Return to the process list to start again.</p>
      </Panel>
    )
  } else if (options.length === 0) {
    body = null // the option order is being created and saved
  } else {
    body = (
      <MultipleChoice
        context={`Stage ${walk.stageIndex + 1} of ${total} · ${stage.title}`}
        prompt={choice.prompt}
        options={options}
        selectedId={shownSelection}
        onSelect={select}
        submitted={!!result}
        correctOptionId={choice.correctOptionId}
        explanation={choice.explanation}
        onSubmit={() => void submit()}
        onNext={() => void next()}
        nextLabel={walk.stageIndex + 1 >= total ? "See score" : "Next stage"}
      />
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      {header}
      {error && (
        <p role="alert" className="shrink-0 text-sm text-destructive" data-testid="walk-error">
          {error}
        </p>
      )}
      <SlideStage
        stageRef={slide.stageRef}
        phase={slide.phase}
        itemKey={`${walk.sessionId}-${walk.stageIndex}`}
        className="min-h-0 flex-1"
      >
        {body}
      </SlideStage>
    </div>
  )
}
