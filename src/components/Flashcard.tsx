import { useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { conceptsById } from "@/content"
import type { Exercise, StatementRow, StatementTable } from "@/content/types"
import { RATINGS, type Rating } from "@/lib/db"
import { cn } from "@/lib/utils"

const GRADE_LABEL: Record<Rating, string> = {
  again: "Again",
  hard: "Hard",
  good: "Good",
  easy: "Easy",
}
const GRADE_STYLE: Record<Rating, string> = {
  again: "border-grade-again/40 text-grade-again hover:bg-grade-again/10",
  hard: "border-grade-hard/40 text-grade-hard hover:bg-grade-hard/10",
  good: "border-grade-good/40 text-grade-good hover:bg-grade-good/10",
  easy: "border-grade-easy/40 text-grade-easy hover:bg-grade-easy/10",
}

function isTyping(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
  )
}

function formatValue(v: number | null, format: StatementRow["format"]) {
  if (v === null) return ""
  if (format === "percent") return `${(v * 100).toFixed(1)}%`
  if (format === "multiple") return `${v.toFixed(1)}x`
  const digits = Number.isInteger(v) ? 0 : 2
  const abs = Math.abs(v).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
  return v < 0 ? `(${abs})` : abs
}

function Statement({ table }: { table: StatementTable }) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium">
        {table.title}
        {table.unit && (
          <span className="ml-2 font-normal text-muted-foreground">
            {table.unit}
          </span>
        )}
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead />
            {table.columns.map((c) => (
              <TableHead key={c} className="text-right">
                {c}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {table.rows.map((row) => (
            <TableRow
              key={row.label}
              className={cn(
                row.style === "subtotal" && "font-medium",
                row.style === "total" && "border-t-2 border-foreground/30 font-semibold",
              )}
            >
              <TableCell>{row.label}</TableCell>
              {row.values.map((v, i) => (
                <TableCell key={i} className="text-right tabular-nums">
                  {formatValue(v, row.format)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

interface Props {
  exercise: Exercise
  revealed: boolean
  onReveal: () => void
  onGrade: (rating: Rating) => void
}

/** Shared flashcard for Questions and Scenarios. */
export function Flashcard({ exercise, revealed, onReveal, onGrade }: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return
      if (isTyping(e.target)) return
      if (e.code === "Space") {
        // Space would otherwise activate a focused button a second time.
        e.preventDefault()
        if (!revealed) onReveal()
        return
      }
      if (revealed && /^[1-4]$/.test(e.key)) {
        onGrade(RATINGS[Number(e.key) - 1])
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [revealed, onReveal, onGrade])

  return (
    <article className="rounded-lg border bg-card p-6 sm:p-8" data-testid="flashcard">
      <p className="text-sm text-muted-foreground">{exercise.topic}</p>
      <h2 className="mt-1 font-serif text-2xl leading-snug font-semibold">
        {exercise.title}
      </h2>
      <p className="mt-4 max-w-[62ch] font-serif text-lg leading-relaxed">
        {exercise.prompt}
      </p>

      {exercise.givens && (
        <dl className="mt-5 grid max-w-[62ch] grid-cols-[max-content_1fr] gap-x-6 gap-y-1.5 border-l-2 pl-4 text-sm">
          {exercise.givens.map((g) => (
            <div key={g.label} className="contents">
              <dt className="text-muted-foreground">{g.label}</dt>
              <dd className="tabular-nums">{g.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {!revealed ? (
        <div className="mt-8">
          <Button size="lg" onClick={onReveal}>
            Reveal answer
            <kbd className="ml-2 rounded bg-primary-foreground/20 px-1.5 text-xs">
              Space
            </kbd>
          </Button>
        </div>
      ) : (
        <div className="mt-8 space-y-6 border-t pt-6" data-testid="answer">
          <section className="max-w-[62ch] space-y-3 font-serif text-base leading-relaxed">
            {exercise.answer.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </section>

          {exercise.formulas && (
            <section>
              <h3 className="mb-2 text-sm font-medium">Formulas</h3>
              <dl className="space-y-1.5 text-sm">
                {exercise.formulas.map((f) => (
                  <div key={f.label} className="flex flex-wrap gap-x-3">
                    <dt className="text-muted-foreground">{f.label}</dt>
                    <dd className="font-medium">{f.expression}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {exercise.tables?.map((t) => <Statement key={t.title} table={t} />)}

          <section>
            <h3 className="mb-2 text-sm font-medium">Key concepts</h3>
            <ul className="flex flex-wrap gap-2">
              {exercise.conceptIds.map((id) => {
                const c = conceptsById.get(id)
                return (
                  <li key={id}>
                    <Badge variant="secondary" title={c?.summary}>
                      {c?.name ?? id}
                    </Badge>
                  </li>
                )
              })}
            </ul>
          </section>

          <div className="flex flex-wrap gap-2 border-t pt-6">
            {RATINGS.map((r, i) => (
              <Button
                key={r}
                variant="outline"
                size="lg"
                className={cn("min-w-24", GRADE_STYLE[r])}
                onClick={() => onGrade(r)}
              >
                {GRADE_LABEL[r]}
                <kbd className="ml-2 text-xs opacity-60">{i + 1}</kbd>
              </Button>
            ))}
          </div>
        </div>
      )}
    </article>
  )
}
