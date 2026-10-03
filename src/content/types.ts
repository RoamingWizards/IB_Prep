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
export interface ChoiceOption {
  id: string // unique within its question, e.g. "a"
  text: string
}

/** One multiple-choice question with a single correct option. Used by Deal Walk stages. */
export interface MultipleChoice {
  id: string // "mc-…"
  category: string
  subcategory: string
  title: string
  prompt: string
  options: ChoiceOption[] // 2 to 5; shuffled when shown, so their order here carries no meaning
  correctOptionId: string
  explanation: string[] // paragraphs shown after submitting
  conceptIds: string[]
}

export interface ProcessStage {
  id: string // "ps-…", unique across all processes
  title: string
  choiceId: string // the multiple-choice question asked at this stage
}

/** A deal process walked stage by stage. The order of `stages` is the order shown. */
export interface Process {
  id: string // "p-…"
  title: string
  description?: string
  stages: ProcessStage[]
}

export interface ContentPack {
  schemaVersion: number
  contentVersion: string
  title?: string
  description?: string
  exportedAt?: string
  concepts?: Concept[]
  questions?: Exercise[]
  scenarios?: Exercise[]
  multipleChoice?: MultipleChoice[]
  processes?: Process[]
}

/** All content available to the app at one time. */
export interface Bank {
  concepts: Concept[]
  questions: Exercise[]
  scenarios: Exercise[]
  multipleChoice: MultipleChoice[]
  processes: Process[]
}
