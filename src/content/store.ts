// Imported content lives in its own IndexedDB database, separate from study progress
// (`ib-prep-progress`). Nothing here ever reads or writes progress.
import { openDB, type DBSchema, type IDBPDatabase } from "idb"
import type { Preview, StoredContent, StoredItem } from "./merge.ts"
import type { Concept, ContentPack, Exercise, MultipleChoice, Process, QuickMathQuestion, ThreeStatementExercise, ValuationExercise } from "./types.ts"

export interface ImportRecord {
  id?: number
  importedAt: number
  contentVersion: string
  title?: string
  added: number
  updated: number
  unchanged: number
}

export interface StoredBundle extends StoredContent {
  contentVersion: string | null
  imports: ImportRecord[]
}

interface ContentDB extends DBSchema {
  concepts: { key: string; value: StoredItem<Concept> }
  exercises: { key: string; value: StoredItem<Exercise> }
  choices: { key: string; value: StoredItem<MultipleChoice> }
  processes: { key: string; value: StoredItem<Process> }
  statementExercises: { key: string; value: StoredItem<ThreeStatementExercise> }
  valuationExercises: { key: string; value: StoredItem<ValuationExercise> }
  quickMathQuestions: { key: string; value: StoredItem<QuickMathQuestion> }
  imports: { key: number; value: ImportRecord }
  meta: { key: string; value: unknown }
}

export const EMPTY_STORED: StoredBundle = {
  concepts: [],
  exercises: [],
  choices: [],
  processes: [],
  statements: [],
  valuations: [],
  quickMath: [],
  contentVersion: null,
  imports: [],
}

let dbPromise: Promise<IDBPDatabase<ContentDB>> | null = null

function db() {
  // Version 2 added multiple-choice questions and processes; version 3 added three-statement exercises and version 4 added valuation exercises and version 5 adds Quick Maths questions.
  // Upgrading only adds stores, so anything already imported is kept as it is.
  dbPromise ??= openDB<ContentDB>("ib-prep-content", 5, {
    upgrade(d, oldVersion) {
      if (oldVersion < 1) {
        d.createObjectStore("concepts", { keyPath: "id" })
        d.createObjectStore("exercises", { keyPath: "id" })
        d.createObjectStore("imports", { keyPath: "id", autoIncrement: true })
        d.createObjectStore("meta")
      }
      if (oldVersion < 2) {
        d.createObjectStore("choices", { keyPath: "id" })
        d.createObjectStore("processes", { keyPath: "id" })
      }
      if (oldVersion < 3) {
        d.createObjectStore("statementExercises", { keyPath: "id" })
      }
      if (oldVersion < 4) {
        d.createObjectStore("valuationExercises", { keyPath: "id" })
      }
      if (oldVersion < 5) {
        d.createObjectStore("quickMathQuestions", { keyPath: "id" })
      }
    },
  })
  return dbPromise
}

export async function loadStored(): Promise<StoredBundle> {
  const d = await db()
  const [concepts, exercises, choices, processes, statements, valuations, quickMath, imports, contentVersion] = await Promise.all([
    d.getAll("concepts"),
    d.getAll("exercises"),
    d.getAll("choices"),
    d.getAll("processes"),
    d.getAll("statementExercises"),
    d.getAll("valuationExercises"),
    d.getAll("quickMathQuestions"),
    d.getAll("imports"),
    d.get("meta", "contentVersion"),
  ])
  return {
    concepts,
    exercises,
    choices,
    processes,
    statements,
    valuations,
    quickMath,
    imports,
    contentVersion: typeof contentVersion === "string" ? contentVersion : null,
  }
}

/**
 * Writes the additions and updates from a validated pack in ONE transaction: either everything is stored
 * or nothing is. Items already identical to what is stored are skipped, and nothing is ever deleted.
 */
export async function applyImport(pack: ContentPack, preview: Preview): Promise<void> {
  const d = await db()
  const tx = d.transaction(["concepts", "exercises", "choices", "processes", "statementExercises", "valuationExercises", "quickMathQuestions", "imports", "meta"], "readwrite")
  try {
    let seq = ((await tx.objectStore("meta").get("seq")) as number | undefined) ?? 0
    const concepts = new Map((pack.concepts ?? []).map((c) => [c.id, c]))
    const exercises = new Map([...(pack.questions ?? []), ...(pack.scenarios ?? [])].map((e) => [e.id, e]))
    const choices = new Map((pack.multipleChoice ?? []).map((c) => [c.id, c]))
    const processes = new Map((pack.processes ?? []).map((p) => [p.id, p]))
    const statements = new Map((pack.threeStatementExercises ?? []).map((e) => [e.id, e]))
    const valuations = new Map((pack.valuationExercises ?? []).map((e) => [e.id, e]))
    const quickMath = new Map((pack.quickMathQuestions ?? []).map((e) => [e.id, e]))

    for (const change of preview.items) {
      if (change.status === "unchanged") continue
      if (change.type === "concept") {
        const store = tx.objectStore("concepts")
        const existing = await store.get(change.id)
        await store.put({ id: change.id, seq: existing?.seq ?? ++seq, item: concepts.get(change.id)! })
      } else if (change.type === "choice") {
        const store = tx.objectStore("choices")
        const existing = await store.get(change.id)
        await store.put({ id: change.id, seq: existing?.seq ?? ++seq, item: choices.get(change.id)! })
      } else if (change.type === "quickMath") {
        const store = tx.objectStore("quickMathQuestions")
        const existing = await store.get(change.id)
        await store.put({ id: change.id, seq: existing?.seq ?? ++seq, item: quickMath.get(change.id)! })
      } else if (change.type === "valuation") {
        const store = tx.objectStore("valuationExercises")
        const existing = await store.get(change.id)
        await store.put({ id: change.id, seq: existing?.seq ?? ++seq, item: valuations.get(change.id)! })
      } else if (change.type === "statement") {
        const store = tx.objectStore("statementExercises")
        const existing = await store.get(change.id)
        await store.put({ id: change.id, seq: existing?.seq ?? ++seq, item: statements.get(change.id)! })
      } else if (change.type === "process") {
        const store = tx.objectStore("processes")
        const existing = await store.get(change.id)
        await store.put({ id: change.id, seq: existing?.seq ?? ++seq, item: processes.get(change.id)! })
      } else {
        const store = tx.objectStore("exercises")
        const existing = await store.get(change.id)
        await store.put({ id: change.id, seq: existing?.seq ?? ++seq, item: exercises.get(change.id)! })
      }
    }
    await tx.objectStore("meta").put(seq, "seq")
    await tx.objectStore("meta").put(pack.contentVersion, "contentVersion")
    const record: ImportRecord = {
      importedAt: Date.now(),
      contentVersion: pack.contentVersion,
      added: preview.added,
      updated: preview.updated,
      unchanged: preview.unchanged,
    }
    if (pack.title) record.title = pack.title
    await tx.objectStore("imports").add(record)
    await tx.done
  } catch (err) {
    tx.done.catch(() => {}) // aborting rejects this promise; the real error is rethrown below
    try {
      tx.abort()
    } catch {
      /* already finished or aborted */
    }
    throw err
  }
}
