import type { ReactNode } from "react"
import { ArrowLeft } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { FlipCard, GlowButton, Panel } from "@/components/kit"
import { conceptsById } from "@/content"
import type { Exercise, StatementRow, StatementTable } from "@/content/types"
import { cn } from "@/lib/utils"

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
    <Panel inset className="p-4">
      <p className="mb-2 text-sm font-medium">
        {table.title}
        {table.unit && (
          <span className="ml-2 font-normal text-muted-foreground">{table.unit}</span>
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
                row.style === "total" && "border-t border-foreground/25 font-semibold",
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
    </Panel>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-medium text-muted-foreground">{title}</h3>
      {children}
    </section>
  )
}

function Front({ exercise, onReveal }: { exercise: Exercise; onReveal: () => void }) {
  function onClick() {
    // A drag-selection ending on the card is not a flip request.
    if (window.getSelection()?.toString()) return
    onReveal()
  }
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Reveal answer"
      data-interactive="true"
      data-testid="card-front"
      className="study-card flex h-full flex-col px-10 py-8 outline-none"
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter") onReveal()
      }}
    >
      <p className="text-sm text-muted-foreground">{exercise.title}</p>
      <div className="flex flex-1 flex-col justify-center py-6">
        <p className="max-w-[34ch] font-serif text-[clamp(1.5rem,2.6vw,2.125rem)] leading-[1.3] font-semibold">
          {exercise.prompt}
        </p>
        {exercise.givens && (
          <dl className="mt-8 grid max-w-xl grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-[0.9375rem]">
            {exercise.givens.map((g) => (
              <div key={g.label} className="contents">
                <dt className="text-muted-foreground">{g.label}</dt>
                <dd className="tabular-nums">{g.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
      <p className="text-center text-sm text-muted-foreground">
        Click the card or press{" "}
        <kbd className="rounded border border-white/15 bg-white/5 px-1.5 py-0.5 text-xs">Space</kbd>{" "}
        to reveal the answer
      </p>
    </div>
  )
}

function Back({ exercise, onHide }: { exercise: Exercise; onHide: () => void }) {
  return (
    <div className="study-card flex h-full flex-col" data-testid="card-back">
      <div className="flex items-center justify-between gap-4 border-b border-white/[0.07] px-6 py-3.5">
        <GlowButton
          tone="neutral"
          className="h-8 px-3 text-sm"
          onClick={onHide}
          data-native-space
        >
          <ArrowLeft className="size-4" aria-hidden />
          Show question
        </GlowButton>
        <p className="truncate text-sm text-muted-foreground">{exercise.title}</p>
      </div>

      <div
        className="thin-scroll min-h-0 flex-1 overflow-y-auto px-8 py-6"
        data-testid="answer"
        tabIndex={0}
        aria-label="Answer"
      >
        <div className="space-y-7">
          <div className="max-w-[66ch] space-y-3.5 text-base leading-[1.7]">
            {exercise.answer.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>

          {exercise.formulas && (
            <Section title="Formulas">
              <Panel inset className="p-4">
                <dl className="space-y-2.5 text-sm">
                  {exercise.formulas.map((f) => (
                    <div key={f.label} className="flex flex-wrap gap-x-4 gap-y-0.5">
                      <dt className="min-w-36 text-muted-foreground">{f.label}</dt>
                      <dd className="font-medium">{f.expression}</dd>
                    </div>
                  ))}
                </dl>
              </Panel>
            </Section>
          )}

          {exercise.tables?.map((t) => <Statement key={t.title} table={t} />)}

          <Section title="Key concepts">
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
          </Section>
        </div>
      </div>
    </div>
  )
}

interface Props {
  exercise: Exercise
  revealed: boolean
  onReveal: () => void
  onHide: () => void
}

/** Shared card for Questions and Scenarios: question face, flipping to the answer face. */
export function Flashcard({ exercise, revealed, onReveal, onHide }: Props) {
  return (
    <FlipCard
      flipped={revealed}
      front={<Front exercise={exercise} onReveal={onReveal} />}
      back={<Back exercise={exercise} onHide={onHide} />}
    />
  )
}
