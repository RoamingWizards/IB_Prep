// A small SM-2 style scheduler and a review queue that puts weak and new cards first.
import type { CardState, Rating } from "./db"

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE
const MIN_EASE = 1.3

export function nextState(
  exerciseId: string,
  prev: CardState | undefined,
  rating: Rating,
  now = Date.now(),
): CardState {
  const reps = prev?.reps ?? 0
  const lapses = prev?.lapses ?? 0
  let ease = prev?.ease ?? 2.5
  const interval = prev?.intervalDays ?? 0

  let intervalDays: number
  let due: number
  switch (rating) {
    case "again":
      ease = Math.max(MIN_EASE, ease - 0.2)
      intervalDays = 0
      due = now + MINUTE
      return { exerciseId, reps: 0, lapses: lapses + 1, ease, intervalDays, due, lastRating: rating, lastReviewed: now }
    case "hard":
      ease = Math.max(MIN_EASE, ease - 0.15)
      intervalDays = reps === 0 ? 0.5 : Math.max(1, interval * 1.2)
      break
    case "good":
      intervalDays = reps === 0 ? 1 : reps === 1 ? 3 : interval * ease
      break
    case "easy":
      ease += 0.15
      intervalDays = reps === 0 ? 3 : Math.max(4, interval * ease * 1.3)
      break
  }
  due = now + intervalDays * DAY
  return { exerciseId, reps: reps + 1, lapses, ease, intervalDays, due, lastRating: rating, lastReviewed: now }
}

export function isWeak(s: CardState): boolean {
  return s.lastRating === "again" || s.lastRating === "hard"
}

/**
 * Builds the review queue for a deck:
 *   1. due cards last rated Again/Hard (weakest first)
 *   2. new cards, in content order
 *   3. other due cards, most overdue first
 * Cards not yet due are left out.
 */
export function buildQueue(
  ids: string[],
  states: Map<string, CardState>,
  now = Date.now(),
): string[] {
  const weak: CardState[] = []
  const fresh: string[] = []
  const due: CardState[] = []
  for (const id of ids) {
    const s = states.get(id)
    if (!s) fresh.push(id)
    else if (s.due <= now) (isWeak(s) ? weak : due).push(s)
  }
  weak.sort((a, b) => a.ease - b.ease || a.due - b.due)
  due.sort((a, b) => a.due - b.due)
  return [...weak.map((s) => s.exerciseId), ...fresh, ...due.map((s) => s.exerciseId)]
}

/** All cards, weakest first. Used for optional extra practice once nothing is due. */
export function buildPracticeQueue(ids: string[], states: Map<string, CardState>): string[] {
  const score = (id: string) => {
    const s = states.get(id)
    if (!s) return -Infinity
    return (isWeak(s) ? 0 : 10) + s.ease
  }
  return [...ids].sort((a, b) => score(a) - score(b))
}

export function countDue(ids: string[], states: Map<string, CardState>, now = Date.now()) {
  let fresh = 0
  let weak = 0
  let due = 0
  for (const id of ids) {
    const s = states.get(id)
    if (!s) fresh++
    else if (s.due <= now) {
      if (isWeak(s)) weak++
      else due++
    }
  }
  return { fresh, weak, due, total: fresh + weak + due }
}
