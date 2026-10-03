// Content pack validation. Pure functions with no browser APIs, so the same code runs in the app
// and from the command line (scripts/validate-content.mjs).
import { ID_PATTERN, ID_PREFIX, MAX_ID_LENGTH, SCHEMA_VERSION } from "./schema.ts"
import type {
  Concept,
  ContentPack,
  Exercise,
  ExerciseKind,
  Formula,
  Given,
  StatementRow,
  StatementTable,
} from "./types.ts"

export type ValidationResult =
  | { ok: true; pack: ContentPack; warnings: string[] }
  | { ok: false; errors: string[] }

const MAX_ERRORS = 100
const ROW_STYLES = ["subtotal", "total"]
const ROW_FORMATS = ["number", "percent", "multiple"]

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v)
const isText = (v: unknown, max = 5000): v is string =>
  typeof v === "string" && v.trim().length > 0 && v.length <= max

class Report {
  errors: string[] = []
  warnings: string[] = []
  private overflow = 0
  error(message: string) {
    if (this.errors.length < MAX_ERRORS) this.errors.push(message)
    else this.overflow++
  }
  warn(message: string) {
    this.warnings.push(message)
  }
  finish() {
    if (this.overflow > 0) this.errors.push(`…and ${this.overflow} more problems not shown.`)
    return this.errors
  }
}

function warnUnknown(obj: Record<string, unknown>, known: string[], at: string, r: Report) {
  for (const key of Object.keys(obj)) {
    if (!known.includes(key)) r.warn(`${at}: unknown field "${key}" is ignored.`)
  }
}

function checkId(value: unknown, prefix: string, at: string, r: Report): string | null {
  if (typeof value !== "string" || value === "") {
    r.error(`${at}.id: required text.`)
    return null
  }
  if (value.length > MAX_ID_LENGTH || !ID_PATTERN.test(value)) {
    r.error(`${at}.id: "${value}" must be lowercase letters, digits and hyphens (for example "${prefix}example-001").`)
    return null
  }
  if (!value.startsWith(prefix)) {
    r.error(`${at}.id: "${value}" must start with "${prefix}".`)
    return null
  }
  return value
}

function validateConcept(raw: unknown, index: number, r: Report): Concept | null {
  const at = `concepts[${index}]`
  if (!isRecord(raw)) {
    r.error(`${at}: must be an object.`)
    return null
  }
  const before = r.errors.length
  const id = checkId(raw.id, ID_PREFIX.concept, at, r)
  const label = id ? `${at} (${id})` : at
  if (!isText(raw.name, 200)) r.error(`${label}.name: required text.`)
  if (!isText(raw.summary)) r.error(`${label}.summary: required text.`)
  warnUnknown(raw, ["id", "name", "summary"], label, r)
  if (r.errors.length > before || !id) return null
  return { id, name: raw.name as string, summary: raw.summary as string }
}

function validateTable(raw: unknown, at: string, r: Report): StatementTable | null {
  if (!isRecord(raw)) {
    r.error(`${at}: must be an object.`)
    return null
  }
  const before = r.errors.length
  if (!isText(raw.title, 200)) r.error(`${at}.title: required text.`)
  if (raw.unit !== undefined && !isText(raw.unit, 100)) r.error(`${at}.unit: must be text when present.`)
  const columns = raw.columns
  const columnsOk = Array.isArray(columns) && columns.length > 0 && columns.every((c) => isText(c, 100))
  if (!columnsOk) r.error(`${at}.columns: must be a non-empty list of text.`)
  const rows: StatementRow[] = []
  if (!Array.isArray(raw.rows) || raw.rows.length === 0) {
    r.error(`${at}.rows: must be a non-empty list.`)
  } else {
    raw.rows.forEach((row: unknown, i: number) => {
      const rat = `${at}.rows[${i}]`
      if (!isRecord(row)) return r.error(`${rat}: must be an object.`)
      let ok = true
      if (!isText(row.label, 200)) {
        ok = false
        r.error(`${rat}.label: required text.`)
      }
      const values = row.values
      if (!Array.isArray(values) || !values.every((v) => v === null || (typeof v === "number" && Number.isFinite(v)))) {
        ok = false
        r.error(`${rat}.values: must be a list of numbers or null.`)
      } else if (columnsOk && values.length !== (columns as unknown[]).length) {
        ok = false
        r.error(`${rat}.values: has ${values.length} values but the table has ${(columns as unknown[]).length} columns.`)
      }
      if (row.style !== undefined && !ROW_STYLES.includes(row.style as string)) {
        ok = false
        r.error(`${rat}.style: must be one of ${ROW_STYLES.join(", ")}.`)
      }
      if (row.format !== undefined && !ROW_FORMATS.includes(row.format as string)) {
        ok = false
        r.error(`${rat}.format: must be one of ${ROW_FORMATS.join(", ")}.`)
      }
      warnUnknown(row, ["label", "values", "style", "format"], rat, r)
      if (ok) {
        const out: StatementRow = { label: row.label as string, values: values as (number | null)[] }
        if (row.style !== undefined) out.style = row.style as StatementRow["style"]
        if (row.format !== undefined) out.format = row.format as StatementRow["format"]
        rows.push(out)
      }
    })
  }
  warnUnknown(raw, ["title", "unit", "columns", "rows"], at, r)
  if (r.errors.length > before) return null
  const table: StatementTable = { title: raw.title as string, columns: columns as string[], rows }
  if (raw.unit !== undefined) table.unit = raw.unit as string
  return table
}

function validateExercise(raw: unknown, kind: ExerciseKind, index: number, r: Report): Exercise | null {
  const key = kind === "question" ? "questions" : "scenarios"
  const at = `${key}[${index}]`
  if (!isRecord(raw)) {
    r.error(`${at}: must be an object.`)
    return null
  }
  const before = r.errors.length
  const id = checkId(raw.id, ID_PREFIX[kind], at, r)
  const label = id ? `${at} (${id})` : at

  if (raw.kind !== kind) r.error(`${label}.kind: must be "${kind}" in the ${key} list.`)
  if (!isText(raw.category, 80)) r.error(`${label}.category: required text (up to 80 characters).`)
  if (!isText(raw.subcategory, 80)) r.error(`${label}.subcategory: required text (up to 80 characters).`)
  if (!isText(raw.title, 200)) r.error(`${label}.title: required text.`)
  if (!isText(raw.prompt)) r.error(`${label}.prompt: required text.`)

  if (!Array.isArray(raw.answer) || raw.answer.length === 0 || !raw.answer.every((p) => isText(p))) {
    r.error(`${label}.answer: must be a non-empty list of text paragraphs.`)
  }
  if (!Array.isArray(raw.conceptIds) || raw.conceptIds.length === 0 || !raw.conceptIds.every((c) => typeof c === "string" && c)) {
    r.error(`${label}.conceptIds: must be a non-empty list of concept IDs.`)
  }

  let givens: Given[] | undefined
  if (raw.givens !== undefined) {
    if (!Array.isArray(raw.givens) || !raw.givens.every((g) => isRecord(g) && isText(g.label, 200) && isText(g.value, 500))) {
      r.error(`${label}.givens: must be a list of { "label", "value" } text pairs.`)
    } else givens = raw.givens.map((g) => ({ label: g.label, value: g.value }))
  }
  let formulas: Formula[] | undefined
  if (raw.formulas !== undefined) {
    if (!Array.isArray(raw.formulas) || !raw.formulas.every((f) => isRecord(f) && isText(f.label, 200) && isText(f.expression, 500))) {
      r.error(`${label}.formulas: must be a list of { "label", "expression" } text pairs.`)
    } else formulas = raw.formulas.map((f) => ({ label: f.label, expression: f.expression }))
  }
  let tables: StatementTable[] | undefined
  if (raw.tables !== undefined) {
    if (!Array.isArray(raw.tables)) r.error(`${label}.tables: must be a list.`)
    else {
      const parsed = raw.tables.map((t: unknown, i: number) => validateTable(t, `${label}.tables[${i}]`, r))
      if (parsed.every((t) => t !== null)) tables = parsed as StatementTable[]
    }
  }

  warnUnknown(
    raw,
    ["id", "kind", "category", "subcategory", "title", "prompt", "givens", "answer", "conceptIds", "formulas", "tables"],
    label,
    r,
  )
  if (r.errors.length > before || !id) return null

  const out: Exercise = {
    id,
    kind,
    category: (raw.category as string).trim(),
    subcategory: (raw.subcategory as string).trim(),
    title: raw.title as string,
    prompt: raw.prompt as string,
    answer: raw.answer as string[],
    conceptIds: raw.conceptIds as string[],
  }
  if (givens) out.givens = givens
  if (formulas) out.formulas = formulas
  if (tables) out.tables = tables
  return out
}

/**
 * Checks a parsed JSON value against the content pack schema. `knownConceptIds` are concepts that already
 * exist in the app; exercises may reference those or concepts defined in the same pack.
 * Collects every problem rather than stopping at the first, and never changes anything.
 */
export function validatePack(raw: unknown, knownConceptIds: ReadonlySet<string>): ValidationResult {
  const r = new Report()
  if (!isRecord(raw)) return { ok: false, errors: ["The file must contain a JSON object (a content pack)."] }

  if (raw.schemaVersion !== SCHEMA_VERSION) {
    r.error(
      raw.schemaVersion === undefined
        ? `schemaVersion: required (this app reads schemaVersion ${SCHEMA_VERSION}).`
        : `schemaVersion: ${JSON.stringify(raw.schemaVersion)} is not supported; this app reads schemaVersion ${SCHEMA_VERSION}.`,
    )
  }
  if (!isText(raw.contentVersion, 64)) r.error("contentVersion: required text (up to 64 characters), for example \"2026.10.1\".")
  for (const key of ["title", "description", "exportedAt"] as const) {
    if (raw[key] !== undefined && !isText(raw[key], 1000)) r.error(`${key}: must be text when present.`)
  }
  for (const key of ["concepts", "questions", "scenarios"] as const) {
    if (raw[key] !== undefined && !Array.isArray(raw[key])) r.error(`${key}: must be a list when present.`)
  }
  warnUnknown(raw, ["schemaVersion", "contentVersion", "title", "description", "exportedAt", "concepts", "questions", "scenarios"], "pack", r)
  if (r.errors.length > 0) return { ok: false, errors: r.finish() }

  const list = (key: string) => (Array.isArray(raw[key]) ? (raw[key] as unknown[]) : [])
  const concepts = list("concepts").map((c, i) => validateConcept(c, i, r))
  const questions = list("questions").map((q, i) => validateExercise(q, "question", i, r))
  const scenarios = list("scenarios").map((s, i) => validateExercise(s, "scenario", i, r))

  if (concepts.length + questions.length + scenarios.length === 0) r.error("The pack contains no concepts, questions or scenarios.")

  // Duplicate IDs anywhere in the pack.
  const seen = new Map<string, string>()
  const track = (id: unknown, where: string) => {
    if (typeof id !== "string") return
    const first = seen.get(id)
    if (first) r.error(`Duplicate id "${id}" at ${first} and ${where}.`)
    else seen.set(id, where)
  }
  list("concepts").forEach((c, i) => isRecord(c) && track(c.id, `concepts[${i}]`))
  list("questions").forEach((q, i) => isRecord(q) && track(q.id, `questions[${i}]`))
  list("scenarios").forEach((s, i) => isRecord(s) && track(s.id, `scenarios[${i}]`))

  // Concept references must resolve to this pack or to existing content.
  const packConcepts = new Set(concepts.flatMap((c) => (c ? [c.id] : [])))
  const check = (items: unknown[], key: string) =>
    items.forEach((item, i) => {
      if (!isRecord(item) || !Array.isArray(item.conceptIds)) return
      const at = `${key}[${i}]${typeof item.id === "string" ? ` (${item.id})` : ""}`
      const unique = new Set<string>()
      for (const cid of item.conceptIds) {
        if (typeof cid !== "string") continue
        if (unique.has(cid)) r.warn(`${at}.conceptIds: "${cid}" is listed more than once.`)
        unique.add(cid)
        if (!packConcepts.has(cid) && !knownConceptIds.has(cid)) {
          r.error(`${at}.conceptIds: unknown concept "${cid}". Define it in this pack's concepts or import it first.`)
        }
      }
    })
  check(list("questions"), "questions")
  check(list("scenarios"), "scenarios")

  if (r.errors.length > 0) return { ok: false, errors: r.finish() }

  const pack: ContentPack = {
    schemaVersion: SCHEMA_VERSION,
    contentVersion: (raw.contentVersion as string).trim(),
    concepts: concepts as Concept[],
    questions: questions as Exercise[],
    scenarios: scenarios as Exercise[],
  }
  if (raw.title !== undefined) pack.title = raw.title as string
  if (raw.description !== undefined) pack.description = raw.description as string
  return { ok: true, pack, warnings: r.warnings }
}

/** Parses file text, then validates it. A syntax error is reported like any other validation problem. */
export function parsePack(text: string, knownConceptIds: ReadonlySet<string>): ValidationResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (err) {
    return { ok: false, errors: [`The file is not valid JSON: ${err instanceof Error ? err.message : String(err)}`] }
  }
  return validatePack(raw, knownConceptIds)
}
