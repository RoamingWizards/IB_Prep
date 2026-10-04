// Shared concept mastery: one documented, deterministic calculation over saved results from every study mode.
// See docs/MASTERY.md. Pure functions with no browser APIs, so Node can check them and the future skill tree
// can import `computeMastery` and `MASTERY_MODEL` directly. Nothing here reads or writes storage, changes a
// historical record or touches the flashcard scheduler.
import type { Attempt, ChoiceAttempt, QuickMathResult, StatementAttempt, ValuationAttempt } from "./db"

/** Every constant of the calculation, in one place. Changing one changes `version`'s meaning: bump it. */
export const MASTERY_MODEL = {
  version: 1,
  /** Evidence loses half its weight every this many days, but never falls below `minRecencyWeight`. */
  halfLifeDays: 60,
  minRecencyWeight: 0.2,
  /** A self-rated item counts this much compared with an objectively graded one (1). */
  selfRatedWeight: 0.5,
  /** Every concept starts from this score worth `priorWeight` evidence items, so one result never means 0% or 100%. */
  priorScore: 0.5,
  priorWeight: 1,
  /** Score below this is Weak; at or above `strongAtLeast` (and the evidence gates) is Strong; in between is Developing. */
  weakBelow: 0.5,
  strongAtLeast: 0.8,
  /** Strong also needs this many evidence items in total and at least one objectively graded item. */
  strongMinEvidence: 3,
  /** What a flashcard rating is worth. */
  flashcardScores: { again: 0, hard: 0.35, good: 0.75, easy: 1 },
  /** Practice recommendations: evidence older than this many days counts as stale. */
  staleAfterDays: 30,
} as const

export type EvidenceSource = "flashcard" | "deal-walk" | "three-statements" | "valuation" | "quick-maths"
/** "self-rated": the learner judged themselves (flashcard ratings). "objective": the app graded an answer. */
export type EvidenceKind = "self-rated" | "objective"
export type MasteryLevel = "not-studied" | "weak" | "developing" | "strong"

export const SOURCE_LABEL: Record<EvidenceSource, string> = {
  flashcard: "Flashcards",
  "deal-walk": "Deal Walks",
  "three-statements": "Three Statements",
  valuation: "Valuation Builder",
  "quick-maths": "Quick Maths",
}
export const SOURCES = Object.keys(SOURCE_LABEL) as EvidenceSource[]
export const LEVEL_LABEL: Record<MasteryLevel, string> = {
  "not-studied": "Not studied",
  weak: "Weak",
  developing: "Developing",
  strong: "Strong",
}

/** One saved result expressed for one concept: a score from 0 to 1 and when it happened. */
export interface Evidence {
  conceptId: string
  source: EvidenceSource
  kind: EvidenceKind
  score: number
  at: number
  /** The exercise, question or stage the result came from, for traceability. */
  ref: string
}

export interface RawResults {
  attempts: readonly Attempt[] // flashcard ratings
  choiceAttempts: readonly ChoiceAttempt[] // Deal Walk stages
  statementAttempts: readonly StatementAttempt[]
  valuationAttempts: readonly ValuationAttempt[]
  quickMathResults: readonly QuickMathResult[]
}

export interface ExtractionReport {
  /** Results that could not be tied to any concept (removed exercises, generated Quick Maths questions). */
  unlinked: number
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

/** Three Statements: required changes done, penalised by unnecessary changes. Falls back to figures correct. */
export function statementScore(g: NonNullable<StatementAttempt["grade"]>): number {
  if (g.requiredChanges > 0) return clamp01(g.completed / (g.requiredChanges + g.unnecessary))
  return g.totalFigures > 0 ? clamp01(g.correctFigures / g.totalFigures) : 0
}

/** Valuation Builder: 1 for a match; otherwise right steps and connections minus wrong ones, over what was required. */
export function valuationScore(g: NonNullable<ValuationAttempt["grade"]>): number {
  if (g.perfect) return 1
  const required = g.requiredSteps + g.requiredEdges
  if (required === 0) return 0
  const wrong = g.incorrectEdges.length + g.distractorIds.length + g.extraStepIds.length
  return clamp01((g.correctSteps + g.correctEdges - wrong) / required)
}

/**
 * Turns saved results into per-concept evidence. `conceptsOfExercise` resolves a flashcard's exercise ID to its
 * concepts (flashcard records hold only the exercise ID). The other modes keep concept IDs in the record.
 */
export function extractEvidence(
  raw: RawResults,
  conceptsOfExercise: (exerciseId: string) => readonly string[] | undefined,
): { evidence: Evidence[]; report: ExtractionReport } {
  const evidence: Evidence[] = []
  let unlinked = 0
  const push = (conceptIds: readonly string[] | undefined, e: Omit<Evidence, "conceptId">) => {
    if (!conceptIds || conceptIds.length === 0) {
      unlinked++
      return
    }
    for (const conceptId of new Set(conceptIds)) evidence.push({ ...e, conceptId })
  }

  for (const a of raw.attempts) {
    push(conceptsOfExercise(a.exerciseId), {
      source: "flashcard",
      kind: "self-rated",
      score: MASTERY_MODEL.flashcardScores[a.rating],
      at: a.at,
      ref: a.exerciseId,
    })
  }
  for (const c of raw.choiceAttempts) {
    push(c.conceptIds, { source: "deal-walk", kind: "objective", score: c.correct ? 1 : 0, at: c.at, ref: `${c.processId}/${c.stageId}` })
  }
  for (const s of raw.statementAttempts) {
    if (s.status !== "submitted" || !s.grade) continue
    push(s.snapshot.conceptIds, { source: "three-statements", kind: "objective", score: statementScore(s.grade), at: s.submittedAt ?? s.updatedAt, ref: s.exerciseId })
  }
  for (const v of raw.valuationAttempts) {
    if (v.status !== "submitted" || !v.grade) continue
    push(v.snapshot.conceptIds, { source: "valuation", kind: "objective", score: valuationScore(v.grade), at: v.submittedAt ?? v.updatedAt, ref: v.exerciseId })
  }
  for (const r of raw.quickMathResults) {
    push(r.conceptIds, { source: "quick-maths", kind: "objective", score: r.correct ? 1 : 0, at: r.at, ref: r.questionId })
  }
  return { evidence, report: { unlinked } }
}

// ---- The calculation ----

export interface StreamSummary {
  count: number
  /** Recency-weighted mean score of this kind of evidence alone, or null when there is none. */
  score: number | null
}

export interface ConceptMastery {
  conceptId: string
  level: MasteryLevel
  /** Combined score 0..1 (after the prior), or null when there is no evidence: "Not studied". */
  score: number | null
  evidenceCount: number
  objective: StreamSummary
  selfRated: StreamSummary
  bySource: Record<EvidenceSource, number>
  lastEvidenceAt: number | null
  /** True when there is evidence but none of it is objectively graded. */
  selfRatedOnly: boolean
}

const DAY_MS = 86_400_000

/** Weight of one item from its age: halves every `halfLifeDays`, floored at `minRecencyWeight`. */
export function recencyWeight(at: number, now: number): number {
  const ageDays = Math.max(0, now - at) / DAY_MS
  return Math.max(MASTERY_MODEL.minRecencyWeight, Math.pow(0.5, ageDays / MASTERY_MODEL.halfLifeDays))
}

function stream(items: readonly Evidence[], now: number): StreamSummary {
  if (items.length === 0) return { count: 0, score: null }
  let sw = 0
  let sws = 0
  for (const e of items) {
    const w = recencyWeight(e.at, now)
    sw += w
    sws += w * e.score
  }
  return { count: items.length, score: sws / sw }
}

/** Mastery of one concept from its evidence. Order of the items does not matter. */
export function masteryOf(conceptId: string, items: readonly Evidence[], now: number): ConceptMastery {
  const bySource = Object.fromEntries(SOURCES.map((s) => [s, 0])) as Record<EvidenceSource, number>
  for (const e of items) bySource[e.source]++
  const objective = items.filter((e) => e.kind === "objective")
  const self = items.filter((e) => e.kind === "self-rated")
  const base = {
    conceptId,
    evidenceCount: items.length,
    objective: stream(objective, now),
    selfRated: stream(self, now),
    bySource,
    lastEvidenceAt: items.length > 0 ? Math.max(...items.map((e) => e.at)) : null,
    selfRatedOnly: items.length > 0 && objective.length === 0,
  }
  if (items.length === 0) return { ...base, level: "not-studied", score: null }

  let weight = MASTERY_MODEL.priorWeight
  let total = MASTERY_MODEL.priorWeight * MASTERY_MODEL.priorScore
  for (const e of items) {
    const w = recencyWeight(e.at, now) * (e.kind === "objective" ? 1 : MASTERY_MODEL.selfRatedWeight)
    weight += w
    total += w * e.score
  }
  const score = total / weight
  const strongEnough =
    score >= MASTERY_MODEL.strongAtLeast && items.length >= MASTERY_MODEL.strongMinEvidence && objective.length >= 1
  const level: MasteryLevel = score < MASTERY_MODEL.weakBelow ? "weak" : strongEnough ? "strong" : "developing"
  return { ...base, level, score }
}

/**
 * Mastery for every concept in `conceptIds`, in that order. Evidence for a concept not in the list is ignored.
 * `now` is a parameter (not read from the clock) so the same inputs always give the same answer.
 */
export function computeMastery(evidence: readonly Evidence[], conceptIds: readonly string[], now: number): ConceptMastery[] {
  const grouped = new Map<string, Evidence[]>()
  for (const e of evidence) {
    const list = grouped.get(e.conceptId)
    if (list) list.push(e)
    else grouped.set(e.conceptId, [e])
  }
  return conceptIds.map((id) => masteryOf(id, grouped.get(id) ?? [], now))
}

export interface MasterySummary {
  total: number
  counts: Record<MasteryLevel, number>
  /** Concepts with any evidence. */
  studied: number
  evidenceItems: number
}

export function summariseMastery(list: readonly ConceptMastery[]): MasterySummary {
  const counts: Record<MasteryLevel, number> = { "not-studied": 0, weak: 0, developing: 0, strong: 0 }
  let evidenceItems = 0
  for (const m of list) {
    counts[m.level]++
    evidenceItems += m.evidenceCount
  }
  return { total: list.length, counts, studied: list.length - counts["not-studied"], evidenceItems }
}

// ---- Recommendations ----

export interface Recommendation {
  conceptId: string
  /** Higher means more in need of practice. Weak and stale concepts rank above strong, recent ones. */
  need: number
  reason: "weak" | "stale" | "developing" | "not-studied" | "self-rated-only"
}

/** Need for a not-studied concept: below any Weak concept, above Developing ones with a decent score. */
const NOT_STUDIED_NEED = 0.5

/**
 * Concepts to practise next, most in need first. A concept qualifies if it is Weak, Developing, Not studied,
 * self-rated only, or Strong but stale. `canPractise` filters out concepts with no exercise to link to.
 * Ties break on concept ID, so the order is fully deterministic.
 */
export function recommendPractice(
  list: readonly ConceptMastery[],
  now: number,
  canPractise: (conceptId: string) => boolean = () => true,
): Recommendation[] {
  const out: Recommendation[] = []
  for (const m of list) {
    if (!canPractise(m.conceptId)) continue
    if (m.level === "not-studied") {
      out.push({ conceptId: m.conceptId, need: NOT_STUDIED_NEED, reason: "not-studied" })
      continue
    }
    const ageDays = m.lastEvidenceAt === null ? 0 : (now - m.lastEvidenceAt) / DAY_MS
    const stale = ageDays > MASTERY_MODEL.staleAfterDays
    const staleness = Math.min(0.3, Math.max(0, ageDays - MASTERY_MODEL.staleAfterDays) / 200)
    const need = 1 - (m.score ?? 0) + staleness
    if (m.level === "strong") {
      if (stale) out.push({ conceptId: m.conceptId, need, reason: "stale" })
      continue
    }
    const reason: Recommendation["reason"] = m.level === "weak" ? "weak" : m.selfRatedOnly ? "self-rated-only" : stale ? "stale" : "developing"
    out.push({ conceptId: m.conceptId, need, reason })
  }
  return out.sort((a, b) => b.need - a.need || (a.conceptId < b.conceptId ? -1 : 1))
}
