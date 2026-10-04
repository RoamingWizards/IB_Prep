// Content pack validation. Pure functions with no browser APIs, so the same code runs in the app
// and from the command line (scripts/validate-content.mjs).
import {
  ID_PATTERN,
  ID_PREFIX,
  MAX_DECIMALS,
  MAX_GRAPH_EDGES,
  MAX_ID_LENGTH,
  MAX_INDENT,
  DIFFICULTIES,
  MAX_OPTION_ID_LENGTH,
  MAX_PREREQUISITES,
  MAX_QUICK_MATH_ASSUMPTIONS,
  MAX_OPTIONS,
  MAX_STAGES,
  MAX_STATEMENT_ROWS,
  MAX_STATEMENTS,
  MAX_STEPS,
  MAX_VALUATION_GRAPHS,
  MAX_VALUATION_STEPS,
  MIN_OPTIONS,
  SCHEMA_VERSION,
} from "./schema.ts"
import type {
  ChoiceOption,
  Concept,
  ContentPack,
  Exercise,
  ExplanationConnection,
  ExplanationStep,
  FinancialRow,
  FinancialStatement,
  ExerciseKind,
  Formula,
  Given,
  MultipleChoice,
  Process,
  QuickMathQuestion,
  ProcessStage,
  StatementRow,
  StatementTable,
  ThreeStatementExercise,
  ValuationEdge,
  ValuationEdgeRef,
  ValuationExercise,
  ValuationGraph,
  ValuationStep,
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
  /** Concept ID -> its prerequisite concept IDs, for concepts that already exist. Needed to catch cycles across packs. */
  prerequisites?: ReadonlyMap<string, readonly string[]>
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
  let prerequisiteIds: string[] | undefined
  if (raw.prerequisiteIds !== undefined) {
    const list = raw.prerequisiteIds
    if (
      !Array.isArray(list) ||
      list.length > MAX_PREREQUISITES ||
      !list.every((v) => typeof v === "string" && v.length <= MAX_ID_LENGTH && ID_PATTERN.test(v) && v.startsWith(ID_PREFIX.concept))
    ) {
      r.error(`${label}.prerequisiteIds: must be a list of up to ${MAX_PREREQUISITES} concept IDs (each starting with "${ID_PREFIX.concept}"), or left out.`)
    } else prerequisiteIds = list as string[]
  }
  warnUnknown(raw, ["id", "name", "summary", "prerequisiteIds"], label, r)
  if (r.errors.length > before || !id) return null
  const out: Concept = { id, name: raw.name as string, summary: raw.summary as string }
  if (prerequisiteIds) out.prerequisiteIds = prerequisiteIds
  return out
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


const isFiniteNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v)

function validateStatementExercise(raw: unknown, index: number, r: Report): ThreeStatementExercise | null {
  const at = `threeStatementExercises[${index}]`
  if (!isRecord(raw)) {
    r.error(`${at}: must be an object.`)
    return null
  }
  const before = r.errors.length
  const id = checkId(raw.id, ID_PREFIX.statementExercise, at, r)
  const label = id ? `${at} (${id})` : at
  if (!isText(raw.category, 80)) r.error(`${label}.category: required text (up to 80 characters).`)
  if (!isText(raw.subcategory, 80)) r.error(`${label}.subcategory: required text (up to 80 characters).`)
  if (!isText(raw.title, 200)) r.error(`${label}.title: required text.`)
  if (!isText(raw.units, 40)) r.error(`${label}.units: required text such as "$m" (up to 40 characters).`)
  if (!Array.isArray(raw.instructions) || raw.instructions.length === 0 || !raw.instructions.every((p) => isText(p))) {
    r.error(`${label}.instructions: must be a non-empty list of text paragraphs.`)
  }
  let assumptions: Given[] = []
  if (raw.assumptions !== undefined) {
    if (!Array.isArray(raw.assumptions) || !raw.assumptions.every((g) => isRecord(g) && isText(g.label, 200) && isText(g.value, 500))) {
      r.error(`${label}.assumptions: must be a list of { "label", "value" } text pairs.`)
    } else assumptions = raw.assumptions.map((g) => ({ label: g.label, value: g.value }))
  }
  if (raw.decimals !== undefined && !(Number.isInteger(raw.decimals) && (raw.decimals as number) >= 0 && (raw.decimals as number) <= MAX_DECIMALS)) {
    r.error(`${label}.decimals: must be a whole number from 0 to ${MAX_DECIMALS} when present.`)
  }
  if (!isFiniteNumber(raw.tolerance) || raw.tolerance <= 0) r.error(`${label}.tolerance: must be a number greater than 0 (how close a figure must be to count as correct).`)
  if (!Array.isArray(raw.conceptIds) || raw.conceptIds.length === 0 || !raw.conceptIds.every((c) => typeof c === "string" && c)) {
    r.error(`${label}.conceptIds: must be a non-empty list of concept IDs.`)
  }

  // Statements and their rows. Row IDs are unique across the whole exercise so steps can refer to them directly.
  const statements: FinancialStatement[] = []
  const rowIds = new Map<string, string>() // row id -> where it is defined
  const numericRowIds = new Set<string>()
  let requiredChanges = 0
  if (!Array.isArray(raw.statements) || raw.statements.length === 0 || raw.statements.length > MAX_STATEMENTS) {
    r.error(`${label}.statements: must be an ordered list of 1 to ${MAX_STATEMENTS} statements.`)
  } else {
    const statementIds = new Map<string, number>()
    raw.statements.forEach((st: unknown, si: number) => {
      const sat = `${label}.statements[${si}]`
      if (!isRecord(st)) return r.error(`${sat}: must be an object.`)
      const sid = checkId(st.id, ID_PREFIX.statement, sat, r)
      if (sid) {
        if (statementIds.has(sid)) r.error(`${sat}.id: duplicate statement id "${sid}" (also statements[${statementIds.get(sid)}]).`)
        else statementIds.set(sid, si)
      }
      if (!isText(st.title, 200)) r.error(`${sat}.title: required text.`)
      const rows: FinancialRow[] = []
      if (!Array.isArray(st.rows) || st.rows.length === 0 || st.rows.length > MAX_STATEMENT_ROWS) {
        r.error(`${sat}.rows: must be an ordered list of 1 to ${MAX_STATEMENT_ROWS} rows.`)
      } else {
        st.rows.forEach((row: unknown, ri: number) => {
          const rat = `${sat}.rows[${ri}]`
          if (!isRecord(row)) return r.error(`${rat}: must be an object.`)
          const errorsBefore = r.errors.length
          const rid = checkId(row.id, ID_PREFIX.row, rat, r)
          if (rid) {
            if (rowIds.has(rid)) r.error(`${rat}.id: duplicate row id "${rid}" (also ${rowIds.get(rid)}). Row ids must be unique within the exercise.`)
            else rowIds.set(rid, `statements[${si}].rows[${ri}]`)
          }
          if (!isText(row.label, 200)) r.error(`${rat}.label: required text.`)
          if (row.style !== undefined && !["header", "subtotal", "total"].includes(row.style as string)) {
            r.error(`${rat}.style: must be one of header, subtotal, total.`)
          }
          if (row.indent !== undefined && !(Number.isInteger(row.indent) && (row.indent as number) >= 0 && (row.indent as number) <= MAX_INDENT)) {
            r.error(`${rat}.indent: must be a whole number from 0 to ${MAX_INDENT}.`)
          }
          if (row.tolerance !== undefined && !(isFiniteNumber(row.tolerance) && row.tolerance > 0)) {
            r.error(`${rat}.tolerance: must be a number greater than 0 when present.`)
          }
          if (row.style === "header") {
            if (row.original !== undefined || row.correct !== undefined) r.error(`${rat}: a header row has no figures; remove "original" and "correct".`)
          } else {
            if (!isFiniteNumber(row.original)) r.error(`${rat}.original: required finite number (the starting figure).`)
            if (!isFiniteNumber(row.correct)) r.error(`${rat}.correct: required finite number (the correct figure).`)
          }
          warnUnknown(row, ["id", "label", "style", "indent", "original", "correct", "tolerance"], rat, r)
          if (r.errors.length === errorsBefore && rid) {
            const out: FinancialRow = { id: rid, label: row.label as string }
            if (row.style !== undefined) out.style = row.style as FinancialRow["style"]
            if (row.indent !== undefined) out.indent = row.indent as number
            if (row.style !== "header") {
              out.original = row.original as number
              out.correct = row.correct as number
              numericRowIds.add(rid)
              const tol = (row.tolerance as number | undefined) ?? (isFiniteNumber(raw.tolerance) ? raw.tolerance : 0)
              if (Math.abs((row.correct as number) - (row.original as number)) > tol) requiredChanges++
            }
            if (row.tolerance !== undefined) out.tolerance = row.tolerance as number
            rows.push(out)
          }
        })
      }
      warnUnknown(st, ["id", "title", "rows"], sat, r)
      if (sid && isText(st.title, 200)) statements.push({ id: sid, title: st.title, rows })
    })
  }
  if (rowIds.size > 0 && numericRowIds.size === 0 && r.errors.length === before) r.error(`${label}.statements: at least one row must have figures.`)
  if (r.errors.length === before && requiredChanges === 0) {
    r.warn(`${label}: no row's correct figure differs from its original, so the exercise asks for no changes.`)
  }

  // Worked solution: every row and connection must point at a row that exists.
  const steps: ExplanationStep[] = []
  if (!Array.isArray(raw.steps) || raw.steps.length === 0 || raw.steps.length > MAX_STEPS) {
    r.error(`${label}.steps: must be an ordered list of 1 to ${MAX_STEPS} explanation steps.`)
  } else {
    const stepIds = new Map<string, number>()
    raw.steps.forEach((step: unknown, ti: number) => {
      const tat = `${label}.steps[${ti}]`
      if (!isRecord(step)) return r.error(`${tat}: must be an object.`)
      const errorsBefore = r.errors.length
      const tid = checkId(step.id, ID_PREFIX.step, tat, r)
      if (tid) {
        if (stepIds.has(tid)) r.error(`${tat}.id: duplicate step id "${tid}" (also steps[${stepIds.get(tid)}]).`)
        else stepIds.set(tid, ti)
      }
      if (!isText(step.title, 200)) r.error(`${tat}.title: required text.`)
      if (!isText(step.text, 2000)) r.error(`${tat}.text: required text (up to 2000 characters).`)
      const stepRows: string[] = []
      if (step.rows !== undefined) {
        if (!Array.isArray(step.rows) || !step.rows.every((x) => typeof x === "string" && x)) {
          r.error(`${tat}.rows: must be a list of row IDs when present.`)
        } else {
          for (const rid of step.rows as string[]) {
            if (rowIds.size > 0 && !rowIds.has(rid)) r.error(`${tat}.rows: unknown row "${rid}". It must be a row id defined in this exercise's statements.`)
            else stepRows.push(rid)
          }
        }
      }
      const connections: ExplanationConnection[] = []
      if (step.connections !== undefined) {
        if (!Array.isArray(step.connections)) r.error(`${tat}.connections: must be a list when present.`)
        else {
          step.connections.forEach((c: unknown, ci: number) => {
            const cat = `${tat}.connections[${ci}]`
            if (!isRecord(c)) return r.error(`${cat}: must be an object with "from" and "to".`)
            let ok = true
            for (const end of ["from", "to"] as const) {
              const v = c[end]
              if (typeof v !== "string" || !v) {
                ok = false
                r.error(`${cat}.${end}: required row id.`)
              } else if (rowIds.size > 0 && !numericRowIds.has(v)) {
                ok = false
                r.error(
                  rowIds.has(v)
                    ? `${cat}.${end}: "${v}" is a header row; connections must join rows that have figures.`
                    : `${cat}.${end}: unknown row "${v}". It must be a row id defined in this exercise's statements.`,
                )
              }
            }
            if (ok && c.from === c.to) {
              ok = false
              r.error(`${cat}: a connection must join two different rows.`)
            }
            if (c.label !== undefined && !isText(c.label, 120)) {
              ok = false
              r.error(`${cat}.label: must be short text (up to 120 characters) when present.`)
            }
            warnUnknown(c, ["from", "to", "label"], cat, r)
            if (ok) {
              const out: ExplanationConnection = { from: c.from as string, to: c.to as string }
              if (c.label !== undefined) out.label = c.label as string
              connections.push(out)
            }
          })
        }
      }
      if (stepRows.length === 0 && connections.length === 0 && r.errors.length === errorsBefore) {
        r.warn(`${tat}: no rows or connections, so nothing will be highlighted for this step.`)
      }
      warnUnknown(step, ["id", "title", "text", "rows", "connections"], tat, r)
      if (tid && isText(step.title, 200) && isText(step.text, 2000) && r.errors.length === errorsBefore) {
        steps.push({ id: tid, title: step.title, text: step.text, rows: stepRows, connections })
      }
    })
  }

  warnUnknown(
    raw,
    ["id", "category", "subcategory", "title", "instructions", "assumptions", "units", "decimals", "tolerance", "conceptIds", "statements", "steps"],
    label,
    r,
  )
  if (r.errors.length > before || !id) return null
  const out: ThreeStatementExercise = {
    id,
    category: (raw.category as string).trim(),
    subcategory: (raw.subcategory as string).trim(),
    title: raw.title as string,
    instructions: raw.instructions as string[],
    assumptions,
    units: raw.units as string,
    tolerance: raw.tolerance as number,
    conceptIds: raw.conceptIds as string[],
    statements,
    steps,
  }
  if (raw.decimals !== undefined) out.decimals = raw.decimals as number
  return out
}

/** One cycle in a "needs" graph (concept -> its prerequisites) as a path that ends where it starts, or null. */
export function findCycle(needs: ReadonlyMap<string, readonly string[]>): string[] | null {
  const state = new Map<string, 1 | 2>() // 1 = on the current path, 2 = finished
  const path: string[] = []
  const visit = (n: string): string[] | null => {
    if (state.get(n) === 2) return null
    if (state.get(n) === 1) return [...path.slice(path.indexOf(n)), n]
    state.set(n, 1)
    path.push(n)
    for (const m of needs.get(n) ?? []) {
      const found = visit(m)
      if (found) return found
    }
    path.pop()
    state.set(n, 2)
    return null
  }
  for (const n of [...needs.keys()].sort()) {
    const found = visit(n)
    if (found) return found
  }
  return null
}

/** True if the directed pairs contain a cycle. */
function hasCycle(nodes: string[], pairs: [string, string][]): boolean {
  const next = new Map<string, string[]>(nodes.map((n) => [n, []]))
  for (const [a, b] of pairs) next.get(a)?.push(b)
  const state = new Map<string, 1 | 2>() // 1 = on the current path, 2 = finished
  const visit = (n: string): boolean => {
    if (state.get(n) === 2) return false
    if (state.get(n) === 1) return true
    state.set(n, 1)
    for (const m of next.get(n) ?? []) if (visit(m)) return true
    state.set(n, 2)
    return false
  }
  return nodes.some(visit)
}

function validateValuationExercise(raw: unknown, index: number, r: Report): ValuationExercise | null {
  const at = `valuationExercises[${index}]`
  if (!isRecord(raw)) {
    r.error(`${at}: must be an object.`)
    return null
  }
  const before = r.errors.length
  const id = checkId(raw.id, ID_PREFIX.valuationExercise, at, r)
  const label = id ? `${at} (${id})` : at
  if (!isText(raw.category, 80)) r.error(`${label}.category: required text (up to 80 characters).`)
  if (!isText(raw.subcategory, 80)) r.error(`${label}.subcategory: required text (up to 80 characters).`)
  if (!isText(raw.title, 200)) r.error(`${label}.title: required text.`)
  if (!isText(raw.task, 600)) r.error(`${label}.task: required text stating clearly what the learner must build (up to 600 characters).`)
  if (!Array.isArray(raw.instructions) || raw.instructions.length === 0 || !raw.instructions.every((p) => isText(p))) {
    r.error(`${label}.instructions: must be a non-empty list of text paragraphs.`)
  }
  let assumptions: Given[] = []
  if (raw.assumptions !== undefined) {
    if (!Array.isArray(raw.assumptions) || !raw.assumptions.every((g) => isRecord(g) && isText(g.label, 200) && isText(g.value, 500))) {
      r.error(`${label}.assumptions: must be a list of { "label", "value" } text pairs.`)
    } else assumptions = raw.assumptions.map((g) => ({ label: g.label, value: g.value }))
  }
  if (!Array.isArray(raw.conceptIds) || raw.conceptIds.length === 0 || !raw.conceptIds.every((c) => typeof c === "string" && c)) {
    r.error(`${label}.conceptIds: must be a non-empty list of concept IDs.`)
  }

  // The step bank.
  const steps: ValuationStep[] = []
  const stepIds = new Set<string>()
  if (!Array.isArray(raw.steps) || raw.steps.length < 2 || raw.steps.length > MAX_VALUATION_STEPS) {
    r.error(`${label}.steps: must be a list of 2 to ${MAX_VALUATION_STEPS} steps (distractors included).`)
  } else {
    const seen = new Map<string, number>()
    raw.steps.forEach((st: unknown, i: number) => {
      const sat = `${label}.steps[${i}]`
      if (!isRecord(st)) return r.error(`${sat}: must be an object.`)
      const errorsBefore = r.errors.length
      const sid = checkId(st.id, ID_PREFIX.valuationStep, sat, r)
      if (sid) {
        if (seen.has(sid)) r.error(`${sat}.id: duplicate step id "${sid}" (also steps[${seen.get(sid)}]).`)
        else {
          seen.set(sid, i)
          stepIds.add(sid)
        }
      }
      if (!isText(st.label, 120)) r.error(`${sat}.label: required text (up to 120 characters).`)
      if (st.detail !== undefined && !isText(st.detail, 300)) r.error(`${sat}.detail: must be text when present.`)
      if (!isText(st.explanation, 1000)) r.error(`${sat}.explanation: required text saying why this step belongs, or why it is a distractor.`)
      warnUnknown(st, ["id", "label", "detail", "explanation"], sat, r)
      if (r.errors.length === errorsBefore && sid) {
        const out: ValuationStep = { id: sid, label: st.label as string, explanation: st.explanation as string }
        if (st.detail !== undefined) out.detail = st.detail as string
        steps.push(out)
      }
    })
  }

  // Distractors: steps that belong to no accepted solution.
  const distractors: string[] = []
  if (raw.distractors !== undefined) {
    if (!Array.isArray(raw.distractors) || !raw.distractors.every((d) => typeof d === "string" && d)) {
      r.error(`${label}.distractors: must be a list of step IDs when present.`)
    } else {
      const seenD = new Set<string>()
      for (const d of raw.distractors as string[]) {
        if (stepIds.size > 0 && !stepIds.has(d)) r.error(`${label}.distractors: unknown step "${d}". It must be a step id defined in this exercise's steps.`)
        else if (seenD.has(d)) r.warn(`${label}.distractors: "${d}" is listed more than once.`)
        else {
          seenD.add(d)
          distractors.push(d)
        }
      }
    }
  }

  // Accepted solutions.
  const graphs: ValuationGraph[] = []
  const used = new Set<string>()
  const edgeIds = new Map<string, string>()
  if (!Array.isArray(raw.solutions) || raw.solutions.length === 0 || raw.solutions.length > MAX_VALUATION_GRAPHS) {
    r.error(`${label}.solutions: must be a list of 1 to ${MAX_VALUATION_GRAPHS} accepted solution graphs.`)
  } else {
    const graphIds = new Map<string, number>()
    raw.solutions.forEach((g: unknown, gi: number) => {
      const gat = `${label}.solutions[${gi}]`
      if (!isRecord(g)) return r.error(`${gat}: must be an object.`)
      const errorsBefore = r.errors.length
      const gid = checkId(g.id, ID_PREFIX.valuationGraph, gat, r)
      if (gid) {
        if (graphIds.has(gid)) r.error(`${gat}.id: duplicate solution id "${gid}" (also solutions[${graphIds.get(gid)}]).`)
        else graphIds.set(gid, gi)
      }
      if (!isText(g.title, 200)) r.error(`${gat}.title: required text.`)
      const gSteps: string[] = []
      if (!Array.isArray(g.steps) || g.steps.length < 2 || !g.steps.every((x) => typeof x === "string" && x)) {
        r.error(`${gat}.steps: must be a list of at least 2 step IDs.`)
      } else {
        for (const sid of g.steps as string[]) {
          if (stepIds.size > 0 && !stepIds.has(sid)) r.error(`${gat}.steps: unknown step "${sid}". It must be a step id defined in this exercise's steps.`)
          else if (distractors.includes(sid)) r.error(`${gat}.steps: "${sid}" is listed as a distractor, so it cannot be part of a solution.`)
          else if (gSteps.includes(sid)) r.error(`${gat}.steps: "${sid}" is listed more than once.`)
          else {
            gSteps.push(sid)
            used.add(sid)
          }
        }
      }
      const inGraph = new Set(gSteps)
      const gEdges: ValuationEdge[] = []
      const pairs = new Set<string>()
      const acyclic: [string, string][] = []
      const checkRef = (ref: unknown, rat: string): ValuationEdgeRef | null => {
        if (!isRecord(ref)) {
          r.error(`${rat}: must be an object with "from" and "to".`)
          return null
        }
        let ok = true
        for (const end of ["from", "to"] as const) {
          const v = ref[end]
          if (typeof v !== "string" || !v) {
            ok = false
            r.error(`${rat}.${end}: required step id.`)
          } else if (inGraph.size > 0 && !inGraph.has(v)) {
            ok = false
            r.error(`${rat}.${end}: "${v}" is not one of this solution's steps.`)
          }
        }
        if (!ok) return null
        if (ref.from === ref.to) {
          r.error(`${rat}: a connection must join two different steps.`)
          return null
        }
        const key = `${ref.from}>${ref.to}`
        if (pairs.has(key)) {
          r.error(`${rat}: the connection ${ref.from} -> ${ref.to} appears more than once in this solution.`)
          return null
        }
        pairs.add(key)
        return { from: ref.from as string, to: ref.to as string }
      }
      if (!Array.isArray(g.edges) || g.edges.length === 0 || g.edges.length > MAX_GRAPH_EDGES) {
        r.error(`${gat}.edges: must be a list of 1 to ${MAX_GRAPH_EDGES} connections.`)
      } else {
        g.edges.forEach((e: unknown, ei: number) => {
          const eat = `${gat}.edges[${ei}]`
          if (!isRecord(e)) return r.error(`${eat}: must be an object.`)
          const edgeErrors = r.errors.length
          const eid = checkId(e.id, ID_PREFIX.valuationEdge, eat, r)
          if (eid) {
            if (edgeIds.has(eid)) r.error(`${eat}.id: duplicate connection id "${eid}" (also ${edgeIds.get(eid)}). Connection ids must be unique within the exercise.`)
            else edgeIds.set(eid, `solutions[${gi}].edges[${ei}]`)
          }
          const ref = checkRef(e, eat)
          if (!isText(e.explanation, 1000)) r.error(`${eat}.explanation: required text saying why this step comes before the other.`)
          if (e.optional !== undefined && typeof e.optional !== "boolean") r.error(`${eat}.optional: must be true or false when present.`)
          const alternatives: ValuationEdgeRef[] = []
          if (e.alternatives !== undefined) {
            if (!Array.isArray(e.alternatives)) r.error(`${eat}.alternatives: must be a list when present.`)
            else {
              e.alternatives.forEach((a: unknown, ai: number) => {
                const alt = checkRef(a, `${eat}.alternatives[${ai}]`)
                if (alt) alternatives.push(alt)
              })
            }
          }
          warnUnknown(e, ["id", "from", "to", "explanation", "optional", "alternatives"], eat, r)
          if (ref && eid && r.errors.length === edgeErrors) {
            acyclic.push([ref.from, ref.to])
            const out: ValuationEdge = { id: eid, from: ref.from, to: ref.to, explanation: e.explanation as string }
            if (e.optional) out.optional = true
            if (alternatives.length > 0) out.alternatives = alternatives
            gEdges.push(out)
          }
        })
        if (r.errors.length === errorsBefore && hasCycle(gSteps, acyclic)) {
          r.error(`${gat}.edges: the connections form a cycle. A process must be a directed graph with no loops.`)
        }
        if (gEdges.length > 0 && gEdges.every((e) => e.optional)) r.error(`${gat}.edges: at least one connection must be required (not optional).`)
      }
      warnUnknown(g, ["id", "title", "steps", "edges"], gat, r)
      if (gid && r.errors.length === errorsBefore) graphs.push({ id: gid, title: g.title as string, steps: gSteps, edges: gEdges })
    })
  }

  // Every non-distractor step must be used by a solution, or it could never be placed correctly.
  if (r.errors.length === before) {
    for (const st of steps) {
      if (!distractors.includes(st.id) && !used.has(st.id)) {
        r.error(`${label}.steps: "${st.id}" is used by no solution and is not listed as a distractor. List it in "distractors" or add it to a solution.`)
      }
    }
  }

  warnUnknown(raw, ["id", "category", "subcategory", "title", "task", "instructions", "assumptions", "conceptIds", "steps", "distractors", "solutions"], label, r)
  if (r.errors.length > before || !id) return null
  return {
    id,
    category: (raw.category as string).trim(),
    subcategory: (raw.subcategory as string).trim(),
    title: raw.title as string,
    task: raw.task as string,
    instructions: raw.instructions as string[],
    assumptions,
    conceptIds: raw.conceptIds as string[],
    steps,
    distractors,
    solutions: graphs,
  }
}

function validateQuickMath(raw: unknown, index: number, r: Report): QuickMathQuestion | null {
  const at = `quickMathQuestions[${index}]`
  if (!isRecord(raw)) {
    r.error(`${at}: must be an object.`)
    return null
  }
  const before = r.errors.length
  const id = checkId(raw.id, ID_PREFIX.quickMath, at, r)
  const label = id ? `${at} (${id})` : at
  if (!isText(raw.category, 80)) r.error(`${label}.category: required text (up to 80 characters).`)
  if (!isText(raw.subcategory, 80)) r.error(`${label}.subcategory: required text (up to 80 characters).`)
  if (typeof raw.difficulty !== "string" || !(DIFFICULTIES as readonly string[]).includes(raw.difficulty)) {
    r.error(`${label}.difficulty: must be one of ${DIFFICULTIES.map((d) => `"${d}"`).join(", ")}.`)
  }
  if (!isText(raw.prompt, 2000)) r.error(`${label}.prompt: required text (up to 2000 characters).`)
  if (!isFiniteNumber(raw.answer)) r.error(`${label}.answer: must be a number (not text), for example 25 or 0.375.`)
  if (!isFiniteNumber(raw.tolerance) || raw.tolerance < 0) {
    r.error(`${label}.tolerance: must be a number of 0 or more (0 means the answer must match exactly).`)
  }
  if (raw.units !== undefined && !isText(raw.units, 20)) r.error(`${label}.units: must be short text such as "$m", "%" or "x" when present.`)
  if (raw.rounding !== undefined && !isText(raw.rounding, 200)) r.error(`${label}.rounding: must be text such as "Round to one decimal place." when present.`)
  if (!isText(raw.explanation, 2000)) r.error(`${label}.explanation: required text (up to 2000 characters), a short worked solution.`)
  if (!Array.isArray(raw.conceptIds) || raw.conceptIds.length === 0 || !raw.conceptIds.every((c) => typeof c === "string" && c)) {
    r.error(`${label}.conceptIds: must be a non-empty list of concept IDs.`)
  }
  let assumptions: Given[] | undefined
  if (raw.assumptions !== undefined) {
    if (
      !Array.isArray(raw.assumptions) ||
      raw.assumptions.length > MAX_QUICK_MATH_ASSUMPTIONS ||
      !raw.assumptions.every((g) => isRecord(g) && isText(g.label, 200) && isText(g.value, 500))
    ) {
      r.error(`${label}.assumptions: must be a list of up to ${MAX_QUICK_MATH_ASSUMPTIONS} { "label", "value" } text pairs.`)
    } else assumptions = raw.assumptions.map((g) => ({ label: g.label, value: g.value }))
  }
  // Percentage answers must say which form to enter; the screen then adds the "enter 25, not 0.25" hint itself.
  if (raw.units === "%" && isFiniteNumber(raw.answer) && Math.abs(raw.answer) > 0 && Math.abs(raw.answer) < 1) {
    r.warn(`${label}.answer: ${raw.answer} with units "%" will be entered as ${raw.answer}%. For 25% use 25, not 0.25.`)
  }
  warnUnknown(raw, ["id", "category", "subcategory", "difficulty", "conceptIds", "prompt", "assumptions", "rounding", "answer", "units", "tolerance", "explanation"], label, r)
  if (r.errors.length > before || !id) return null
  const out: QuickMathQuestion = {
    id,
    category: (raw.category as string).trim(),
    subcategory: (raw.subcategory as string).trim(),
    difficulty: raw.difficulty as QuickMathQuestion["difficulty"],
    conceptIds: raw.conceptIds as string[],
    prompt: raw.prompt as string,
    answer: raw.answer as number,
    tolerance: raw.tolerance as number,
    explanation: raw.explanation as string,
  }
  if (assumptions) out.assumptions = assumptions
  if (raw.rounding !== undefined) out.rounding = raw.rounding as string
  if (raw.units !== undefined) out.units = raw.units as string
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
  for (const key of ["concepts", "questions", "scenarios", "multipleChoice", "processes", "threeStatementExercises", "valuationExercises", "quickMathQuestions"] as const) {
    if (raw[key] !== undefined && !Array.isArray(raw[key])) r.error(`${key}: must be a list when present.`)
  }
  warnUnknown(
    raw,
    ["schemaVersion", "contentVersion", "title", "description", "exportedAt", "concepts", "questions", "scenarios", "multipleChoice", "processes", "threeStatementExercises", "valuationExercises", "quickMathQuestions"],
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
  const statementExercises = list("threeStatementExercises").map((e, i) => validateStatementExercise(e, i, r))
  const valuationExercises = list("valuationExercises").map((e, i) => validateValuationExercise(e, i, r))
  const quickMath = list("quickMathQuestions").map((q, i) => validateQuickMath(q, i, r))

  if (concepts.length + questions.length + scenarios.length + choices.length + processes.length + statementExercises.length + valuationExercises.length + quickMath.length === 0) {
    r.error("The pack contains no concepts, questions, scenarios, multiple-choice questions, processes, three-statement exercises, valuation exercises or quick maths questions.")
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
  list("threeStatementExercises").forEach((e, i) => isRecord(e) && track(e.id, `threeStatementExercises[${i}]`))
  list("valuationExercises").forEach((e, i) => isRecord(e) && track(e.id, `valuationExercises[${i}]`))
  list("quickMathQuestions").forEach((q, i) => isRecord(q) && track(q.id, `quickMathQuestions[${i}]`))
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
  check(list("threeStatementExercises"), "threeStatementExercises")
  check(list("valuationExercises"), "valuationExercises")
  check(list("quickMathQuestions"), "quickMathQuestions")

  // Prerequisites: every reference must resolve, a concept may not need itself, and the combined graph (what
  // exists now, with this pack's concepts replacing their old entries) must have no cycle.
  const needs = new Map<string, readonly string[]>(known.prerequisites ?? [])
  list("concepts").forEach((c, i) => {
    if (!isRecord(c) || typeof c.id !== "string") return
    const at = `concepts[${i}] (${c.id})`
    const refs = Array.isArray(c.prerequisiteIds) ? c.prerequisiteIds.filter((v): v is string => typeof v === "string") : []
    const seenRefs = new Set<string>()
    for (const ref of refs) {
      if (ref === c.id) r.error(`${at}.prerequisiteIds: a concept cannot be its own prerequisite ("${ref}").`)
      else if (!packConcepts.has(ref) && !known.conceptIds.has(ref)) {
        r.error(`${at}.prerequisiteIds: unknown concept "${ref}". Define it in this pack's concepts or import it first.`)
      }
      if (seenRefs.has(ref)) r.warn(`${at}.prerequisiteIds: "${ref}" is listed more than once.`)
      seenRefs.add(ref)
    }
    needs.set(c.id, refs.filter((ref) => ref !== c.id))
  })
  const cycle = findCycle(needs)
  if (cycle && list("concepts").some((c) => isRecord(c) && typeof c.id === "string" && cycle.includes(c.id))) {
    r.error(`concepts: prerequisites form a cycle: ${cycle.join(" needs ")}. A concept cannot depend on itself, directly or through other concepts.`)
  }

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
    threeStatementExercises: statementExercises as ThreeStatementExercise[],
    valuationExercises: valuationExercises as ValuationExercise[],
    quickMathQuestions: quickMath as QuickMathQuestion[],
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
