import { Panel } from "@/components/kit"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { QuickMathResult } from "@/lib/db"
import { categoryStats, formatDuration } from "@/lib/quickMath"

/** Accuracy and average response time by category, from every recorded Quick Maths result. */
export function QuickMathStats({ results, heading = "Results by category" }: { results: QuickMathResult[]; heading?: string }) {
  const stats = categoryStats(results)
  return (
    <Panel className="p-5" data-testid="qm-stats">
      <h2 className="mb-3 text-sm font-medium">{heading}</h2>
      {stats.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="qm-stats-empty">
          No answers yet. Finish a question and your accuracy and speed appear here.
        </p>
      ) : (
        <Table data-testid="qm-stats-table">
          <TableHeader>
            <TableRow>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Answered</TableHead>
              <TableHead className="text-right">Accuracy</TableHead>
              <TableHead className="text-right">Average response</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {stats.map((s) => (
              <TableRow key={s.category} data-testid="qm-stats-row" data-category={s.category}>
                <TableCell>{s.category}</TableCell>
                <TableCell className="text-right tabular-nums">{s.answered}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {Math.round(s.accuracy * 100)}% <span className="text-muted-foreground">({s.correct}/{s.answered})</span>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {s.averageMs === null ? "–" : formatDuration(s.averageMs)}
                  {s.averageMs !== null && s.timedAnswers < s.answered && <span className="text-muted-foreground"> ({s.timedAnswers} timed)</span>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Panel>
  )
}
