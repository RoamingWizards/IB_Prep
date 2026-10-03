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
  topic: string
  title: string
  prompt: string
  givens?: Given[] // facts shown with the prompt (scenarios)
  answer: string[] // paragraphs
  conceptIds: string[]
  formulas?: Formula[]
  tables?: StatementTable[]
}
