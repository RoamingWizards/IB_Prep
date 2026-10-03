// Combining bundled content with imported content, and previewing what a pack would change.
import type { KnownIds } from "./validate.ts"
import type { Bank, Concept, ContentPack, Exercise, ExerciseKind, MultipleChoice, Process } from "./types.ts"

/** An imported item as stored. `seq` keeps the order items were first added in. */
export interface StoredItem<T> {
  id: string
  seq: number
  item: T
}

export interface StoredContent {
  concepts: StoredItem<Concept>[]
  exercises: StoredItem<Exercise>[]
  choices: StoredItem<MultipleChoice>[]
  processes: StoredItem<Process>[]
}

function overlay<T extends { id: string }>(bundled: T[], stored: StoredItem<T>[]): T[] {
  const byId = new Map(stored.map((s) => [s.id, s]))
  const bundledIds = new Set(bundled.map((b) => b.id))
  // Updates replace bundled items in place; new items follow, in the order they were first imported.
  const out = bundled.map((b) => byId.get(b.id)?.item ?? b)
  const added = stored.filter((s) => !bundledIds.has(s.id)).sort((a, b) => a.seq - b.seq)
  return [...out, ...added.map((s) => s.item)]
}

export function mergeBank(bundled: Bank, stored: StoredContent): Bank {
  const questions = stored.exercises.filter((s) => s.item.kind === "question")
  const scenarios = stored.exercises.filter((s) => s.item.kind === "scenario")
  return {
    concepts: overlay(bundled.concepts, stored.concepts),
    questions: overlay(bundled.questions, questions),
    scenarios: overlay(bundled.scenarios, scenarios),
    multipleChoice: overlay(bundled.multipleChoice, stored.choices),
    processes: overlay(bundled.processes, stored.processes),
  }
}

/** The IDs a new pack may refer to: everything already in the bank. */
export function knownIds(bank: Bank): KnownIds {
  const stageOwners = new Map<string, string>()
  for (const p of bank.processes) for (const st of p.stages) stageOwners.set(st.id, p.id)
  return {
    conceptIds: new Set(bank.concepts.map((c) => c.id)),
    choiceIds: new Set(bank.multipleChoice.map((c) => c.id)),
    stageOwners,
  }
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  if (ka.length !== kb.length) return false
  return ka.every((k) => k in b && deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
}

export type ItemType = "question" | "scenario" | "concept" | "choice" | "process"
export type ChangeStatus = "add" | "update" | "unchanged"

export interface PreviewItem {
  type: ItemType
  id: string
  status: ChangeStatus
  label: string
  category?: string
  subcategory?: string
  /** Extra context, for example how many stages a process has. */
  detail?: string
  /** For updates: the fields whose values differ from what is stored now. */
  changedFields?: string[]
}

export interface Preview {
  items: PreviewItem[]
  added: number
  updated: number
  unchanged: number
  /** Topics the pack introduces to a deck, as the selectors will show them. */
  newTopics: { kind: ExerciseKind; category: string; subcategory: string }[]
}

function changedFields(next: object, current: object): string[] {
  const keys = new Set([...Object.keys(next), ...Object.keys(current)])
  return [...keys].filter((k) => !deepEqual((next as Record<string, unknown>)[k], (current as Record<string, unknown>)[k]))
}

/** Compares a validated pack with the current bank. Pure: nothing is written. */
export function diffPack(pack: ContentPack, bank: Bank): Preview {
  const items: PreviewItem[] = []
  const compare = <T extends { id: string }>(
    list: T[] | undefined,
    existing: T[],
    type: ItemType,
    describe: (t: T) => Pick<PreviewItem, "label" | "category" | "subcategory" | "detail">,
  ) => {
    const byId = new Map(existing.map((e) => [e.id, e]))
    for (const next of list ?? []) {
      const current = byId.get(next.id)
      const base = { type, id: next.id, ...describe(next) }
      if (!current) items.push({ ...base, status: "add" })
      else if (deepEqual(next, current)) items.push({ ...base, status: "unchanged" })
      else items.push({ ...base, status: "update", changedFields: changedFields(next, current) })
    }
  }
  const exerciseInfo = (e: Exercise) => ({ label: e.title, category: e.category, subcategory: e.subcategory })
  compare(pack.concepts, bank.concepts, "concept", (c) => ({ label: c.name }))
  compare(pack.questions, bank.questions, "question", exerciseInfo)
  compare(pack.scenarios, bank.scenarios, "scenario", exerciseInfo)
  compare(pack.multipleChoice, bank.multipleChoice, "choice", (c) => ({
    label: c.title,
    category: c.category,
    subcategory: c.subcategory,
  }))
  compare(pack.processes, bank.processes, "process", (p) => ({
    label: p.title,
    detail: `${p.stages.length} ${p.stages.length === 1 ? "stage" : "stages"}`,
  }))

  const newTopics: Preview["newTopics"] = []
  for (const [kind, list, existing] of [
    ["question", pack.questions, bank.questions],
    ["scenario", pack.scenarios, bank.scenarios],
  ] as const) {
    const have = new Set(existing.map((e) => `${e.category}\u0000${e.subcategory}`))
    for (const e of list ?? []) {
      const key = `${e.category}\u0000${e.subcategory}`
      if (!have.has(key)) {
        have.add(key)
        newTopics.push({ kind, category: e.category, subcategory: e.subcategory })
      }
    }
  }

  const count = (s: ChangeStatus) => items.filter((i) => i.status === s).length
  return { items, added: count("add"), updated: count("update"), unchanged: count("unchanged"), newTopics }
}

/** The bank as a pack, for export. */
export function bankToPack(bank: Bank, contentVersion: string, exportedAt: string): ContentPack {
  return {
    schemaVersion: 1,
    contentVersion,
    title: "IB Prep content bank",
    exportedAt,
    concepts: bank.concepts,
    questions: bank.questions,
    scenarios: bank.scenarios,
    multipleChoice: bank.multipleChoice,
    processes: bank.processes,
  }
}
