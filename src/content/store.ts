// Imported content lives in its own IndexedDB database, separate from study progress
// (`ib-prep-progress`). Nothing here ever reads or writes progress.
import { openDB, type DBSchema, type IDBPDatabase } from "idb"
import type { Preview, StoredContent, StoredItem } from "./merge.ts"
import type { Concept, ContentPack, Exercise } from "./types.ts"

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
  imports: { key: number; value: ImportRecord }
  meta: { key: string; value: unknown }
}

export const EMPTY_STORED: StoredBundle = { concepts: [], exercises: [], contentVersion: null, imports: [] }

let dbPromise: Promise<IDBPDatabase<ContentDB>> | null = null

function db() {
  dbPromise ??= openDB<ContentDB>("ib-prep-content", 1, {
    upgrade(d) {
      d.createObjectStore("concepts", { keyPath: "id" })
      d.createObjectStore("exercises", { keyPath: "id" })
      d.createObjectStore("imports", { keyPath: "id", autoIncrement: true })
      d.createObjectStore("meta")
    },
  })
  return dbPromise
}

export async function loadStored(): Promise<StoredBundle> {
  const d = await db()
  const [concepts, exercises, imports, contentVersion] = await Promise.all([
    d.getAll("concepts"),
    d.getAll("exercises"),
    d.getAll("imports"),
    d.get("meta", "contentVersion"),
  ])
  return { concepts, exercises, imports, contentVersion: typeof contentVersion === "string" ? contentVersion : null }
}

/**
 * Writes the additions and updates from a validated pack in ONE transaction: either everything is stored
 * or nothing is. Items already identical to what is stored are skipped, and nothing is ever deleted.
 */
export async function applyImport(pack: ContentPack, preview: Preview): Promise<void> {
  const d = await db()
  const tx = d.transaction(["concepts", "exercises", "imports", "meta"], "readwrite")
  try {
    let seq = ((await tx.objectStore("meta").get("seq")) as number | undefined) ?? 0
    const concepts = new Map((pack.concepts ?? []).map((c) => [c.id, c]))
    const exercises = new Map([...(pack.questions ?? []), ...(pack.scenarios ?? [])].map((e) => [e.id, e]))

    for (const change of preview.items) {
      if (change.status === "unchanged") continue
      if (change.type === "concept") {
        const store = tx.objectStore("concepts")
        const existing = await store.get(change.id)
        await store.put({ id: change.id, seq: existing?.seq ?? ++seq, item: concepts.get(change.id)! })
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
