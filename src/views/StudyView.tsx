import { useCallback, useEffect, useRef, useState } from "react"
import { ListFilter } from "lucide-react"
import { Flashcard } from "@/components/Flashcard"
import { GradeBar, type GradeFeedback } from "@/components/GradeBar"
import { SessionFilters } from "@/components/SessionFilters"
import { GlowButton, Panel, ProgressBar, SlideStage, useSlideSequence } from "@/components/kit"
import { FLIP_MS, prefersReducedMotion } from "@/components/kit/motion"
import { useContent } from "@/content/contentContext"
import type { ExerciseKind } from "@/content/types"
import {
  getAllCardStates,
  recordAttempt,
  type CardState,
  type Rating,
  type Session,
} from "@/lib/db"
import { useShortcutHandlers } from "@/lib/keybindsContext"
import { nextState } from "@/lib/scheduler"
import {
  activeFilterCount,
  buildSelectionQueue,
  DEFAULT_SELECTION,
  loadSelection,
  sanitizeSelection,
  topicTree,
  masteryCounts,
  saveSelection,
  type Selection,
} from "@/lib/selection"

const LABEL: Record<ExerciseKind, string> = {
  question: "Questions",
  scenario: "Scenarios",
}

const emptyCounts = (): Record<Rating, number> => ({ again: 0, hard: 0, good: 0, easy: 0 })

/** `preset` is a topic chosen by a link from another screen: used for this visit and never saved. */
export function StudyView({ kind, preset }: { kind: ExerciseKind; preset?: Selection }) {
  const { exercisesFor, exercisesById } = useContent()
  const [states, setStates] = useState<Map<string, CardState> | null>(null)
  const [queue, setQueue] = useState<string[]>([])
  const [position, setPosition] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [done, setDone] = useState(0)
  const [busy, setBusy] = useState(false)
  const [selection, setSelection] = useState<Selection>(DEFAULT_SELECTION)
  const [panelOpen, setPanelOpen] = useState(false)
  const [feedback, setFeedback] = useState<GradeFeedback | null>(null)
  const session = useRef<Session | null>(null)
  const busyRef = useRef(false) // synchronous lock; state alone would lag behind rapid input
  const flipLock = useRef(false) // true while a flip animation is running
  const timers = useRef<number[]>([])
  const slide = useSlideSequence()
  const presetRef = useRef(preset)

  /** (Re)builds the queue for a selection and starts a fresh session. */
  const begin = useCallback(
    (sel: Selection, loaded: Map<string, CardState>) => {
      setStates(loaded)
      setQueue(buildSelectionQueue(exercisesFor(kind), sel, loaded))
      setPosition(0)
      setDone(0)
      setRevealed(false)
      session.current = null
    },
    [kind, exercisesFor],
  )

  useEffect(() => {
    let cancelled = false
    Promise.all([
      getAllCardStates(),
      presetRef.current ? Promise.resolve(sanitizeSelection(presetRef.current, topicTree(exercisesFor(kind)))) : loadSelection(kind, exercisesFor(kind)),
    ]).then(([loaded, sel]) => {
      if (cancelled) return
      setSelection(sel)
      begin(sel, loaded)
    })
    const pending = timers.current
    return () => {
      cancelled = true
      pending.forEach(window.clearTimeout)
    }
  }, [begin, kind, exercisesFor])

  const applySelection = useCallback(
    (sel: Selection) => {
      if (!states || busyRef.current) return
      setSelection(sel)
      void saveSelection(kind, sel)
      setPanelOpen(false)
      begin(sel, states)
    },
    [states, kind, begin],
  )

  const currentId = queue[position]
  const exercise = currentId ? exercisesById.get(currentId) : undefined

  /** Flips the card either way. Ignored during a grading transition or while another flip is running. */
  const toggleFlip = useCallback(() => {
    if (!exercise || busyRef.current || flipLock.current) return
    flipLock.current = true
    timers.current.push(
      window.setTimeout(() => {
        flipLock.current = false
      }, prefersReducedMotion() ? 180 : FLIP_MS + 30),
    )
    setRevealed((r) => !r)
  }, [exercise])
  // The question face's click and the answer face's "Show question" each only make sense one way.
  const reveal = useCallback(() => {
    if (!revealed) toggleFlip()
  }, [revealed, toggleFlip])
  const hide = useCallback(() => {
    if (revealed) toggleFlip()
  }, [revealed, toggleFlip])

  /** Saves the rating once, then slides to the next card. Ignored while a transition runs. */
  const submit = useCallback(
    async (rating: Rating) => {
      if (!exercise || !states || !revealed || busyRef.current) return
      busyRef.current = true
      setBusy(true)

      // Same visual feedback whether the rating came from the mouse or the keyboard.
      setFeedback({ rating, flash: true, pressed: true })
      timers.current.push(
        window.setTimeout(() => setFeedback((f) => f && { ...f, pressed: false }), 140),
        window.setTimeout(() => setFeedback(null), 480),
      )

      try {
        const now = Date.now()
        const state = nextState(exercise.id, states.get(exercise.id), rating, now)
        const prev: Session = session.current ?? {
          id: crypto.randomUUID(),
          kind,
          startedAt: now,
          lastActivity: now,
          counts: emptyCounts(),
        }
        const s: Session = {
          ...prev,
          lastActivity: now,
          counts: { ...prev.counts, [rating]: prev.counts[rating] + 1 },
        }
        session.current = s
        await recordAttempt(
          state,
          { exerciseId: exercise.id, kind, rating, sessionId: s.id, at: now },
          s,
        )
        await slide.run(() => {
          setStates(new Map(states).set(exercise.id, state))
          // Cards rated Again come back at the end of this session.
          if (rating === "again") setQueue((q) => [...q, exercise.id])
          setPosition((p) => p + 1)
          setDone((d) => d + 1)
          setRevealed(false)
        })
      } catch (err) {
        console.error("Could not save rating", err)
      } finally {
        busyRef.current = false
        setBusy(false)
      }
    },
    [exercise, states, revealed, kind, slide],
  )

  // Shortcuts come from the shared handler (see KeybindsProvider), using the user's bindings.
  // They pause while the session options panel is open.
  useShortcutHandlers({
    flip: () => !panelOpen && toggleFlip(),
    again: () => !panelOpen && void submit("again"),
    hard: () => !panelOpen && void submit("hard"),
    good: () => !panelOpen && void submit("good"),
    easy: () => !panelOpen && void submit("easy"),
  })

  if (!states) return null

  const exercises = exercisesFor(kind)
  const remaining = queue.length - position
  const total = done + remaining
  const activeFilters = activeFilterCount(selection)

  const filtersButton = (
    <GlowButton
      className="h-8 gap-1.5 px-3 text-sm"
      data-testid="filters-button"
      aria-haspopup="dialog"
      aria-expanded={panelOpen}
      disabled={busy}
      onClick={() => setPanelOpen((o) => !o)}
      onMouseUp={(e) => e.currentTarget.blur()}
    >
      <ListFilter className="size-4" aria-hidden />
      Filters
      {activeFilters > 0 && (
        <span className="rounded-full bg-primary/25 px-1.5 text-xs text-[var(--accent-text)]" data-testid="filters-count">
          {activeFilters}
        </span>
      )}
    </GlowButton>
  )

  const header = (
    <header className="relative z-20 shrink-0 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="flex min-w-0 items-center gap-2 text-sm font-medium">
          <span className="size-2 shrink-0 rounded-full bg-primary shadow-[0_0_10px_var(--primary)]" aria-hidden />
          {exercise ? (
            <span className="truncate">
              {exercise.category}
              <span className="font-normal text-muted-foreground">
                {"  "}
                {exercise.subcategory} · {LABEL[kind]}
              </span>
            </span>
          ) : (
            LABEL[kind]
          )}
        </p>
        <div className="flex items-center gap-4">
          {exercise && (
            <p className="text-sm text-muted-foreground tabular-nums" data-testid="progress">
              Card {done + 1} of {total}
            </p>
          )}
          {filtersButton}
        </div>
      </div>
      {exercise && <ProgressBar value={done} max={total} label={`${LABEL[kind]} progress`} />}
      {panelOpen && (
        <SessionFilters
          exercises={exercises}
          states={states}
          selection={selection}
          onApply={applySelection}
          onClose={() => setPanelOpen(false)}
        />
      )}
    </header>
  )

  if (!exercise) {
    const counts = masteryCounts(exercises, selection, states)
    return (
      <div className="flex h-full min-h-0 flex-col gap-4">
        {header}
        <div className="m-auto w-full max-w-xl" data-testid="queue-empty">
          <Panel glow="blue" className="p-8">
            <h1 className="font-serif text-2xl font-semibold">
              {done > 0 ? "Session complete" : selection.mastery === "due" ? "Nothing due" : "No cards match"}
            </h1>
            <p className="mt-2 text-muted-foreground">
              {done > 0
                ? `You reviewed ${done} ${done === 1 ? "card" : "cards"}. Results are saved in History.`
                : selection.mastery === "due"
                  ? "Every card in this selection is scheduled for later. You can still practise, weakest cards first."
                  : "No cards fit these filters. Change the topic or mastery filter to see more."}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <GlowButton
                tone="blue"
                solid
                className="h-10 px-4"
                onClick={() => applySelection({ ...selection, mastery: "all" })}
              >
                Practise all cards
              </GlowButton>
              {counts.due > 0 && (
                <GlowButton className="h-10 px-4" onClick={() => applySelection({ ...selection, mastery: "due" })}>
                  Review due cards
                </GlowButton>
              )}
              <GlowButton className="h-10 px-4" onClick={() => setPanelOpen(true)}>
                Change filters
              </GlowButton>
            </div>
          </Panel>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      {header}

      <SlideStage
        stageRef={slide.stageRef}
        phase={slide.phase}
        itemKey={`${exercise.id}-${position}`}
        className="min-h-0 flex-1"
      >
        <Flashcard exercise={exercise} revealed={revealed} onReveal={reveal} onHide={hide} />
      </SlideStage>

      <GradeBar disabled={!revealed || busy} feedback={feedback} onGrade={(r) => void submit(r)} />
    </div>
  )
}
