import { useEffect, useState } from "react"
import { Panel } from "@/components/kit"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useContent } from "@/content/contentContext"
import {
  getRecentAttempts,
  getRecentChoiceAttempts,
  getSessions,
  getStatementAttempts,
  getValuationAttempts,
  getWalks,
  RATINGS,
  type Attempt,
  type ChoiceAttempt,
  type Session,
  type StatementAttempt,
  type ValuationAttempt,
  type Walk,
} from "@/lib/db"

const fmt = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
})

export function HistoryView() {
  const { exercisesById, processesById, choicesById } = useContent()
  const [data, setData] = useState<{
    sessions: Session[]
    attempts: Attempt[]
    walks: Walk[]
    choiceAttempts: ChoiceAttempt[]
    statementAttempts: StatementAttempt[]
    valuationAttempts: ValuationAttempt[]
  } | null>(null)

  useEffect(() => {
    Promise.all([getSessions(), getRecentAttempts(50), getWalks(), getRecentChoiceAttempts(50), getStatementAttempts(), getValuationAttempts()]).then(
      ([sessions, attempts, walks, choiceAttempts, allStatements, allValuation]) =>
        setData({
          sessions,
          attempts,
          walks,
          choiceAttempts,
          statementAttempts: allStatements.filter((a) => a.status === "submitted").slice(0, 50),
          valuationAttempts: allValuation.filter((a) => a.status === "submitted").slice(0, 50),
        }),
    )
  }, [])

  if (!data) return null
  const { sessions, attempts, choiceAttempts, statementAttempts, valuationAttempts } = data
  // A walk nobody answered a stage in (for example one replaced by "Start over") is not worth listing.
  const walks = data.walks.filter((w) => w.status === "active" || Object.keys(w.results).length > 0)

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <h1 className="font-serif text-2xl font-semibold">History</h1>

      {sessions.length === 0 && walks.length === 0 && choiceAttempts.length === 0 && statementAttempts.length === 0 && valuationAttempts.length === 0 && (
        <Panel className="p-6">
          <p className="text-muted-foreground" data-testid="history-empty">
            No attempts yet. Grade a card in Questions or Scenarios, finish a stage in Deal Walks or submit a Three Statements or Valuation Builder attempt, and it will appear here.
          </p>
        </Panel>
      )}

      {sessions.length > 0 && (
        <>
          <Panel className="p-5">
            <h2 className="mb-3 text-sm font-medium">Sessions</h2>
            <Table data-testid="sessions-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Started</TableHead>
                  <TableHead>Deck</TableHead>
                  <TableHead className="text-right">Cards</TableHead>
                  {RATINGS.map((r) => (
                    <TableHead key={r} className="text-right capitalize">
                      {r}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>{fmt.format(s.startedAt)}</TableCell>
                    <TableCell>{s.kind === "question" ? "Questions" : "Scenarios"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {RATINGS.reduce((n, r) => n + s.counts[r], 0)}
                    </TableCell>
                    {RATINGS.map((r) => (
                      <TableCell key={r} className="text-right tabular-nums">
                        {s.counts[r]}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Panel>

          <Panel className="p-5">
            <h2 className="mb-3 text-sm font-medium">Recent attempts</h2>
            <Table data-testid="attempts-table">
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Exercise</TableHead>
                  <TableHead>Rating</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {attempts.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="whitespace-nowrap">{fmt.format(a.at)}</TableCell>
                    <TableCell>{exercisesById.get(a.exerciseId)?.title ?? a.exerciseId}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {a.rating}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Panel>
        </>
      )}

      {walks.length > 0 && (
        <Panel className="p-5">
          <h2 className="mb-3 text-sm font-medium">Deal Walks</h2>
          <Table data-testid="walks-table">
            <TableHeader>
              <TableRow>
                <TableHead>Started</TableHead>
                <TableHead>Process</TableHead>
                <TableHead className="text-right">Score</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {walks.map((w) => {
                const process = processesById.get(w.processId)
                const correct = Object.values(w.results).filter((r) => r.correct).length
                const answered = Object.keys(w.results).length
                return (
                  <TableRow key={w.sessionId}>
                    <TableCell className="whitespace-nowrap">{fmt.format(w.startedAt)}</TableCell>
                    <TableCell>{process?.title ?? w.processId}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {correct} / {process?.stages.length ?? answered}
                    </TableCell>
                    <TableCell className="capitalize">{w.status === "active" ? "In progress" : w.status}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </Panel>
      )}

      {choiceAttempts.length > 0 && (
        <Panel className="p-5">
          <h2 className="mb-3 text-sm font-medium">Multiple-choice results</h2>
          <Table data-testid="choice-attempts-table">
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Answer chosen</TableHead>
                <TableHead>Result</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {choiceAttempts.map((a) => {
                const process = processesById.get(a.processId)
                const stage = process?.stages.find((s) => s.id === a.stageId)
                const option = choicesById.get(a.choiceId)?.options.find((o) => o.id === a.selectedOptionId)
                return (
                  <TableRow key={a.id}>
                    <TableCell className="whitespace-nowrap">{fmt.format(a.at)}</TableCell>
                    <TableCell>
                      {process?.title ?? a.processId} › {stage?.title ?? a.stageId}
                    </TableCell>
                    <TableCell className="max-w-xs truncate">{option?.text ?? a.selectedOptionId}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{a.correct ? "Correct" : "Incorrect"}</Badge>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </Panel>
      )}

      {statementAttempts.length > 0 && (
        <Panel className="p-5">
          <h2 className="mb-3 text-sm font-medium">Three Statements</h2>
          <Table data-testid="statement-attempts-table">
            <TableHeader>
              <TableRow>
                <TableHead>Submitted</TableHead>
                <TableHead>Exercise</TableHead>
                <TableHead className="text-right">Figures correct</TableHead>
                <TableHead className="text-right">Required changes done</TableHead>
                <TableHead className="text-right">Missed</TableHead>
                <TableHead className="text-right">Unnecessary</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {statementAttempts.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="whitespace-nowrap">{fmt.format(a.submittedAt ?? a.updatedAt)}</TableCell>
                  <TableCell>{a.snapshot.title}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {a.grade?.correctFigures} / {a.grade?.totalFigures}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {a.grade?.completed} / {a.grade?.requiredChanges}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{a.grade?.missed}</TableCell>
                  <TableCell className="text-right tabular-nums">{a.grade?.unnecessary}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>
      )}

      {valuationAttempts.length > 0 && (
        <Panel className="p-5">
          <h2 className="mb-3 text-sm font-medium">Valuation Builder</h2>
          <Table data-testid="valuation-attempts-table">
            <TableHeader>
              <TableRow>
                <TableHead>Submitted</TableHead>
                <TableHead>Exercise</TableHead>
                <TableHead className="text-right">Steps correct</TableHead>
                <TableHead className="text-right">Connections correct</TableHead>
                <TableHead className="text-right">Not belonging</TableHead>
                <TableHead>Result</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {valuationAttempts.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="whitespace-nowrap">{fmt.format(a.submittedAt ?? a.updatedAt)}</TableCell>
                  <TableCell>{a.snapshot.title}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {a.grade?.correctSteps} / {a.grade?.requiredSteps}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {a.grade?.correctEdges} / {a.grade?.requiredEdges}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {(a.grade?.distractorIds.length ?? 0) + (a.grade?.extraStepIds.length ?? 0)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{a.grade?.perfect ? "Matched a solution" : "Needs work"}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>
      )}
    </div>
  )
}
