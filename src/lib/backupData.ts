// Reading, replacing and deleting the data the app keeps on the device (the two IndexedDB databases and the local copy
// of the theme). Everything here changes stored data, so each write is one transaction per database: it either happens
// completely or not at all. Validation and the file format are in backup.ts.
import type { IDBPDatabase } from "idb"
import { getContentDb } from "@/content/store"
import { getProgressDb } from "./db"
import {
  buildBackup,
  CONTENT_META_KEYS,
  CONTENT_STORES,
  DELETE_SCOPES,
  groupCounts,
  PROGRESS_META_KEYS,
  PROGRESS_STORES,
  THEME_MIRROR_KEY,
  type BackupFile,
  type DatabaseData,
  type DeleteScope,
  type StoreSpec,
} from "./backup"

type AnyDb = IDBPDatabase<unknown>
const progressDb = () => getProgressDb() as unknown as Promise<AnyDb>
const contentDb = () => getContentDb() as unknown as Promise<AnyDb>

async function readDatabase(db: AnyDb, specs: StoreSpec[]): Promise<DatabaseData> {
  const tx = db.transaction(specs.map((s) => s.name), "readonly")
  const stores: DatabaseData["stores"] = {}
  for (const spec of specs) {
    const store = tx.objectStore(spec.name)
    if (spec.keyValue) {
      const [keys, values] = await Promise.all([store.getAllKeys(), store.getAll()])
      stores[spec.name] = keys.map((key, i) => ({ key, value: values[i] }))
    } else stores[spec.name] = await store.getAll()
  }
  await tx.done
  return { stores }
}

/** Replaces every store of a database with the given records in one transaction. Throws, changing nothing, if any write fails. */
async function replaceDatabase(db: AnyDb, specs: StoreSpec[], metaKeys: string[], data: DatabaseData): Promise<void> {
  const tx = db.transaction(specs.map((s) => s.name), "readwrite")
  try {
    for (const spec of specs) {
      const store = tx.objectStore(spec.name)
      await store.clear()
      for (const rec of data.stores[spec.name] ?? []) {
        if (spec.keyValue) {
          const { key, value } = rec as { key: string; value: unknown }
          if (metaKeys.includes(key)) await store.put(value, key)
        } else await store.put(rec)
      }
    }
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

function readTheme(): Record<string, string | null> {
  try {
    return { [THEME_MIRROR_KEY]: window.localStorage.getItem(THEME_MIRROR_KEY) }
  } catch {
    return { [THEME_MIRROR_KEY]: null }
  }
}

function writeTheme(value: string | null | undefined) {
  try {
    if (value) window.localStorage.setItem(THEME_MIRROR_KEY, value)
    else window.localStorage.removeItem(THEME_MIRROR_KEY)
  } catch {
    /* the IndexedDB copy still holds the theme */
  }
}

export interface Everything {
  progress: DatabaseData
  content: DatabaseData
  localStorage: Record<string, string | null>
}

/** A snapshot of all app data as it is right now. */
export async function readEverything(): Promise<Everything> {
  const [p, c] = await Promise.all([progressDb(), contentDb()])
  return { progress: await readDatabase(p, PROGRESS_STORES), content: await readDatabase(c, CONTENT_STORES), localStorage: readTheme() }
}

/** The backup file for the data on the device now. */
export async function createBackup(now = new Date()): Promise<BackupFile> {
  return buildBackup(await readEverything(), now)
}

export interface Counts {
  progress: Record<string, number>
  content: Record<string, number>
  metaKeys: string[]
}

/** How many records each store holds and which settings keys are set, without reading the records. */
export async function countEverything(): Promise<Counts> {
  const [p, c] = await Promise.all([progressDb(), contentDb()])
  const progress: Record<string, number> = {}
  const content: Record<string, number> = {}
  for (const s of PROGRESS_STORES) progress[s.name] = await p.count(s.name)
  for (const s of CONTENT_STORES) content[s.name] = await c.count(s.name)
  const metaKeys = ((await p.getAllKeys("meta")) as string[]).filter((k) => PROGRESS_META_KEYS.includes(k))
  return { progress, content, metaKeys }
}

export const groupCountsOf = (c: Counts) => groupCounts(c.progress, c.content, c.metaKeys)

export class RestoreError extends Error {
  /** True when everything is back as it was before the restore began. */
  rolledBack: boolean
  /** The data as it was before the restore, kept so it can be saved if automatic recovery also failed. */
  previous: BackupFile | null
  constructor(message: string, rolledBack: boolean, previous: BackupFile | null) {
    super(message)
    this.rolledBack = rolledBack
    this.previous = previous
  }
}

/**
 * Replaces all app data with a validated backup. The current data is read first; content is replaced, then
 * progress. If anything fails the databases are put back from that snapshot, so a failed restore leaves the data
 * as it was. If even the recovery fails, the error carries the previous data so it can be saved to a file.
 */
export async function restoreBackup(backup: BackupFile): Promise<void> {
  const [p, c] = await Promise.all([progressDb(), contentDb()])
  const before = await readEverything()
  const snapshot = await buildBackup(before, new Date())
  let contentReplaced = false
  try {
    await replaceDatabase(c, CONTENT_STORES, CONTENT_META_KEYS, backup.content)
    contentReplaced = true
    await replaceDatabase(p, PROGRESS_STORES, PROGRESS_META_KEYS, backup.progress)
  } catch (err) {
    console.error("Restore failed; putting the previous data back", err)
    let recovered = !contentReplaced // if content was never replaced, nothing needs undoing
    if (contentReplaced) {
      try {
        await replaceDatabase(c, CONTENT_STORES, CONTENT_META_KEYS, before.content)
        recovered = true
      } catch (undo) {
        console.error("Could not put the previous content back", undo)
      }
    }
    throw new RestoreError(err instanceof Error ? err.message : String(err), recovered, recovered ? null : snapshot)
  }
  writeTheme(backup.localStorage[THEME_MIRROR_KEY])
}

// ---- Deletion ----

/** What deleting a scope would remove right now, as counts per group, for the confirmation. */
export async function previewDeletion(scope: DeleteScope): Promise<{ label: string; count: number }[]> {
  const counts = await countEverything()
  const stores = new Set(scope.progress)
  const contentStores = new Set(scope.content)
  const metaKeys = new Set(scope.settings ? PROGRESS_META_KEYS : scope.meta)
  const filtered: Counts = {
    progress: Object.fromEntries(Object.entries(counts.progress).map(([k, v]) => [k, stores.has(k) ? v : 0])),
    content: Object.fromEntries(Object.entries(counts.content).map(([k, v]) => [k, contentStores.has(k) ? v : 0])),
    metaKeys: counts.metaKeys.filter((k) => metaKeys.has(k)),
  }
  return groupCountsOf(filtered).filter((g) => g.count > 0)
}

/** A deletion that did not remove everything. `cleared` and `failed` name the steps; `remaining` is what a recount still finds. */
export class DeleteError extends Error {
  cleared: string[]
  failed: string[]
  remaining: { label: string; count: number }[]
  constructor(cleared: string[], failed: string[], remaining: { label: string; count: number }[]) {
    super(`Deletion incomplete: ${failed.join("; ")}`)
    this.cleared = cleared
    this.failed = failed
    this.remaining = remaining
  }
}

async function clearIn(db: AnyDb, stores: readonly string[], meta: readonly string[] | "all") {
  const tx = db.transaction([...stores, "meta"], "readwrite")
  try {
    for (const s of stores) await tx.objectStore(s).clear()
    const m = tx.objectStore("meta")
    if (meta === "all") await m.clear()
    else for (const key of meta) await m.delete(key)
    await tx.done
  } catch (err) {
    tx.done.catch(() => {})
    try {
      tx.abort()
    } catch {
      /* already finished */
    }
    throw err
  }
}

/**
 * Deletes the scope's data. Each database is emptied in its own transaction, and a failure in one does not stop the
 * other. Afterwards what remains is recounted: it returns normally only if nothing of the scope is left, otherwise
 * it throws a DeleteError saying what was cleared and what is still there. Running it again is safe.
 */
export async function deleteData(scope: DeleteScope): Promise<void> {
  const cleared: string[] = []
  const failed: string[] = []
  const attempt = async (label: string, run: () => Promise<void>) => {
    try {
      await run()
      cleared.push(label)
    } catch (err) {
      console.error(`Deletion step failed: ${label}`, err)
      failed.push(label)
    }
  }
  await attempt("Study, Behavioural and settings data (progress database)", async () => clearIn(await progressDb(), scope.progress, scope.settings ? "all" : scope.meta))
  if (scope.content.length > 0) await attempt("Imported content and import log (content database)", async () => clearIn(await contentDb(), scope.content, "all"))
  if (scope.settings) await attempt("Saved theme copy", async () => writeTheme(null))
  const remaining = await previewDeletion(scope)
  const themeLeft = scope.settings && readTheme()[THEME_MIRROR_KEY] !== null
  if (failed.length > 0 || remaining.length > 0 || themeLeft) {
    if (themeLeft && !failed.includes("Saved theme copy")) failed.push("Saved theme copy")
    throw new DeleteError(cleared.filter((l) => !failed.includes(l)), failed, remaining)
  }
}

export const SCOPES = DELETE_SCOPES
