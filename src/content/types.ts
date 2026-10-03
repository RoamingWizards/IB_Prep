// Content schema. Content is prepared offline and shipped as JSON; it is never
// mutated by the app. IDs are stable and are the join key to user progress.

export type ExerciseKind = "question" | "scenario"

export interface Concept {
  id: string // e.g. "c-enterprise-value"
  name: string
  summary: string
}

export interface Formula {
  label: string
  expression: string
}

export interface StatementRow {
  label: string
  values: (number | null)[]
  style?: "subtotal" | "total"
  format?: "number" | "percent" | "multiple"
}

export interface StatementTable {
  title: string
  unit?: string // e.g. "$m"
  columns: string[]
  rows: StatementRow[]
}

export interface Given {
  label: string
  value: string
}

export interface Exercise {
  id: string // e.g. "q-ev-001", "s-3s-001"
  kind: ExerciseKind
  category: string // broad area, e.g. "Valuation". Topic selectors are derived from this and subcategory.
  subcategory: string // narrower topic within the category, e.g. "DCF"
  title: string
  prompt: string
  givens?: Given[] // facts shown with the prompt (scenarios)
  answer: string[] // paragraphs
  conceptIds: string[]
  formulas?: Formula[]
  tables?: StatementTable[]
}

/** A content pack: the JSON file format for importing and exporting content. See docs/CONTENT_SCHEMA.md. */
export interface ContentPack {
  schemaVersion: number
  contentVersion: string
  title?: string
  description?: string
  exportedAt?: string
  concepts?: Concept[]
  questions?: Exercise[]
  scenarios?: Exercise[]
}

/** All content available to the app at one time. */
export interface Bank {
  concepts: Concept[]
  questions: Exercise[]
  scenarios: Exercise[]
}
