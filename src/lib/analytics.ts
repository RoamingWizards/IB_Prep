// Analytics for the front-page dashboard: track record and improvement over time, derived from every saved result.
// Pure functions with no browser APIs and no clock reads (`now` is always passed in). They only read records; nothing
// here changes a historical record, writes anything or touches the scheduler.
import type { RawResults, Evidence, EvidenceKind, EvidenceSource, ConceptMastery } from "./mastery.ts"
import { computeMastery, statementScore, valuationScore, MASTERY_MODEL, SOURCES } from "./mastery.ts"

export const DAY = 86_400_000

/** One saved result from any mode, whether or not it names a concept. */
export interface ActivityEvent {
  at: number
  source: EvidenceSource
  kind: EvidenceKind
  /** 0 to 1: a graded answer's score, or a flashcard rating's value. */
  score: number
  /** Set for right/wrong answers (multiple choice, Quick Maths); null otherwise. */
  correct: boolean | null
  title: string
  /** Short result text, for example "Correct", "73%" or "Good". */
  detail: string
}

export interface Titles {
  exercise: (exerciseId: string) => string | undefined
  process: (processId: string) => string | undefined
}

const RATING_LABEL = { again: "Again", hard: "Hard", good: "Good", easy: "Easy" } as const

/** Every saved result as an event, oldest first. Drafts and unsubmitted attempts are not events. */
export function extractActivity(raw: RawResults, titles: Titles): ActivityEvent[] {
  const out: ActivityEvent[] = []
  for (const a of raw.attempts) {
    out.push({
      at: a.at,
      source: "flashcard",
      kind: "self-rated",
      score: MASTERY_MODEL.flashcardScores[a.rating],
      correct: null,
      title: titles.exercise(a.exerciseId) ?? a.exerciseId,
      detail: RATING_LABEL[a.rating],
    })
  }
  for (const c of raw.choiceAttempts) {
    out.push({ at: c.at, source: "deal-walk", kind: "objective", score: c.correct ? 1 : 0, correct: c.correct, title: titles.process(c.processId) ?? c.processId, detail: c.correct ? "Correct" : "Incorrect" })
  }
  for (const s of raw.statementAttempts) {
    if (s.status !== "submitted" || !s.grade) continue
    const score = statementScore(s.grade)
    out.push({ at: s.submittedAt ?? s.updatedAt, source: "three-statements", kind: "objective", score, correct: null, title: s.snapshot.title, detail: `${Math.round(score * 100)}%` })
  }
  for (const v of raw.valuationAttempts) {
    if (v.status !== "submitted" || !v.grade) continue
    const score = valuationScore(v.grade)
    out.push({ at: v.submittedAt ?? v.updatedAt, source: "valuation", kind: "objective", score, correct: null, title: v.snapshot.title, detail: v.grade.perfect ? "Matched" : `${Math.round(score * 100)}%` })
  }
  for (const r of raw.quickMathResults) {
    out.push({ at: r.at, source: "quick-maths", kind: "objective", score: r.correct ? 1 : 0, correct: r.correct, title: `${r.category} · ${r.subcategory}`, detail: r.correct ? "Correct" : "Incorrect" })
  }
  return out.sort((a, b) => a.at - b.at)
}

// ---- Time helpers (local days) ----

/** Midnight at the start of the local day `offset` days before the day containing `now`. */
export function dayStart(now: number, offset = 0): number {
  const d = new Date(now)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - offset).getTime()
}

/** Monday 00:00 of the local week containing `now`, `weeksBack` weeks earlier. */
export function weekStart(now: number, weeksBack = 0): number {
  const d = new Date(now)
  const sinceMonday = (d.getDay() + 6) % 7
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - sinceMonday - 7 * weeksBack).getTime()
}

export interface Mean {
  count: number
  /** Mean score 0..1 over the events, or null when there are none. */
  mean: number | null
}

/** Mean score of events with `from <= at < to`, optionally only of one kind. */
export function meanScore(events: readonly ActivityEvent[], from: number, to: number, kind?: EvidenceKind): Mean {
  let n = 0
  let sum = 0
  for (const e of events) {
    if (e.at < from || e.at >= to || (kind && e.kind !== kind)) continue
    n++
    sum += e.score
  }
  return { count: n, mean: n > 0 ? sum / n : null }
}

/** Rolling 7-day mean scores ending at `now`, oldest first (null where nothing was answered that week). */
export function weeklyMeans(events: readonly ActivityEvent[], now: number, weeks: number, kind?: EvidenceKind): (number | null)[] {
  const out: (number | null)[] = []
  for (let k = weeks - 1; k >= 0; k--) out.push(meanScore(events, now - (k + 1) * 7 * DAY + 1, now - k * 7 * DAY + 1, kind).mean)
  return out
}

/** Results per local day for the last `days` days including today, oldest first. */
export function dailyCounts(events: readonly ActivityEvent[], now: number, days: number): number[] {
  const out = new Array<number>(days).fill(0)
  const first = dayStart(now, days - 1)
  for (const e of events) {
    if (e.at < first || e.at > now) continue
    const index = Math.floor((dayStart(e.at) - first) / (DAY * 0.9)) // tolerant of 23 and 25 hour days
    if (index >= 0 && index < days) out[index]++
  }
  return out
}

/** Results per weekday (Monday first) for this calendar week and the one before. */
export function weekdayCounts(events: readonly ActivityEvent[], now: number): { thisWeek: number[]; lastWeek: number[] } {
  const thisStart = weekStart(now, 0)
  const lastStart = weekStart(now, 1)
  const thisWeek = new Array<number>(7).fill(0)
  const lastWeek = new Array<number>(7).fill(0)
  for (const e of events) {
    if (e.at > now) continue
    const d = new Date(e.at)
    const weekday = (d.getDay() + 6) % 7
    if (e.at >= thisStart) thisWeek[weekday]++
    else if (e.at >= lastStart) lastWeek[weekday]++
  }
  return { thisWeek, lastWeek }
}

export interface Streak {
  /** Consecutive days with a result up to today (or up to yesterday if nothing yet today). */
  current: number
  best: number
  /** Distinct days with at least one result. */
  days: number
}

export function streaks(events: readonly ActivityEvent[], now: number): Streak {
  const days = new Set(events.filter((e) => e.at <= now).map((e) => dayStart(e.at)))
  const sorted = [...days].sort((a, b) => a - b)
  let best = 0
  let run = 0
  let previous: number | null = null
  for (const d of sorted) {
    run = previous !== null && Math.round((d - previous) / DAY) === 1 ? run + 1 : 1
    best = Math.max(best, run)
    previous = d
  }
  let current = 0
  let cursor = days.has(dayStart(now, 0)) ? 0 : 1
  while (days.has(dayStart(now, cursor))) {
    current++
    cursor++
  }
  return { current, best, days: days.size }
}

// ---- Mastery over time ----

export interface MasteryPoint {
  at: number
  /** Mean mastery score of the concepts studied by then, or null if none were. */
  average: number | null
  studied: number
  strong: number
  /** Mean over all concepts, counting concepts not yet studied as 0. */
  readiness: number
}

/** Concept mastery as it stood at weekly points ending at `now`, using only results saved by each point. */
export function masteryHistory(evidence: readonly Evidence[], conceptIds: readonly string[], now: number, weeks: number): MasteryPoint[] {
  const out: MasteryPoint[] = []
  for (let k = weeks; k >= 0; k--) {
    const at = now - k * 7 * DAY
    const upTo = evidence.filter((e) => e.at <= at)
    out.push(pointOf(computeMastery(upTo, conceptIds, at), at))
  }
  return out
}

export function pointOf(list: readonly ConceptMastery[], at: number): MasteryPoint {
  const studied = list.filter((m) => m.score !== null)
  const sum = studied.reduce((n, m) => n + (m.score ?? 0), 0)
  return {
    at,
    average: studied.length > 0 ? sum / studied.length : null,
    studied: studied.length,
    strong: list.filter((m) => m.level === "strong").length,
    readiness: list.length > 0 ? sum / list.length : 0,
  }
}

export const READINESS_BANDS = [
  { below: 0.25, label: "Just starting" },
  { below: 0.5, label: "Building" },
  { below: 0.75, label: "Solid" },
  { below: Number.POSITIVE_INFINITY, label: "Strong" },
] as const
export const readinessLabel = (value: number) => READINESS_BANDS.find((b) => value < b.below)!.label

// ---- By mode ----

export interface SourceStat {
  source: EvidenceSource
  kind: EvidenceKind
  count: number
  /** Mean score of all results from this mode, or null. */
  mean: number | null
  /** Weekly mean scores for the trend line, oldest first. */
  trend: (number | null)[]
}

export function sourceStats(events: readonly ActivityEvent[], now: number, weeks = 8): SourceStat[] {
  return SOURCES.flatMap((source) => {
    const own = events.filter((e) => e.source === source)
    if (own.length === 0) return []
    return [{ source, kind: own[0].kind, count: own.length, mean: own.reduce((n, e) => n + e.score, 0) / own.length, trend: weeklyMeans(own, now, weeks) }]
  })
}

/** Change in percentage points between two means, or null if either is missing. */
export const deltaPoints = (now: number | null, before: number | null) => (now === null || before === null ? null : (now - before) * 100)
