// Session selection: which cards a study session draws from.
// Topics are derived from the content itself; nothing here lists categories by name.
import type { Exercise, ExerciseKind } from "@/content/types"
import { getMeta, setMeta, type CardState } from "./db"
import { buildPracticeQueue, buildQueue, isWeak } from "./scheduler"

/** `due` is the normal review queue (due weak cards, new cards, other due cards). */
export type MasteryFilter = "due" | "new" | "weak" | "learning" | "mastered" | "all"
export type MasteryLevel = "new" | "weak" | "learning" | "mastered"

export interface Selection {
  category: string | null // null = all categories
  subcategory: string | null // null = all subcategories of the category
  mastery: MasteryFilter
  size: number | null // null = no limit
}

export const DEFAULT_SELECTION: Selection = { category: null, subcategory: null, mastery: "due", size: null }
export const SIZE_OPTIONS: (number | null)[] = [5, 10, 20, null]

export const MASTERY_FILTERS: { id: MasteryFilter; label: string }[] = [
  { id: "due", label: "Due and new" },
  { id: "new", label: "New" },
  { id: "weak", label: "Weak" },
  { id: "learning", label: "Learning" },
  { id: "mastered", label: "Mastered" },
  { id: "all", label: "All cards" },
]

/** Reviewed cards whose next interval has reached this many days count as mastered. */
export const MASTERED_INTERVAL_DAYS = 21

/** new: never reviewed. weak: last rated Again or Hard. mastered: long interval. Otherwise learning. */
export function masteryLevel(state: CardState | undefined): MasteryLevel {
  if (!state) return "new"
  if (isWeak(state)) return "weak"
  return state.intervalDays >= MASTERED_INTERVAL_DAYS ? "mastered" : "learning"
}

// ---- Topics derived from content ----

export interface TopicNode {
  name: string
  count: number
  subcategories: { name: string; count: number }[]
}

/** Categories and their subcategories in the order they first appear in the content. */
export function topicTree(exercises: Exercise[]): TopicNode[] {
  const nodes: TopicNode[] = []
  for (const e of exercises) {
    let node = nodes.find((n) => n.name === e.category)
    if (!node) nodes.push((node = { name: e.category, count: 0, subcategories: [] }))
    node.count++
    const sub = node.subcategories.find((s) => s.name === e.subcategory)
    if (sub) sub.count++
    else node.subcategories.push({ name: e.subcategory, count: 1 })
  }
  return nodes
}

export function inTopic(e: Exercise, sel: Pick<Selection, "category" | "subcategory">) {
  return (!sel.category || e.category === sel.category) && (!sel.subcategory || e.subcategory === sel.subcategory)
}

// ---- Queues ----

export function buildSelectionQueue(
  exercises: Exercise[],
  sel: Selection,
  states: Map<string, CardState>,
  now = Date.now(),
): string[] {
  const pool = exercises.filter((e) => inTopic(e, sel)).map((e) => e.id)
  let ids: string[]
  if (sel.mastery === "due") ids = buildQueue(pool, states, now)
  else {
    const matching = pool.filter((id) => sel.mastery === "all" || masteryLevel(states.get(id)) === sel.mastery)
    ids = buildPracticeQueue(matching, states) // weakest and newest first
  }
  return sel.size ? ids.slice(0, sel.size) : ids
}

/** How many cards each mastery filter would offer within the chosen topic. */
export function masteryCounts(
  exercises: Exercise[],
  sel: Pick<Selection, "category" | "subcategory">,
  states: Map<string, CardState>,
  now = Date.now(),
): Record<MasteryFilter, number> {
  const pool = exercises.filter((e) => inTopic(e, sel)).map((e) => e.id)
  const counts: Record<MasteryFilter, number> = { due: buildQueue(pool, states, now).length, new: 0, weak: 0, learning: 0, mastered: 0, all: pool.length }
  for (const id of pool) counts[masteryLevel(states.get(id))]++
  return counts
}

export function activeFilterCount(sel: Selection) {
  return (sel.category ? 1 : 0) + (sel.mastery !== "due" ? 1 : 0) + (sel.size ? 1 : 0)
}

// ---- Persistence (per deck, in the IndexedDB meta store) ----

/** Repairs a stored selection against the current content, so removed topics can't break a session. */
export function sanitizeSelection(raw: unknown, tree: TopicNode[]): Selection {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  const node = tree.find((n) => n.name === r.category)
  const sub = node?.subcategories.find((s) => s.name === r.subcategory)
  return {
    category: node ? node.name : null,
    subcategory: sub ? sub.name : null,
    mastery: MASTERY_FILTERS.some((m) => m.id === r.mastery) ? (r.mastery as MasteryFilter) : "due",
    size: typeof r.size === "number" && r.size > 0 ? Math.floor(r.size) : null,
  }
}

const key = (kind: ExerciseKind) => `selection:${kind}`

export async function loadSelection(kind: ExerciseKind, exercises: Exercise[]): Promise<Selection> {
  try {
    return sanitizeSelection(await getMeta<unknown>(key(kind)), topicTree(exercises))
  } catch {
    return { ...DEFAULT_SELECTION }
  }
}

export function saveSelection(kind: ExerciseKind, sel: Selection) {
  return setMeta(key(kind), sel)
}
