// Pure helpers for Three Statements exercises: reading what the learner typed, formatting figures and
// grading an attempt. No browser APIs, so the same logic can be checked from Node.
import type { FinancialRow, FinancialStatement, ThreeStatementExercise } from "@/content/types"

export type FigureStatus = "correct" | "incorrect" | "blank" | "invalid"

export interface FigureResult {
  status: FigureStatus
  /** The number the learner entered; null when the entry was blank or not a number. */
  value: number | null
}

export interface StatementGrade {
  figures: Record<string, FigureResult> // row ID -> result
  totalFigures: number
  correctFigures: number
  requiredChanges: number // figures whose correct value differs from the original
  completed: number // required changes entered correctly
  missed: number // required changes not entered correctly (left alone, wrong, blank or invalid)
  unnecessary: number // figures that needed no change but were changed (and so are wrong)
}

export type FigureRow = FinancialRow & { original: number; correct: number }

export const hasFigures = (row: FinancialRow): row is FigureRow => row.style !== "header" && row.original !== undefined && row.correct !== undefined

export function figureRows(exercise: ThreeStatementExercise): FigureRow[] {
  return exercise.statements.flatMap((s) => s.rows.filter(hasFigures))
}

export function toleranceFor(exercise: ThreeStatementExercise, row: FinancialRow): number {
  return row.tolerance ?? exercise.tolerance
}

export const decimalsOf = (exercise: ThreeStatementExercise) => exercise.decimals ?? 1

/** Reads typed text as a number. Accepts "1,234.5", "-7.5", "(7.5)" and a leading "$" or "+". */
export function parseFigure(text: string): number | null {
  let t = text.trim().replace(/[\s,$]/g, "").replace(/−/g, "-")
  if (t === "") return null
  let negative = false
  const paren = /^\((.*)\)$/.exec(t)
  if (paren) {
    negative = true
    t = paren[1]
  }
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(t)) return null
  const n = Number(t)
  if (!Number.isFinite(n)) return null
  return negative ? -n : n
}

export type EntryState = { kind: "blank" } | { kind: "invalid" } | { kind: "number"; value: number }

export function entryState(text: string): EntryState {
  if (text.trim() === "") return { kind: "blank" }
  const value = parseFigure(text)
  return value === null ? { kind: "invalid" } : { kind: "number", value }
}

/** Accounting style: thousands separators and negatives in brackets. */
export function formatFigure(value: number, decimals = 1): string {
  const rounded = Number(Math.abs(value).toFixed(decimals))
  const body = rounded.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
  return value < 0 && rounded !== 0 ? `(${body})` : body
}

export function initialEntries(exercise: ThreeStatementExercise): Record<string, string> {
  const d = decimalsOf(exercise)
  return Object.fromEntries(figureRows(exercise).map((r) => [r.id, formatFigure(r.original, d)]))
}

/** True when the learner has altered this figure from its original (blank and invalid entries count). */
export function isEdited(exercise: ThreeStatementExercise, row: FigureRow, text: string): boolean {
  const s = entryState(text)
  return s.kind !== "number" || Math.abs(s.value - row.original) > toleranceFor(exercise, row)
}

export function editedCount(exercise: ThreeStatementExercise, entries: Record<string, string>): number {
  return figureRows(exercise).filter((r) => isEdited(exercise, r, entries[r.id] ?? "")).length
}

/**
 * Checks every figure against the prepared answer. A figure is correct when it is within tolerance of the
 * correct value. A required change is a figure whose correct value differs from its original; it is
 * completed if entered correctly and otherwise missed. A figure that needed no change but was altered
 * (and is therefore wrong) is an unnecessary change.
 */
export function gradeAttempt(exercise: ThreeStatementExercise, entries: Record<string, string>): StatementGrade {
  const grade: StatementGrade = { figures: {}, totalFigures: 0, correctFigures: 0, requiredChanges: 0, completed: 0, missed: 0, unnecessary: 0 }
  for (const row of figureRows(exercise)) {
    const tol = toleranceFor(exercise, row)
    const state = entryState(entries[row.id] ?? "")
    const value = state.kind === "number" ? state.value : null
    const correct = state.kind === "number" && Math.abs(state.value - row.correct) <= tol
    const required = Math.abs(row.correct - row.original) > tol
    const changed = state.kind !== "number" || Math.abs(state.value - row.original) > tol
    grade.figures[row.id] = { status: correct ? "correct" : state.kind === "number" ? "incorrect" : state.kind, value }
    grade.totalFigures++
    if (correct) grade.correctFigures++
    if (required) {
      grade.requiredChanges++
      if (correct) grade.completed++
      else grade.missed++
    } else if (changed && !correct) grade.unnecessary++
  }
  return grade
}

export function findRow(exercise: ThreeStatementExercise, rowId: string): { row: FinancialRow; statement: FinancialStatement } | undefined {
  for (const statement of exercise.statements) {
    const row = statement.rows.find((r) => r.id === rowId)
    if (row) return { row, statement }
  }
  return undefined
}
