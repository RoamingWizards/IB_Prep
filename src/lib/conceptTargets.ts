// Which exercises practise which concept, so the dashboard can link to them. Pure: derived from the content bank.
import type { Bank } from "../content/types.ts"

export type TargetMode = "questions" | "scenarios" | "deals" | "statements" | "valuation" | "quickMath"

export interface PracticeTarget {
  mode: TargetMode
  /** Link text, for example "Flashcards: Valuation › DCF". */
  label: string
  /** How much there is, for example "4 cards". */
  detail: string
  /** The process or exercise to highlight in the mode's own list (Deal Walks, Three Statements, Valuation Builder). */
  id?: string
  /** The topic to preselect (flashcard decks and Quick Maths). */
  category?: string
  subcategory?: string
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** Every practice target for every concept in the bank, in a stable order. */
export function conceptTargets(bank: Bank): Map<string, PracticeTarget[]> {
  const out = new Map<string, PracticeTarget[]>()
  const add = (conceptIds: readonly string[], t: PracticeTarget) => {
    for (const id of new Set(conceptIds)) {
      const list = out.get(id)
      if (list) list.push(t)
      else out.set(id, [t])
    }
  }

  // Flashcards: one target per deck topic, with how many of its cards carry the concept.
  for (const [mode, label, list] of [
    ["questions", "Questions", bank.questions],
    ["scenarios", "Scenarios", bank.scenarios],
  ] as const) {
    const topics = new Map<string, { category: string; subcategory: string; byConcept: Map<string, number> }>()
    for (const e of list) {
      const key = `${e.category}\u0000${e.subcategory}`
      const topic = topics.get(key) ?? { category: e.category, subcategory: e.subcategory, byConcept: new Map() }
      for (const c of new Set(e.conceptIds)) topic.byConcept.set(c, (topic.byConcept.get(c) ?? 0) + 1)
      topics.set(key, topic)
    }
    for (const t of topics.values()) {
      for (const [conceptId, n] of t.byConcept) {
        add([conceptId], { mode, label: `${label}: ${t.category} › ${t.subcategory}`, detail: plural(n, "card"), category: t.category, subcategory: t.subcategory })
      }
    }
  }

  // Deal Walks: a process practises the concepts of its stages' questions.
  const choices = new Map(bank.multipleChoice.map((c) => [c.id, c]))
  for (const p of bank.processes) {
    const counts = new Map<string, number>()
    for (const s of p.stages) for (const c of new Set(choices.get(s.choiceId)?.conceptIds ?? [])) counts.set(c, (counts.get(c) ?? 0) + 1)
    for (const [conceptId, n] of counts) add([conceptId], { mode: "deals", label: `Deal Walk: ${p.title}`, detail: plural(n, "stage"), id: p.id })
  }
  for (const e of bank.threeStatementExercises) add(e.conceptIds, { mode: "statements", label: `Three Statements: ${e.title}`, detail: "1 exercise", id: e.id })
  for (const e of bank.valuationExercises) add(e.conceptIds, { mode: "valuation", label: `Valuation Builder: ${e.title}`, detail: "1 exercise", id: e.id })

  // Quick Maths: authored questions carry concepts; generated ones do not. One target per category.
  const qm = new Map<string, { category: string; byConcept: Map<string, number> }>()
  for (const q of bank.quickMathQuestions) {
    const entry = qm.get(q.category) ?? { category: q.category, byConcept: new Map() }
    for (const c of new Set(q.conceptIds)) entry.byConcept.set(c, (entry.byConcept.get(c) ?? 0) + 1)
    qm.set(q.category, entry)
  }
  for (const entry of qm.values()) {
    for (const [conceptId, n] of entry.byConcept) add([conceptId], { mode: "quickMath", label: `Quick Maths: ${entry.category}`, detail: plural(n, "question"), category: entry.category })
  }
  return out
}

/** Label for concepts that no exercise mentions yet, so they can still be filtered to. */
export const NO_TOPIC = "No exercises yet"

/**
 * The topics (exercise categories) each concept is practised in, derived from the content: the category of every
 * flashcard, multiple-choice question, exercise and Quick Maths question that carries the concept. Never typed in.
 */
export function conceptTopics(bank: Bank): Map<string, string[]> {
  const sets = new Map<string, Set<string>>()
  const add = (conceptIds: readonly string[], category: string) => {
    for (const id of conceptIds) {
      const set = sets.get(id) ?? new Set<string>()
      set.add(category)
      sets.set(id, set)
    }
  }
  for (const e of [...bank.questions, ...bank.scenarios]) add(e.conceptIds, e.category)
  for (const c of bank.multipleChoice) add(c.conceptIds, c.category)
  for (const e of bank.threeStatementExercises) add(e.conceptIds, e.category)
  for (const e of bank.valuationExercises) add(e.conceptIds, e.category)
  for (const q of bank.quickMathQuestions) add(q.conceptIds, q.category)
  return new Map(bank.concepts.map((c) => [c.id, [...(sets.get(c.id) ?? [NO_TOPIC])].sort()]))
}
