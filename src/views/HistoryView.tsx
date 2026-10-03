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
import { exercisesById } from "@/content"
import {
  getRecentAttempts,
  getSessions,
  RATINGS,
  type Attempt,
  type Session,
} from "@/lib/db"

const fmt = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
})

export function HistoryView() {
  const [data, setData] = useState<{ sessions: Session[]; attempts: Attempt[] } | null>(null)

  useEffect(() => {
    Promise.all([getSessions(), getRecentAttempts(50)]).then(([sessions, attempts]) =>
      setData({ sessions, attempts }),
    )
  }, [])

  if (!data) return null
  const { sessions, attempts } = data

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <h1 className="font-serif text-2xl font-semibold">History</h1>

      {sessions.length === 0 ? (
        <Panel className="p-6">
          <p className="text-muted-foreground" data-testid="history-empty">
            No attempts yet. Grade a card in Questions or Scenarios and it will appear here.
          </p>
        </Panel>
      ) : (
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
    </div>
  )
}
