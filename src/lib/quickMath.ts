// Quick Maths logic with no presentation: reading typed answers, grading, building a session from
// generated and authored questions, and summarising results. No browser APIs, so Node can check it.
import type { Difficulty, QuickMathQuestion } from "../content/types.ts"
import { clean, GENERATED_CATEGORIES, TEMPLATES, seededRng, type Rng, type Template } from "./quickMathGen.ts"

export const SESSION_LENGTHS = [5, 10, 20] as const
export type SessionLength = (typeof SESSION_LENGTHS)[number]
export type Mode = "untimed" | "timed"
export const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"]

export { GENERATED_CATEGORIES }

// ---- Reading answers ----

export type ParsedAnswer = { kind: "blank" } | { kind: "invalid" } | { kind: "number"; value: number }

/**
 * Reads typed text as a number. Accepts "1,234.5", "-7.5", "(7.5)", "−7.5", a leading "+" or "$", and a
 * trailing "%" or "x" (the unit shown beside the box). Anything else is "invalid"; empty text is "blank".
 * Neither of those is an answer, so neither is ever recorded.
 */
export function parseAnswer(text: string): ParsedAnswer {
  let t = text.trim().replace(/−/g, "-")
  if (t === "") return { kind: "blank" }
  t = t.replace(/^\$\s*/, "").replace(/\s*(%|x|bps)$/i, "")
  if (/\s/.test(t)) return { kind: "invalid" } // "5 5" is not 55
  let negative = false
  const paren = /^\((.*)\)$/.exec(t)
  if (paren) {
    negative = true
    t = paren[1]
  }
  // Thousands separators must group digits in threes ("1,234.5"), so "1,2" or "1,23,4" are rejected.
  if (/,/.test(t)) {
    if (!/^[+-]?\d{1,3}(,\d{3})+(\.\d*)?$/.test(t)) return { kind: "invalid" }
    t = t.replace(/,/g, "")
  }
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(t)) return { kind: "invalid" }
  const n = Number(t)
  if (!Number.isFinite(n)) return { kind: "invalid" }
  return { kind: "number", value: negative ? -n : n }
}

/** Correct if within `tolerance` of the answer. Tolerance 0 means an exact match (allowing only float noise). */
export function isCorrect(value: number, answer: number, tolerance: number): boolean {
  const slack = tolerance > 0 ? tolerance : 0
  const noise = 1e-9 * Math.max(1, Math.abs(answer))
  return Math.abs(value - answer) <= slack + noise
}

// ---- Session questions ----

/** A question as a session holds it: a full copy, including the generated values and the answer. */
export interface SessionQuestion {
  key: string // "n0", "n1", … unique within the session
  source: "generated" | "authored"
  id: string // authored: the "qm-…" ID. generated: "gen-<template>-<seed>"
  category: string
  subcategory: string
  difficulty: Difficulty
  conceptIds: string[]
  prompt: string
  assumptions?: { label: string; value: string }[]
  rounding?: string
  answer: number
  units?: string
  tolerance: number
  explanation: string
}

export interface Selection {
  category: string | null // null = all categories
  difficulty: Difficulty | null // null = all difficulties
  length: SessionLength
  mode: Mode
}

/** Where the last Quick Maths setup choices are kept (IndexedDB meta). The dashboard also writes it to open a category. */
export const QUICK_MATH_SELECTION_KEY = "quickMath:selection"

export const DEFAULT_SELECTION: Selection = { category: null, difficulty: null, length: 10, mode: "untimed" }

/** Share of a session that hand-authored questions may take when generated ones are also available. */
const AUTHORED_SHARE = 0.4

const templatesFor = (category: string | null): Template[] =>
  TEMPLATES.filter((t) => category === null || t.category === category)

const authoredFor = (bank: readonly QuickMathQuestion[], sel: Pick<Selection, "category" | "difficulty">) =>
  bank.filter((q) => (sel.category === null || q.category === sel.category) && (sel.difficulty === null || q.difficulty === sel.difficulty))

/** Categories available: those the generator offers, then any extra ones in authored content. */
export function categoriesFor(bank: readonly QuickMathQuestion[]): string[] {
  const out: string[] = [...GENERATED_CATEGORIES]
  for (const q of bank) if (!out.includes(q.category)) out.push(q.category)
  return out
}

/**
 * How many questions a selection can fill: `Infinity` when a generator covers it (the supply is effectively
 * unlimited), otherwise the number of authored questions that match.
 */
export function capacity(bank: readonly QuickMathQuestion[], sel: Pick<Selection, "category" | "difficulty">): number {
  if (templatesFor(sel.category).length > 0) return Infinity
  return authoredFor(bank, sel).length
}

function shuffleWith<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

const dropUndefined = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T

const sameQuestion = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim()

/**
 * Builds a session. The `seed` fixes every choice, so a session can be rebuilt and checked.
 * Authored questions are used at most once, and no two questions share the same prompt. If the selection cannot
 * supply `length` different questions, the session is simply shorter (the caller shows the real count).
 */
export function buildSession(bank: readonly QuickMathQuestion[], sel: Selection, seed: number): SessionQuestion[] {
  const rng = seededRng(seed)
  const authored = shuffleWith(authoredFor(bank, sel), rng)
  const templates = templatesFor(sel.category)
  const picked: SessionQuestion[] = []
  const seen = new Set<string>()
  const add = (q: Omit<SessionQuestion, "key">) => {
    const prompt = sameQuestion(q.prompt + (q.assumptions ?? []).map((a) => a.value).join(" "))
    if (seen.has(prompt)) return false
    seen.add(prompt)
    picked.push(dropUndefined({ ...q, key: `n${picked.length}` }) as SessionQuestion)
    return true
  }

  const authoredQuota = templates.length === 0 ? sel.length : Math.min(authored.length, Math.floor(sel.length * AUTHORED_SHARE))
  const slots: ("authored" | "generated")[] = shuffleWith(
    [...Array(authoredQuota).fill("authored"), ...Array(sel.length - authoredQuota).fill("generated")] as ("authored" | "generated")[],
    rng,
  )

  let nextAuthored = 0
  for (const slot of slots) {
    if (slot === "authored") {
      while (nextAuthored < authored.length) {
        const q = authored[nextAuthored++]
        if (
          add({
            source: "authored",
            id: q.id,
            category: q.category,
            subcategory: q.subcategory,
            difficulty: q.difficulty,
            conceptIds: [...q.conceptIds],
            prompt: q.prompt,
            assumptions: q.assumptions?.map((a) => ({ ...a })),
            rounding: q.rounding,
            answer: q.answer,
            units: q.units,
            tolerance: q.tolerance,
            explanation: q.explanation,
          })
        )
          break
      }
    } else {
      // Try a few times so a repeated random draw does not shorten the session.
      for (let attempt = 0; attempt < 60; attempt++) {
        const template = templates[Math.floor(rng() * templates.length)]
        const difficulty = sel.difficulty ?? DIFFICULTIES[Math.floor(rng() * DIFFICULTIES.length)]
        const questionSeed = Math.floor(rng() * 0x7fffffff)
        const generated = generateOne(template, difficulty, questionSeed)
        if (add(generated)) break
      }
    }
  }
  // Authored questions left over fill any slot a generator could not (for example when nothing matched).
  while (picked.length < sel.length && nextAuthored < authored.length) {
    const q = authored[nextAuthored++]
    add({
      source: "authored",
      id: q.id,
      category: q.category,
      subcategory: q.subcategory,
      difficulty: q.difficulty,
      conceptIds: [...q.conceptIds],
      prompt: q.prompt,
      assumptions: q.assumptions?.map((a) => ({ ...a })),
      rounding: q.rounding,
      answer: q.answer,
      units: q.units,
      tolerance: q.tolerance,
      explanation: q.explanation,
    })
  }
  return picked
}

/** One generated question, rebuilt from its template, difficulty and seed. Same inputs, same question. */
export function generateOne(template: Template, difficulty: Difficulty, seed: number): Omit<SessionQuestion, "key"> {
  const g = template.build(seededRng(seed), difficulty)
  return {
    source: "generated",
    id: `gen-${template.id}-${seed}`,
    category: template.category,
    subcategory: template.subcategory,
    difficulty,
    conceptIds: [],
    prompt: g.prompt,
    assumptions: g.assumptions,
    rounding: g.rounding,
    answer: g.answer,
    units: g.units,
    tolerance: g.tolerance,
    explanation: g.explanation,
  }
}

/** Formats a number for display the way the answer is entered: grouped thousands, no float noise. */
export function formatNumber(n: number): string {
  const v = clean(n)
  const [whole, frac] = String(v).split(".")
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
  return frac ? `${grouped}.${frac}` : grouped
}

/** What to type, shown under the box. Percentages say outright whether to enter 25 or 0.25. */
export function unitHint(units: string | undefined): string | null {
  switch (units) {
    case "%":
      return "Enter 25 for 25%, not 0.25."
    case "x":
      return "Enter the multiple, for example 8.5 for 8.5x."
    case "$m":
      return "Enter dollars in millions, for example 1,250 for $1,250m."
    case "$":
      return "Enter dollars, for example 18.50."
    case "bps":
      return "Enter basis points, for example 150 for 1.5%."
    default:
      return units ? `Units: ${units}.` : null
  }
}

/** Answer with its units for feedback: "1,080 $m", "25%", "8.5x" and "$18.50". */
export function formatAnswer(q: Pick<SessionQuestion, "answer" | "units">): string {
  if (q.units === "$") {
    const [whole, cents] = q.answer.toFixed(2).split(".")
    return `$${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${cents}`
  }
  const n = formatNumber(q.answer)
  if (!q.units) return n
  return q.units === "%" || q.units === "x" ? `${n}${q.units}` : `${n} ${q.units}`
}

// ---- Results and summaries ----

export interface Result {
  entered: number
  raw: string
  correct: boolean
  responseMs: number | null // null in untimed practice
  at: number
}

export interface Summary {
  total: number
  answered: number
  correct: number
  accuracy: number // 0..1; 0 when nothing was answered
  totalMs: number | null // null when the session was untimed
  averageMs: number | null
}

export function summarise(questions: readonly SessionQuestion[], answers: Record<string, Result>): Summary {
  const results = questions.flatMap((q) => (answers[q.key] ? [answers[q.key]] : []))
  const correct = results.filter((r) => r.correct).length
  const timed = results.filter((r) => r.responseMs !== null)
  const totalMs = timed.length > 0 ? timed.reduce((n, r) => n + (r.responseMs ?? 0), 0) : null
  return {
    total: questions.length,
    answered: results.length,
    correct,
    accuracy: results.length > 0 ? correct / results.length : 0,
    totalMs,
    averageMs: totalMs !== null ? totalMs / timed.length : null,
  }
}

export interface CategoryStat {
  category: string
  answered: number
  correct: number
  accuracy: number
  averageMs: number | null // over timed answers only
  timedAnswers: number
}

/** Accuracy and average response time by category, from recorded per-question results. */
export function categoryStats(results: readonly { category: string; correct: boolean; responseMs: number | null }[]): CategoryStat[] {
  const map = new Map<string, { answered: number; correct: number; ms: number; timed: number }>()
  for (const r of results) {
    const s = map.get(r.category) ?? { answered: 0, correct: 0, ms: 0, timed: 0 }
    s.answered++
    if (r.correct) s.correct++
    if (r.responseMs !== null) {
      s.ms += r.responseMs
      s.timed++
    }
    map.set(r.category, s)
  }
  return [...map.entries()]
    .map(([category, s]) => ({
      category,
      answered: s.answered,
      correct: s.correct,
      accuracy: s.correct / s.answered,
      averageMs: s.timed > 0 ? s.ms / s.timed : null,
      timedAnswers: s.timed,
    }))
    .sort((a, b) => a.category.localeCompare(b.category))
}

/** 83_400 -> "1:23"; under a minute -> "12.3 s" so short answers are still distinguishable. */
export function formatDuration(ms: number): string {
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`
  const total = Math.round(ms / 1000)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`
}
