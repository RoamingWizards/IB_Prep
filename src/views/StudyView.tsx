import { useCallback, useEffect, useRef, useState } from "react"
import { Flashcard } from "@/components/Flashcard"
import { GradeBar, type GradeFeedback } from "@/components/GradeBar"
import { GlowButton, Panel, ProgressBar, SlideStage, useSlideSequence } from "@/components/kit"
import { exercisesById, exercisesFor } from "@/content"
import type { ExerciseKind } from "@/content/types"
import {
  getAllCardStates,
  RATINGS,
  recordAttempt,
  type CardState,
  type Rating,
  type Session,
} from "@/lib/db"
import { buildPracticeQueue, buildQueue, countDue, nextState } from "@/lib/scheduler"

const LABEL: Record<ExerciseKind, string> = {
  question: "Questions",
  scenario: "Scenarios",
}

const emptyCounts = (): Record<Rating, number> => ({ again: 0, hard: 0, good: 0, easy: 0 })

function isTyping(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
}

export function StudyView({ kind }: { kind: ExerciseKind }) {
  const [states, setStates] = useState<Map<string, CardState> | null>(null)
  const [queue, setQueue] = useState<string[]>([])
  const [position, setPosition] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [done, setDone] = useState(0)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<GradeFeedback | null>(null)
  const session = useRef<Session | null>(null)
  const busyRef = useRef(false) // synchronous lock; state alone would lag behind rapid input
  const timers = useRef<number[]>([])
  const slide = useSlideSequence()

  const start = useCallback(
    (practice: boolean, loaded: Map<string, CardState>) => {
      const ids = exercisesFor(kind).map((e) => e.id)
      setStates(loaded)
      setQueue(practice ? buildPracticeQueue(ids, loaded) : buildQueue(ids, loaded))
      setPosition(0)
      setDone(0)
      setRevealed(false)
      session.current = null
    },
    [kind],
  )

  useEffect(() => {
    let cancelled = false
    getAllCardStates().then((loaded) => {
      if (!cancelled) start(false, loaded)
    })
    const pending = timers.current
    return () => {
      cancelled = true
      pending.forEach(window.clearTimeout)
    }
  }, [start])

  const currentId = queue[position]
  const exercise = currentId ? exercisesById.get(currentId) : undefined

  const reveal = useCallback(() => {
    if (!busyRef.current) setRevealed(true)
  }, [])
  const hide = useCallback(() => {
    if (!busyRef.current) setRevealed(false)
  }, [])

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

  // Space reveals; 1-4 grade. Never while typing in a field.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat || isTyping(e.target)) return
      if (e.code === "Space") {
        if ((e.target as HTMLElement | null)?.closest?.("[data-native-space]")) return
        e.preventDefault()
        reveal()
      } else if (revealed && /^[1-4]$/.test(e.key)) {
        void submit(RATINGS[Number(e.key) - 1])
      }
    }
    // Space activates a focused button on keyup; stop that so it can't also click.
    function onKeyUp(e: KeyboardEvent) {
      if (e.code !== "Space" || isTyping(e.target)) return
      if ((e.target as HTMLElement | null)?.closest?.("[data-native-space]")) return
      e.preventDefault()
    }
    window.addEventListener("keydown", onKeyDown)
    window.addEventListener("keyup", onKeyUp)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("keyup", onKeyUp)
    }
  }, [revealed, reveal, submit])

  if (!states) return null

  const remaining = queue.length - position

  if (!exercise) {
    const ids = exercisesFor(kind).map((e) => e.id)
    const c = countDue(ids, states)
    return (
      <div className="m-auto w-full max-w-xl" data-testid="queue-empty">
        <Panel glow="blue" className="p-8">
          <h1 className="font-serif text-2xl font-semibold">
            {done > 0 ? "Session complete" : "Nothing due"}
          </h1>
          <p className="mt-2 text-muted-foreground">
            {done > 0
              ? `You reviewed ${done} ${done === 1 ? "card" : "cards"}. Results are saved in History.`
              : "Every card is scheduled for later. You can still practise, weakest cards first."}
          </p>
          <div className="mt-6 flex gap-3">
            <GlowButton tone="blue" solid className="h-10 px-4" onClick={() => start(true, states)}>
              Practise all cards
            </GlowButton>
            {c.total > 0 && (
              <GlowButton className="h-10 px-4" onClick={() => start(false, states)}>
                Review due cards
              </GlowButton>
            )}
          </div>
        </Panel>
      </div>
    )
  }

  const total = done + remaining

  return (
    <div className="flex flex-1 flex-col gap-5">
      <header className="space-y-3">
        <div className="flex items-baseline justify-between gap-4">
          <p className="flex items-center gap-2 text-sm font-medium">
            <span className="size-2 rounded-full bg-primary shadow-[0_0_10px_var(--primary)]" aria-hidden />
            {exercise.topic}
            <span className="font-normal text-muted-foreground">{LABEL[kind]}</span>
          </p>
          <p className="text-sm text-muted-foreground tabular-nums" data-testid="progress">
            Card {done + 1} of {total}
          </p>
        </div>
        <ProgressBar value={done} max={total} label={`${LABEL[kind]} progress`} />
      </header>

      <SlideStage
        stageRef={slide.stageRef}
        phase={slide.phase}
        itemKey={`${exercise.id}-${position}`}
        className="min-h-[24rem] flex-1"
      >
        <Flashcard exercise={exercise} revealed={revealed} onReveal={reveal} onHide={hide} />
      </SlideStage>

      <GradeBar disabled={!revealed || busy} feedback={feedback} onGrade={(r) => void submit(r)} />
    </div>
  )
}
