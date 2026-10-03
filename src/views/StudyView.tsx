import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Flashcard } from "@/components/Flashcard"
import { exercisesById, exercisesFor } from "@/content"
import type { ExerciseKind } from "@/content/types"
import {
  getAllCardStates,
  recordAttempt,
  type CardState,
  type Rating,
  type Session,
} from "@/lib/db"
import {
  buildPracticeQueue,
  buildQueue,
  countDue,
  nextState,
} from "@/lib/scheduler"

const LABEL: Record<ExerciseKind, string> = {
  question: "Questions",
  scenario: "Scenarios",
}

const emptyCounts = (): Record<Rating, number> => ({ again: 0, hard: 0, good: 0, easy: 0 })

export function StudyView({ kind }: { kind: ExerciseKind }) {
  const [states, setStates] = useState<Map<string, CardState> | null>(null)
  const [queue, setQueue] = useState<string[]>([])
  const [position, setPosition] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [done, setDone] = useState(0)
  const session = useRef<Session | null>(null)
  const saving = useRef(false)

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
    return () => {
      cancelled = true
    }
  }, [start])

  const currentId = queue[position]
  const exercise = currentId ? exercisesById.get(currentId) : undefined

  const grade = useCallback(
    async (rating: Rating) => {
      if (!exercise || !states || saving.current) return
      saving.current = true
      try {
        const now = Date.now()
        const state = nextState(exercise.id, states.get(exercise.id), rating, now)
        const s: Session = session.current ?? {
          id: crypto.randomUUID(),
          kind,
          startedAt: now,
          lastActivity: now,
          counts: emptyCounts(),
        }
        s.lastActivity = now
        s.counts = { ...s.counts, [rating]: s.counts[rating] + 1 }
        session.current = s
        await recordAttempt(
          state,
          { exerciseId: exercise.id, kind, rating, sessionId: s.id, at: now },
          s,
        )
        setStates(new Map(states).set(exercise.id, state))
        // Cards rated Again come back at the end of this session.
        if (rating === "again") setQueue((q) => [...q, exercise.id])
        setPosition((p) => p + 1)
        setDone((d) => d + 1)
        setRevealed(false)
      } finally {
        saving.current = false
      }
    },
    [exercise, states, kind],
  )
  const reveal = useCallback(() => setRevealed(true), [])

  if (!states) return null

  const remaining = queue.length - position
  const header = (
    <div className="mb-6 flex items-baseline justify-between">
      <h1 className="text-xl font-semibold">{LABEL[kind]}</h1>
      <p className="text-sm text-muted-foreground" data-testid="progress">
        {exercise ? `${remaining} left · ${done} done` : `${done} done`}
      </p>
    </div>
  )

  if (!exercise) {
    const ids = exercisesFor(kind).map((e) => e.id)
    const c = countDue(ids, states)
    return (
      <div>
        {header}
        <div className="rounded-lg border bg-card p-8" data-testid="queue-empty">
          <h2 className="font-serif text-xl font-semibold">
            {done > 0 ? "Session complete" : "Nothing due"}
          </h2>
          <p className="mt-2 max-w-[62ch] text-muted-foreground">
            {done > 0
              ? `You reviewed ${done} ${done === 1 ? "card" : "cards"}. Results are saved in History.`
              : "Every card is scheduled for later. You can still practise, weakest cards first."}
          </p>
          <div className="mt-6 flex gap-2">
            <Button onClick={() => start(true, states)}>Practise all cards</Button>
            {c.total > 0 && (
              <Button variant="outline" onClick={() => start(false, states)}>
                Review due cards
              </Button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      {header}
      <Flashcard
        key={`${exercise.id}-${position}`}
        exercise={exercise}
        revealed={revealed}
        onReveal={reveal}
        onGrade={grade}
      />
    </div>
  )
}
