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

/** One line of a financial statement. Header rows carry no figures; every other row has both. */
export interface FinancialRow {
  id: string // "r-…", unique within the exercise
  label: string
  style?: "header" | "subtotal" | "total"
  indent?: number // 0 to 3
  original?: number // the figure shown at the start
  correct?: number // the figure after the change
  tolerance?: number // overrides the exercise tolerance for this row
}

export interface FinancialStatement {
  id: string // "st-…", unique within the exercise
  title: string
  rows: FinancialRow[] // in display order
}

export interface ExplanationConnection {
  from: string // row ID
  to: string // row ID
  label?: string
}

/** One step of the worked solution: rows to highlight and the connections to draw. */
export interface ExplanationStep {
  id: string // "step-…", unique within the exercise
  title: string
  text: string
  rows: string[] // row IDs
  connections: ExplanationConnection[]
}

/** A three-statement exercise rendered entirely from this data. */
export interface ThreeStatementExercise {
  id: string // "ts-…"
  category: string
  subcategory: string
  title: string
  instructions: string[]
  assumptions: Given[]
  units: string // for example "$m"
  decimals?: number // figures shown to this many places; default 1
  tolerance: number // a figure is correct if within this of the correct value
  conceptIds: string[]
  statements: FinancialStatement[] // in display order
  steps: ExplanationStep[] // in the order shown
}

export interface ValuationStep {
  id: string // "vs-…", unique within the exercise
  label: string // the text on the bubble
  detail?: string // optional extra line shown in the step bank
  explanation: string // why it belongs, or why it is a distractor
}

export interface ValuationEdgeRef {
  from: string
  to: string
}

/** A required connection in an accepted solution. `from` must be done before `to`. */
export interface ValuationEdge extends ValuationEdgeRef {
  id: string // "ve-…", unique within the exercise
  explanation: string
  optional?: boolean // accepted if drawn, but not required
  alternatives?: ValuationEdgeRef[] // other connections that satisfy this requirement
}

/** One accepted solution: the steps it uses and how they depend on each other (a directed acyclic graph). */
export interface ValuationGraph {
  id: string // "vg-…"
  title: string
  steps: string[] // step IDs used by this solution
  edges: ValuationEdge[]
}

/** A "build the process" exercise: pick steps, arrange them, connect them. */
export interface ValuationExercise {
  id: string // "vx-…"
  category: string
  subcategory: string
  title: string
  task: string
  instructions: string[]
  assumptions: Given[]
  conceptIds: string[]
  steps: ValuationStep[] // the whole bank, distractors included
  distractors: string[] // step IDs that belong in no accepted solution
  solutions: ValuationGraph[] // one or more accepted solutions
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
  threeStatementExercises?: ThreeStatementExercise[]
  valuationExercises?: ValuationExercise[]
}

/** All content available to the app at one time. */
export interface Bank {
  concepts: Concept[]
  questions: Exercise[]
  scenarios: Exercise[]
  multipleChoice: MultipleChoice[]
  processes: Process[]
  threeStatementExercises: ThreeStatementExercise[]
  valuationExercises: ValuationExercise[]
}
