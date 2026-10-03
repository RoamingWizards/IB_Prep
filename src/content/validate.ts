// Content pack validation. Pure functions with no browser APIs, so the same code runs in the app
// and from the command line (scripts/validate-content.mjs).
import {
  ID_PATTERN,
  ID_PREFIX,
  MAX_ID_LENGTH,
  MAX_OPTION_ID_LENGTH,
  MAX_OPTIONS,
  MAX_STAGES,
  MIN_OPTIONS,
  SCHEMA_VERSION,
} from "./schema.ts"
import type {
  ChoiceOption,
  Concept,
  ContentPack,
  Exercise,
  ExerciseKind,
  Formula,
  Given,
  MultipleChoice,
  Process,
  ProcessStage,
  StatementRow,
  StatementTable,
} from "./types.ts"

export type ValidationResult =
  | { ok: true; pack: ContentPack; warnings: string[] }
  | { ok: false; errors: string[] }


/** What already exists in the app, so a pack can refer to items it does not define itself. */
export interface KnownIds {
  conceptIds: ReadonlySet<string>
  choiceIds: ReadonlySet<string>
  /** Stage ID -> the process that owns it, for stages in content that already exists. */
  stageOwners: ReadonlyMap<string, string>
}

export const NO_KNOWN: KnownIds = { conceptIds: new Set(), choiceIds: new Set(), stageOwners: new Map() }

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


function validateChoice(raw: unknown, index: number, r: Report): MultipleChoice | null {
  const at = `multipleChoice[${index}]`
  if (!isRecord(raw)) {
    r.error(`${at}: must be an object.`)
    return null
  }
  const before = r.errors.length
  const id = checkId(raw.id, ID_PREFIX.choice, at, r)
  const label = id ? `${at} (${id})` : at
  if (!isText(raw.category, 80)) r.error(`${label}.category: required text (up to 80 characters).`)
  if (!isText(raw.subcategory, 80)) r.error(`${label}.subcategory: required text (up to 80 characters).`)
  if (!isText(raw.title, 200)) r.error(`${label}.title: required text.`)
  if (!isText(raw.prompt)) r.error(`${label}.prompt: required text.`)

  const options: ChoiceOption[] = []
  let optionsOk = false
  if (!Array.isArray(raw.options) || raw.options.length < MIN_OPTIONS || raw.options.length > MAX_OPTIONS) {
    r.error(`${label}.options: must be a list of ${MIN_OPTIONS} to ${MAX_OPTIONS} options.`)
  } else {
    optionsOk = true
    const seenIds = new Map<string, number>()
    const seenText = new Set<string>()
    raw.options.forEach((o: unknown, i: number) => {
      const oat = `${label}.options[${i}]`
      if (!isRecord(o)) {
        optionsOk = false
        return r.error(`${oat}: must be an object with "id" and "text".`)
      }
      const oid = o.id
      if (typeof oid !== "string" || oid.length > MAX_OPTION_ID_LENGTH || !ID_PATTERN.test(oid)) {
        optionsOk = false
        r.error(`${oat}.id: must be lowercase letters, digits and hyphens (for example "a").`)
      } else if (seenIds.has(oid)) {
        optionsOk = false
        r.error(`${oat}.id: duplicate option id "${oid}" (also options[${seenIds.get(oid)}]).`)
      } else seenIds.set(oid, i)
      if (!isText(o.text, 1000)) {
        optionsOk = false
        r.error(`${oat}.text: required text.`)
      } else if (seenText.has(o.text.trim().toLowerCase())) {
        r.warn(`${oat}.text: the same wording appears in another option.`)
      } else seenText.add(o.text.trim().toLowerCase())
      warnUnknown(o, ["id", "text"], oat, r)
      if (typeof oid === "string" && isText(o.text, 1000)) options.push({ id: oid, text: o.text })
    })
  }
  if (typeof raw.correctOptionId !== "string" || raw.correctOptionId === "") {
    r.error(`${label}.correctOptionId: required (the id of the correct option).`)
  } else if (optionsOk && !options.some((o) => o.id === raw.correctOptionId)) {
    r.error(`${label}.correctOptionId: "${raw.correctOptionId}" is not one of this question's option ids.`)
  }
  if (!Array.isArray(raw.explanation) || raw.explanation.length === 0 || !raw.explanation.every((p) => isText(p))) {
    r.error(`${label}.explanation: must be a non-empty list of text paragraphs.`)
  }
  if (!Array.isArray(raw.conceptIds) || raw.conceptIds.length === 0 || !raw.conceptIds.every((c) => typeof c === "string" && c)) {
    r.error(`${label}.conceptIds: must be a non-empty list of concept IDs.`)
  }
  warnUnknown(
    raw,
    ["id", "category", "subcategory", "title", "prompt", "options", "correctOptionId", "explanation", "conceptIds"],
    label,
    r,
  )
  if (r.errors.length > before || !id) return null
  return {
    id,
    category: (raw.category as string).trim(),
    subcategory: (raw.subcategory as string).trim(),
    title: raw.title as string,
    prompt: raw.prompt as string,
    options,
    correctOptionId: raw.correctOptionId as string,
    explanation: raw.explanation as string[],
    conceptIds: raw.conceptIds as string[],
  }
}

function validateProcess(raw: unknown, index: number, r: Report): Process | null {
  const at = `processes[${index}]`
  if (!isRecord(raw)) {
    r.error(`${at}: must be an object.`)
    return null
  }
  const before = r.errors.length
  const id = checkId(raw.id, ID_PREFIX.process, at, r)
  const label = id ? `${at} (${id})` : at
  if (!isText(raw.title, 200)) r.error(`${label}.title: required text.`)
  if (raw.description !== undefined && !isText(raw.description, 2000)) r.error(`${label}.description: must be text when present.`)

  const stages: ProcessStage[] = []
  if (!Array.isArray(raw.stages) || raw.stages.length === 0 || raw.stages.length > MAX_STAGES) {
    r.error(`${label}.stages: must be an ordered list of 1 to ${MAX_STAGES} stages.`)
  } else {
    const seen = new Map<string, number>()
    raw.stages.forEach((st: unknown, i: number) => {
      const sat = `${label}.stages[${i}]`
      if (!isRecord(st)) return r.error(`${sat}: must be an object.`)
      const sid = checkId(st.id, ID_PREFIX.stage, sat, r)
      if (sid) {
        if (seen.has(sid)) r.error(`${sat}.id: duplicate stage id "${sid}" (also stages[${seen.get(sid)}]).`)
        else seen.set(sid, i)
      }
      if (!isText(st.title, 200)) r.error(`${sat}.title: required text.`)
      if (typeof st.choiceId !== "string" || st.choiceId === "") r.error(`${sat}.choiceId: required (the id of a multiple-choice question).`)
      warnUnknown(st, ["id", "title", "choiceId"], sat, r)
      if (sid && isText(st.title, 200) && typeof st.choiceId === "string" && st.choiceId) {
        stages.push({ id: sid, title: st.title, choiceId: st.choiceId })
      }
    })
  }
  warnUnknown(raw, ["id", "title", "description", "stages"], label, r)
  if (r.errors.length > before || !id) return null
  const out: Process = { id, title: raw.title as string, stages }
  if (raw.description !== undefined) out.description = raw.description as string
  return out
}

/**
 * Checks a parsed JSON value against the content pack schema. `known` describes what already exists in the app;
 * a pack may refer to those items or to ones it defines itself.
 * Collects every problem rather than stopping at the first, and never changes anything.
 */
export function validatePack(raw: unknown, known: KnownIds): ValidationResult {
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
  for (const key of ["concepts", "questions", "scenarios", "multipleChoice", "processes"] as const) {
    if (raw[key] !== undefined && !Array.isArray(raw[key])) r.error(`${key}: must be a list when present.`)
  }
  warnUnknown(
    raw,
    ["schemaVersion", "contentVersion", "title", "description", "exportedAt", "concepts", "questions", "scenarios", "multipleChoice", "processes"],
    "pack",
    r,
  )
  if (r.errors.length > 0) return { ok: false, errors: r.finish() }

  // Collections left out of a pack are simply empty: import only adds and updates, so nothing existing is affected.
  const list = (key: string) => (Array.isArray(raw[key]) ? (raw[key] as unknown[]) : [])
  const concepts = list("concepts").map((c, i) => validateConcept(c, i, r))
  const questions = list("questions").map((q, i) => validateExercise(q, "question", i, r))
  const scenarios = list("scenarios").map((s, i) => validateExercise(s, "scenario", i, r))
  const choices = list("multipleChoice").map((c, i) => validateChoice(c, i, r))
  const processes = list("processes").map((p, i) => validateProcess(p, i, r))

  if (concepts.length + questions.length + scenarios.length + choices.length + processes.length === 0) {
    r.error("The pack contains no concepts, questions, scenarios, multiple-choice questions or processes.")
  }

  // Duplicate IDs anywhere in the pack, including stage IDs inside processes.
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
  list("multipleChoice").forEach((c, i) => isRecord(c) && track(c.id, `multipleChoice[${i}]`))
  list("processes").forEach((p, i) => {
    if (!isRecord(p)) return
    track(p.id, `processes[${i}]`)
    if (Array.isArray(p.stages)) p.stages.forEach((st, j) => isRecord(st) && track(st.id, `processes[${i}].stages[${j}]`))
  })

  // Concept references must resolve to this pack or to existing content.
  // Use every ID the pack declares, even for items that have other problems, so one bad item
  // does not also make everything that points at it look like a broken reference.
  const declared = (key: string) => new Set(list(key).flatMap((x) => (isRecord(x) && typeof x.id === "string" ? [x.id] : [])))
  const packConcepts = declared("concepts")
  const check = (items: unknown[], key: string) =>
    items.forEach((item, i) => {
      if (!isRecord(item) || !Array.isArray(item.conceptIds)) return
      const at = `${key}[${i}]${typeof item.id === "string" ? ` (${item.id})` : ""}`
      const unique = new Set<string>()
      for (const cid of item.conceptIds) {
        if (typeof cid !== "string") continue
        if (unique.has(cid)) r.warn(`${at}.conceptIds: "${cid}" is listed more than once.`)
        unique.add(cid)
        if (!packConcepts.has(cid) && !known.conceptIds.has(cid)) {
          r.error(`${at}.conceptIds: unknown concept "${cid}". Define it in this pack's concepts or import it first.`)
        }
      }
    })
  check(list("questions"), "questions")
  check(list("scenarios"), "scenarios")
  check(list("multipleChoice"), "multipleChoice")

  // Each stage must point at a multiple-choice question in this pack or already in the app,
  // and a stage ID may not already belong to a different process.
  const packChoices = declared("multipleChoice")
  list("processes").forEach((p, i) => {
    if (!isRecord(p) || !Array.isArray(p.stages)) return
    const pid = typeof p.id === "string" ? p.id : null
    const usedChoices = new Set<string>()
    p.stages.forEach((st, j) => {
      if (!isRecord(st)) return
      const at = `processes[${i}]${pid ? ` (${pid})` : ""}.stages[${j}]`
      if (typeof st.choiceId === "string" && st.choiceId) {
        if (!packChoices.has(st.choiceId) && !known.choiceIds.has(st.choiceId)) {
          r.error(`${at}.choiceId: unknown multiple-choice question "${st.choiceId}". Define it in this pack's multipleChoice or import it first.`)
        }
        if (usedChoices.has(st.choiceId)) r.warn(`${at}.choiceId: "${st.choiceId}" is already used by an earlier stage of this process.`)
        usedChoices.add(st.choiceId)
      }
      const owner = typeof st.id === "string" ? known.stageOwners.get(st.id) : undefined
      if (owner && owner !== pid) r.error(`${at}.id: stage id "${st.id}" already belongs to process "${owner}".`)
    })
  })

  if (r.errors.length > 0) return { ok: false, errors: r.finish() }

  const pack: ContentPack = {
    schemaVersion: SCHEMA_VERSION,
    contentVersion: (raw.contentVersion as string).trim(),
    concepts: concepts as Concept[],
    questions: questions as Exercise[],
    scenarios: scenarios as Exercise[],
    multipleChoice: choices as MultipleChoice[],
    processes: processes as Process[],
  }
  if (raw.title !== undefined) pack.title = raw.title as string
  if (raw.description !== undefined) pack.description = raw.description as string
  return { ok: true, pack, warnings: r.warnings }
}

/** Parses file text, then validates it. A syntax error is reported like any other validation problem. */
export function parsePack(text: string, known: KnownIds): ValidationResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (err) {
    return { ok: false, errors: [`The file is not valid JSON: ${err instanceof Error ? err.message : String(err)}`] }
  }
  return validatePack(raw, known)
}
