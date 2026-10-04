// Backup and restore: the file format, validation and the descriptions of what each part holds. Pure functions with
// no browser storage APIs, so Node can check them. The functions that read and write IndexedDB are in backupData.ts.
//
// A backup is one JSON file holding everything the app keeps on the device: imported content, all progress (History,
// unfinished drafts, Behavioural answers and sessions) and settings. It is a plain, unencrypted file.
import { validatePack, type KnownIds } from "../content/validate.ts"
import type { ContentPack } from "../content/types.ts"

export const BACKUP_KIND = "ib-prep-backup"
export const BACKUP_VERSION = 1
/** The database versions this build writes and can restore. A backup from a newer build is refused. */
export const PROGRESS_DB_VERSION = 6
export const CONTENT_DB_VERSION = 6
export const MAX_BACKUP_BYTES = 250 * 1024 * 1024
export const THEME_MIRROR_KEY = "ib-prep-theme"

export interface StoreSpec {
  name: string
  /** True for a store whose records are `{ key, value }` pairs (the key-value "meta" store). */
  keyValue?: boolean
}

export const PROGRESS_STORES: StoreSpec[] = [
  { name: "cardStates" },
  { name: "attempts" },
  { name: "sessions" },
  { name: "walks" },
  { name: "choiceAttempts" },
  { name: "statementAttempts" },
  { name: "valuationAttempts" },
  { name: "quickMathSessions" },
  { name: "quickMathResults" },
  { name: "behaviouralNotes" },
  { name: "behaviouralUserQuestions" },
  { name: "behaviouralSessions" },
  { name: "meta", keyValue: true },
]

export const CONTENT_STORES: StoreSpec[] = [
  { name: "concepts" },
  { name: "exercises" },
  { name: "choices" },
  { name: "processes" },
  { name: "statementExercises" },
  { name: "valuationExercises" },
  { name: "quickMathQuestions" },
  { name: "behaviouralQuestions" },
  { name: "imports" },
  { name: "meta", keyValue: true },
]

/** Settings the learner chose (kept apart from the markers of work in progress). */
export const SETTINGS_META_KEYS = ["menuOpen", "keybinds", "theme", "selection:question", "selection:scenario", "quickMath:selection", "behavioural:selection"]
/** Pointers to the attempt or session that was open, so a reload can resume it. They belong with study history. */
export const IN_PROGRESS_META_KEYS = ["dealWalk:current", "threeStatements:current", "valuation:current", "quickMath:current"]
export const PROGRESS_META_KEYS = [...SETTINGS_META_KEYS, ...IN_PROGRESS_META_KEYS]
export const CONTENT_META_KEYS = ["seq", "contentVersion"]

export type StoreRecords = unknown[]
export interface DatabaseData {
  stores: Record<string, StoreRecords>
}

export interface BackupFile {
  kind: typeof BACKUP_KIND
  version: number
  createdAt: string
  app: { progressDbVersion: number; contentDbVersion: number }
  progress: DatabaseData
  content: DatabaseData
  /** The local copy of the colour theme kept for a flash-free first paint, or null. */
  localStorage: Record<string, string | null>
  counts: { progress: Record<string, number>; content: Record<string, number> }
  integrity: { algorithm: "SHA-256"; digest: string }
}

// ---- What each part holds (used by the preview, the deletion controls and the privacy notice) ----

export interface Group {
  id: string
  label: string
  /** Progress stores in this group. */
  progress?: string[]
  /** Content stores in this group. */
  content?: string[]
  /** Progress meta keys in this group. */
  meta?: string[]
}

export const GROUPS: Group[] = [
  { id: "flashcards", label: "Flashcard ratings, sessions and review schedule", progress: ["attempts", "sessions", "cardStates"] },
  { id: "dealWalks", label: "Deal Walk progress and results", progress: ["walks", "choiceAttempts"] },
  { id: "statements", label: "Three Statements attempts, including unfinished drafts", progress: ["statementAttempts"] },
  { id: "valuation", label: "Valuation Builder attempts, including unfinished drafts", progress: ["valuationAttempts"] },
  { id: "quickMaths", label: "Quick Maths sessions and results", progress: ["quickMathSessions", "quickMathResults"] },
  { id: "behavioural", label: "Behavioural answers, bullets, your own questions and practice sessions", progress: ["behaviouralNotes", "behaviouralUserQuestions", "behaviouralSessions"] },
  { id: "content", label: "Imported content (concepts, questions, exercises) and the import log", content: CONTENT_STORES.filter((s) => !s.keyValue).map((s) => s.name) },
  { id: "settings", label: "Settings: keybinds, appearance, filters and menu state", meta: SETTINGS_META_KEYS },
]

export interface DeleteScope {
  id: "study" | "behavioural" | "all"
  title: string
  /** Progress stores emptied. */
  progress: string[]
  /** Progress meta keys removed. */
  meta: string[]
  /** Content stores emptied. */
  content: string[]
  /** True when settings and the local theme copy are removed too. */
  settings: boolean
  removes: string[]
  keeps: string[]
}

const stores = (ids: string[]) => GROUPS.filter((g) => ids.includes(g.id)).flatMap((g) => g.progress ?? [])

export const DELETE_SCOPES: DeleteScope[] = [
  {
    id: "study",
    title: "Delete study history",
    progress: stores(["flashcards", "dealWalks", "statements", "valuation", "quickMaths"]),
    meta: IN_PROGRESS_META_KEYS,
    content: [],
    settings: false,
    removes: [
      "Flashcard ratings, sessions and the review schedule",
      "Deal Walk progress and results",
      "Three Statements and Valuation Builder attempts, including unfinished drafts",
      "Quick Maths sessions and results",
      "Everything shown in History for those modes, and the Dashboard figures built from them",
    ],
    keeps: ["Behavioural answers, your own questions and practice sessions", "Imported content", "Settings and appearance"],
  },
  {
    id: "behavioural",
    title: "Delete Behavioural answers",
    progress: stores(["behavioural"]),
    meta: ["behavioural:selection"],
    content: [],
    settings: false,
    removes: [
      "Every answer and practice bullet you wrote",
      "The questions you created yourself, including firm-specific ones",
      "Behavioural practice sessions: Ready or Needs work ratings, reflections and timings",
    ],
    keeps: ["The provided Behavioural questions (part of the app's content)", "All other study history", "Imported content, settings and appearance"],
  },
  {
    id: "all",
    title: "Delete all app data",
    progress: PROGRESS_STORES.filter((s) => !s.keyValue).map((s) => s.name),
    meta: PROGRESS_META_KEYS,
    content: CONTENT_STORES.filter((s) => !s.keyValue).map((s) => s.name),
    settings: true,
    removes: [
      "All study history and unfinished drafts",
      "All Behavioural answers, your own questions and practice sessions",
      "All imported content and the import log (the content bundled with the app stays)",
      "All settings: keybinds, appearance, filters and menu state",
    ],
    keeps: ["Files you have exported or backed up (they are outside the app)", "The content that ships with the app"],
  },
]

// ---- Stable serialisation and the integrity digest ----

/** JSON with object keys sorted, so the same data always gives the same text whatever order keys were added in. */
export function stableStringify(value: unknown): string {
  if (value === undefined) return "null"
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null"
  if (Array.isArray(value)) return `[${value.map((v) => stableStringify(v)).join(",")}]`
  const keys = Object.keys(value as object).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`).join(",")}}`
}

export async function digestOf(payload: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(stableStringify(payload))
  const hash = await crypto.subtle.digest("SHA-256", bytes)
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("")
}

const countOf = (data: DatabaseData, specs: StoreSpec[]) => Object.fromEntries(specs.map((s) => [s.name, (data.stores[s.name] ?? []).length]))

/** Assembles a backup file object from everything read from the device. */
export async function buildBackup(input: { progress: DatabaseData; content: DatabaseData; localStorage: Record<string, string | null> }, now: Date): Promise<BackupFile> {
  const { progress, content, localStorage } = input
  return {
    kind: BACKUP_KIND,
    version: BACKUP_VERSION,
    createdAt: now.toISOString(),
    app: { progressDbVersion: PROGRESS_DB_VERSION, contentDbVersion: CONTENT_DB_VERSION },
    progress,
    content,
    localStorage,
    counts: { progress: countOf(progress, PROGRESS_STORES), content: countOf(content, CONTENT_STORES) },
    integrity: { algorithm: "SHA-256", digest: await digestOf({ progress, content, localStorage }) },
  }
}

// ---- Validation ----

type Check = (r: Record<string, unknown>) => string | null
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v)
const str = (v: unknown) => typeof v === "string" && v !== ""
const num = (v: unknown) => typeof v === "number" && Number.isFinite(v)
const oneOf = (v: unknown, list: string[]) => typeof v === "string" && list.includes(v)

/** The least a record must have for the app to read it back: key fields and the types the screens rely on. */
const SHAPES: Record<string, { key: string; check: Check }> = {
  cardStates: { key: "exerciseId", check: (r) => (str(r.exerciseId) && num(r.due) && num(r.reps) ? null : "needs exerciseId, due and reps") },
  attempts: { key: "id", check: (r) => (str(r.exerciseId) && oneOf(r.rating, ["again", "hard", "good", "easy"]) && num(r.at) ? null : "needs exerciseId, a rating and at") },
  sessions: { key: "id", check: (r) => (str(r.id) && isObj(r.counts) ? null : "needs id and counts") },
  walks: { key: "sessionId", check: (r) => (str(r.sessionId) && str(r.processId) && isObj(r.results) ? null : "needs sessionId, processId and results") },
  choiceAttempts: { key: "id", check: (r) => (str(r.sessionId) && str(r.stageId) && typeof r.correct === "boolean" ? null : "needs sessionId, stageId and correct") },
  statementAttempts: { key: "id", check: (r) => (str(r.id) && str(r.exerciseId) && isObj(r.snapshot) && oneOf(r.status, ["draft", "submitted"]) ? null : "needs id, exerciseId, snapshot and status") },
  valuationAttempts: { key: "id", check: (r) => (str(r.id) && str(r.exerciseId) && isObj(r.snapshot) && oneOf(r.status, ["draft", "submitted"]) ? null : "needs id, exerciseId, snapshot and status") },
  quickMathSessions: { key: "id", check: (r) => (str(r.id) && Array.isArray(r.questions) && isObj(r.answers) && oneOf(r.status, ["active", "complete", "abandoned"]) ? null : "needs id, questions, answers and status") },
  quickMathResults: { key: "id", check: (r) => (str(r.sessionId) && str(r.questionKey) && typeof r.correct === "boolean" ? null : "needs sessionId, questionKey and correct") },
  behaviouralNotes: { key: "questionId", check: (r) => (str(r.questionId) && typeof r.answer === "string" && typeof r.bullets === "string" ? null : "needs questionId, answer and bullets") },
  behaviouralUserQuestions: { key: "id", check: (r) => (typeof r.id === "string" && r.id.startsWith("bu-") && str(r.title) && str(r.prompt) && str(r.category) ? null : "needs a bu- id, title, prompt and category") },
  behaviouralSessions: { key: "id", check: (r) => (str(r.questionId) && oneOf(r.outcome, ["needs-work", "ready"]) && num(r.at) && typeof r.reflection === "string" ? null : "needs questionId, outcome, at and reflection") },
  // content
  concepts: { key: "id", check: (r) => (isObj(r.item) && num(r.seq) ? null : "needs seq and item") },
  exercises: { key: "id", check: (r) => (isObj(r.item) && num(r.seq) ? null : "needs seq and item") },
  choices: { key: "id", check: (r) => (isObj(r.item) && num(r.seq) ? null : "needs seq and item") },
  processes: { key: "id", check: (r) => (isObj(r.item) && num(r.seq) ? null : "needs seq and item") },
  statementExercises: { key: "id", check: (r) => (isObj(r.item) && num(r.seq) ? null : "needs seq and item") },
  valuationExercises: { key: "id", check: (r) => (isObj(r.item) && num(r.seq) ? null : "needs seq and item") },
  quickMathQuestions: { key: "id", check: (r) => (isObj(r.item) && num(r.seq) ? null : "needs seq and item") },
  behaviouralQuestions: { key: "id", check: (r) => (isObj(r.item) && num(r.seq) ? null : "needs seq and item") },
  imports: { key: "id", check: (r) => (num(r.importedAt) && typeof r.contentVersion === "string" ? null : "needs importedAt and contentVersion") },
}

const MAX_META_BYTES = 200_000

export interface BackupSummary {
  createdAt: string
  groups: { id: string; label: string; count: number }[]
  /** Meta keys present, for the settings line. */
  settingsPresent: string[]
}

export type BackupResult =
  | { ok: true; backup: BackupFile; summary: BackupSummary; warnings: string[] }
  | { ok: false; errors: string[] }

/** How many records of each group a set of store counts holds. Settings count the keys that are set. */
export function groupCounts(progress: Record<string, number>, content: Record<string, number>, metaKeys: readonly string[]): { id: string; label: string; count: number }[] {
  return GROUPS.map((g) => ({
    id: g.id,
    label: g.label,
    count: (g.progress ?? []).reduce((n, s) => n + (progress[s] ?? 0), 0) + (g.content ?? []).reduce((n, s) => n + (content[s] ?? 0), 0) + (g.meta ?? []).filter((k) => metaKeys.includes(k)).length,
  }))
}

/**
 * Checks a backup file's text completely before anything is touched: size, JSON, kind, version, every store and
 * record, key uniqueness, the counts it declares, the content (with the app's own content validator) and the integrity
 * digest. Returns every problem found. A backup that passes can be restored; one that fails changes nothing.
 */
export async function validateBackup(text: string, known: KnownIds): Promise<BackupResult> {
  const errors: string[] = []
  const warnings: string[] = []
  if (text.length > MAX_BACKUP_BYTES) return { ok: false, errors: [`The file is larger than ${MAX_BACKUP_BYTES / 1024 / 1024} MB, which is more than a backup from this app can be.`] }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (err) {
    return { ok: false, errors: [`The file is not valid JSON, so it is not a complete backup (${err instanceof Error ? err.message : String(err)}). A cut-off or edited file looks like this.`] }
  }
  if (!isObj(raw)) return { ok: false, errors: ["The file must contain a JSON object."] }
  if (raw.kind !== BACKUP_KIND) {
    return { ok: false, errors: [raw.kind === "ib-prep-behavioural-personal" ? "This is the Behavioural answers export, which is not a full backup and cannot be restored. Use a file made by Download backup." : raw.schemaVersion !== undefined ? "This is a content pack. Import it under Content instead; it is not a full backup." : `This file is not an IB Prep backup (kind should be "${BACKUP_KIND}").`] }
  }
  if (typeof raw.version !== "number" || raw.version < 1) errors.push("version: missing or invalid.")
  else if (raw.version > BACKUP_VERSION) errors.push(`This backup was made by a newer version of the app (backup format ${raw.version}; this app reads up to ${BACKUP_VERSION}). Update the app before restoring it.`)
  const app = isObj(raw.app) ? raw.app : {}
  if (typeof app.progressDbVersion !== "number" || typeof app.contentDbVersion !== "number") errors.push("app: database versions are missing.")
  else if (app.progressDbVersion > PROGRESS_DB_VERSION || app.contentDbVersion > CONTENT_DB_VERSION) errors.push("This backup holds a newer data layout than this app understands. Update the app before restoring it.")
  if (typeof raw.createdAt !== "string" || Number.isNaN(Date.parse(raw.createdAt))) errors.push("createdAt: missing or not a date.")

  const checkDatabase = (name: "progress" | "content", specs: StoreSpec[], metaKeys: string[]) => {
    const db = raw[name]
    if (!isObj(db) || !isObj(db.stores)) {
      errors.push(`${name}: missing its stores.`)
      return
    }
    const known = new Set(specs.map((s) => s.name))
    for (const extra of Object.keys(db.stores)) if (!known.has(extra)) warnings.push(`${name}.${extra}: not a store this app uses; it is ignored.`)
    for (const spec of specs) {
      const records = db.stores[spec.name]
      if (!Array.isArray(records)) {
        errors.push(`${name}.${spec.name}: missing or not a list.`)
        continue
      }
      const seen = new Set<string>()
      records.forEach((rec, i) => {
        const at = `${name}.${spec.name}[${i}]`
        if (errors.length >= 60) return
        if (!isObj(rec)) return void errors.push(`${at}: must be an object.`)
        if (spec.keyValue) {
          if (!str(rec.key) || !("value" in rec)) return void errors.push(`${at}: needs a key and a value.`)
          if (!metaKeys.includes(rec.key as string)) return void warnings.push(`${at}: "${String(rec.key)}" is not a setting this app uses; it is ignored.`)
          if (JSON.stringify(rec.value ?? null).length > MAX_META_BYTES) return void errors.push(`${at}: value is unreasonably large.`)
          if (seen.has(rec.key as string)) errors.push(`${at}: duplicate key "${String(rec.key)}".`)
          seen.add(rec.key as string)
          return
        }
        const shape = SHAPES[spec.name]
        const problem = shape?.check(rec)
        if (problem) return void errors.push(`${at}: ${problem}.`)
        const key = rec[shape.key]
        if (typeof key !== "string" && typeof key !== "number") return void errors.push(`${at}: its key field "${shape.key}" is missing.`)
        if (seen.has(String(key))) errors.push(`${at}: duplicate ${shape.key} "${String(key)}".`)
        seen.add(String(key))
      })
    }
  }
  checkDatabase("progress", PROGRESS_STORES, PROGRESS_META_KEYS)
  checkDatabase("content", CONTENT_STORES, CONTENT_META_KEYS)
  const ls = raw.localStorage
  if (!isObj(ls) || Object.values(ls).some((v) => v !== null && typeof v !== "string")) errors.push("localStorage: must map names to text or null.")
  const counts = raw.counts
  if (!isObj(counts) || !isObj(counts.progress) || !isObj(counts.content)) errors.push("counts: missing.")
  if (errors.length > 0) return { ok: false, errors: errors.slice(0, 60) }

  const backup = raw as unknown as BackupFile
  // Declared counts must match, which catches a file with records removed.
  for (const [db, specs] of [["progress", PROGRESS_STORES], ["content", CONTENT_STORES]] as const) {
    for (const s of specs) {
      const declared = (backup.counts[db] as Record<string, number>)[s.name]
      const actual = backup[db].stores[s.name].length
      if (declared !== actual) errors.push(`counts.${db}.${s.name}: the file says ${declared} but holds ${actual}. Records are missing or were added by hand.`)
    }
  }
  // The content must pass the same validator an imported pack does, so a bad backup cannot break the app.
  const pack = contentPack(backup.content)
  if (Object.values(pack).some((v) => Array.isArray(v) && v.length > 0)) {
    const concepts = new Set((pack.concepts ?? []).map((c) => c.id))
    const result = validatePack(pack, { ...known, conceptIds: new Set([...known.conceptIds, ...concepts]), prerequisites: new Map([...(known.prerequisites ?? [])]) })
    if (!result.ok) errors.push(...result.errors.slice(0, 20).map((e) => `content: ${e}`))
  }
  const digest = await digestOf({ progress: backup.progress, content: backup.content, localStorage: backup.localStorage })
  if (backup.integrity?.algorithm !== "SHA-256" || backup.integrity.digest !== digest) errors.push("The integrity check failed: the file was changed or damaged after it was made, so it cannot be trusted.")
  if (errors.length > 0) return { ok: false, errors: errors.slice(0, 60) }

  const metaKeys = backup.progress.stores.meta.map((m) => (m as { key: string }).key)
  return {
    ok: true,
    backup,
    warnings,
    summary: {
      createdAt: backup.createdAt,
      groups: groupCounts(backup.counts.progress, backup.counts.content, metaKeys),
      settingsPresent: metaKeys.filter((k) => SETTINGS_META_KEYS.includes(k)),
    },
  }
}

/** The content stores rebuilt as a content pack, so the content validator can check them. */
export function contentPack(content: DatabaseData): ContentPack {
  const items = <T>(name: string): T[] => (content.stores[name] ?? []).map((r) => (r as { item: T }).item)
  const exercises = items<{ kind: string }>("exercises")
  return {
    schemaVersion: 1,
    contentVersion: "backup",
    concepts: items("concepts"),
    questions: exercises.filter((e) => e.kind === "question") as never,
    scenarios: exercises.filter((e) => e.kind === "scenario") as never,
    multipleChoice: items("choices"),
    processes: items("processes"),
    threeStatementExercises: items("statementExercises"),
    valuationExercises: items("valuationExercises"),
    quickMathQuestions: items("quickMathQuestions"),
    behaviouralQuestions: items("behaviouralQuestions"),
  }
}
