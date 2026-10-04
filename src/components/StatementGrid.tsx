import { AlertCircle, Check, X } from "lucide-react"
import type { FinancialStatement, ThreeStatementExercise } from "@/content/types"
import type { FigureResult, StatementGrade } from "@/lib/threeStatements"
import { decimalsOf, entryState, formatFigure, hasFigures, isEdited } from "@/lib/threeStatements"
import { cn } from "@/lib/utils"

interface Props {
  statement: FinancialStatement
  exercise: ThreeStatementExercise
  entries: Record<string, string>
  /** Set while the learner is still editing; omitted once submitted, which locks the figures. */
  onChange?: (rowId: string, text: string) => void
  onBlur?: (rowId: string) => void
  touched?: ReadonlySet<string>
  grade?: StatementGrade
  showCorrect: boolean
  highlight: ReadonlySet<string>
  /** Numbered connection markers by row ID, used instead of arrows in narrow layouts. */
  markers?: ReadonlyMap<string, number[]>
}

const STATUS_WORD: Record<FigureResult["status"], string> = {
  correct: "Correct",
  incorrect: "Incorrect",
  blank: "Incorrect: left blank",
  invalid: "Incorrect: not a number",
}

/** Shows a positive figure with a hidden bracket so decimals line up with bracketed negatives. */
function Figure({ value, decimals }: { value: number; decimals: number }) {
  const text = formatFigure(value, decimals)
  const negative = text.startsWith("(")
  return (
    <span>
      {text}
      {!negative && <span className="stmt-pad" aria-hidden>)</span>}
    </span>
  )
}

/** One statement as a table. Everything shown, including row order and formatting, comes from the exercise data. */
export function StatementGrid({ statement, exercise, entries, onChange, onBlur, touched, grade, showCorrect, highlight, markers }: Props) {
  const decimals = decimalsOf(exercise)
  const editable = !!onChange

  return (
    <section data-statement={statement.id} aria-labelledby={`h-${statement.id}`} className="min-w-0">
      <h2 id={`h-${statement.id}`} className="mb-2 font-serif text-xl font-semibold">
        {statement.title}
      </h2>
      <table className="stmt-table">
        <thead>
          <tr>
            <th scope="col">
              <span className="sr-only">Line item</span>
            </th>
            <th scope="col">Original</th>
            <th scope="col">{editable ? "Your figures" : "Your answer"}</th>
            {showCorrect && <th scope="col">Correct</th>}
          </tr>
        </thead>
        <tbody>
          {statement.rows.map((row) => {
            const indent = row.indent ?? 0
            const rowMarkers = markers?.get(row.id)
            const common = {
              "data-row-id": row.id,
              "data-style": row.style ?? "line",
              "data-highlight": highlight.has(row.id) ? "true" : "false",
              className: "stmt-row",
            }
            const label = (
              <th scope="row" style={{ paddingLeft: `${0.625 + indent * 1.1}rem` }}>
                {row.label}
                {rowMarkers?.map((n) => (
                  <span key={n} className="stmt-marker" aria-label={`Connection ${n}`}>
                    {n}
                  </span>
                ))}
              </th>
            )
            if (!hasFigures(row)) {
              return (
                <tr key={row.id} {...common}>
                  {label}
                  <td />
                  <td />
                  {showCorrect && <td />}
                </tr>
              )
            }
            const text = entries[row.id] ?? ""
            const result = grade?.figures[row.id]
            const wrong = !!result && result.status !== "correct"
            const changedCorrectly = !!result && result.status === "correct" && isEdited(exercise, row, text)
            const state = entryState(text)
            const showInvalid = editable && touched?.has(row.id) && state.kind !== "number"
            const anchorOnEntry = !showCorrect
            return (
              <tr key={row.id} {...common}>
                {label}
                <td>
                  <Figure value={row.original} decimals={decimals} />
                </td>
                <td data-anchor={anchorOnEntry ? "" : undefined}>
                  {editable ? (
                    <span className="stmt-figure">
                      {showInvalid && <AlertCircle className="size-4 shrink-0 text-grade-again" aria-hidden />}
                      <input
                        id={`fig-${row.id}`}
                        className="stmt-input"
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        spellCheck={false}
                        value={text}
                        aria-label={`${row.label}, ${statement.title}, edited figure`}
                        aria-invalid={showInvalid || undefined}
                        aria-describedby={showInvalid ? `err-${row.id}` : undefined}
                        data-edited={isEdited(exercise, row, text)}
                        onChange={(e) => onChange?.(row.id, e.target.value)}
                        onBlur={() => onBlur?.(row.id)}
                      />
                      {showInvalid && (
                        <span id={`err-${row.id}`} className="sr-only">
                          {state.kind === "blank" ? "Left blank. Enter a number." : "Not a number. Enter a number such as 225.0 or (7.5)."}
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="stmt-figure" data-figure-status={result?.status}>
                      {wrong && <X className="size-4 shrink-0 text-grade-again" aria-hidden />}
                      {changedCorrectly && <Check className="size-4 shrink-0 text-grade-easy" aria-hidden />}
                      <span className={cn(wrong && "stmt-cell-wrong", changedCorrectly && "stmt-cell-right")}>
                        {state.kind === "number" ? <Figure value={state.value} decimals={decimals} /> : <em>{state.kind === "blank" ? "blank" : text}</em>}
                      </span>
                      {result && <span className="sr-only">{STATUS_WORD[result.status]}</span>}
                    </span>
                  )}
                </td>
                {showCorrect && (
                  <td data-anchor="" className="stmt-correct-col">
                    <Figure value={row.correct} decimals={decimals} />
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}
