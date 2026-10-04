import { useMemo, useState } from "react"
import { Panel } from "@/components/kit"
import { EvidenceCounts, LevelBadge, PracticeLinks } from "@/components/MasteryBits"
import { pct } from "@/components/masteryFormat"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { PracticeTarget } from "@/lib/conceptTargets"
import { LEVEL_LABEL, MASTERY_MODEL, SOURCE_LABEL, SOURCES, type ConceptMastery, type MasteryLevel } from "@/lib/mastery"
import type { MasteryState } from "@/lib/useMastery"

const fmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" })
const selectClass =
  "h-9 rounded-xl border border-white/12 bg-black/20 px-3 text-sm outline-none transition-colors hover:border-white/25 focus-visible:ring-2 focus-visible:ring-ring"

interface Props {
  state: MasteryState
  names: Map<string, string>
  targets: Map<string, PracticeTarget[]>
  onOpen: (target: PracticeTarget) => void
}

/** Concept-level detail under the analytics: strengths, weaknesses, every concept with its evidence, and how it is worked out. */
export function ConceptDetails({ state, names, targets, onOpen }: Props) {
  const [filter, setFilter] = useState<MasteryLevel | "all">("all")
  const { summary, mastery } = state
  const view = useMemo(() => {
    const studied = mastery.filter((m) => m.level !== "not-studied")
    const strengths = studied.filter((m) => m.level === "strong").sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || (a.conceptId < b.conceptId ? -1 : 1)).slice(0, 5)
    const weaknesses = studied.filter((m) => m.level === "weak").sort((a, b) => (a.score ?? 0) - (b.score ?? 0) || (a.conceptId < b.conceptId ? -1 : 1)).slice(0, 5)
    const rows = mastery.filter((m) => filter === "all" || m.level === filter)
    const totals = SOURCES.map((s) => ({ source: s, n: mastery.reduce((sum, m) => sum + m.bySource[s], 0) })).filter((x) => x.n > 0)
    return { strengths, weaknesses, rows, totals }
  }, [mastery, filter])
  const { strengths, weaknesses, rows, totals } = view

  const list = (title: string, items: ConceptMastery[], empty: string, testId: string) => (
    <Panel className="p-5" data-testid={testId}>
      <h2 className="text-sm font-medium">{title}</h2>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="mt-3 divide-y divide-white/[0.06]">
          {items.map((m) => (
            <li key={m.conceptId} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 text-sm" data-testid="concept-item" data-concept-id={m.conceptId}>
              <span className="font-medium">{names.get(m.conceptId) ?? m.conceptId}</span>
              <span className="flex items-center gap-3">
                <EvidenceCounts m={m} />
                <span className="w-10 text-right tabular-nums">{pct(m.score)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )

  return (
    <div className="space-y-6" data-testid="concept-details-section">
      <div className="grid gap-6 lg:grid-cols-2">
        {list("Strengths", strengths, "No concept is Strong yet. Strong needs a score of 80% or more across at least 3 results, one of them graded.", "strengths")}
        {list("Weaknesses", weaknesses, "No concept is Weak. Weak means a score below 50%.", "weaknesses")}
      </div>

      <Panel className="p-5" data-testid="all-concepts">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-medium">All concepts</h2>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            Show
            <select className={selectClass} value={filter} onChange={(e) => setFilter(e.target.value as MasteryLevel | "all")} data-testid="level-filter">
              <option value="all">All levels ({mastery.length})</option>
              {(["strong", "developing", "weak", "not-studied"] as MasteryLevel[]).map((l) => (
                <option key={l} value={l}>
                  {LEVEL_LABEL[l]} ({summary.counts[l]})
                </option>
              ))}
            </select>
          </label>
        </div>
        <Table data-testid="concepts-table" className="mt-3">
          <TableHeader>
            <TableRow>
              <TableHead>Concept</TableHead>
              <TableHead>Mastery</TableHead>
              <TableHead className="text-right">Score</TableHead>
              <TableHead>Evidence</TableHead>
              <TableHead>Last result</TableHead>
              <TableHead>Practise</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((m) => (
              <TableRow key={m.conceptId} data-testid="concept-row" data-concept-id={m.conceptId} data-level={m.level}>
                <TableCell className="font-medium">{names.get(m.conceptId) ?? m.conceptId}</TableCell>
                <TableCell>
                  <span className="flex flex-wrap items-center gap-2">
                    <LevelBadge level={m.level} />
                    {m.selfRatedOnly && (
                      <span className="text-xs text-muted-foreground" data-testid="self-only">
                        self-rated only
                      </span>
                    )}
                  </span>
                </TableCell>
                <TableCell className="text-right tabular-nums" data-testid="concept-score">
                  {pct(m.score)}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <EvidenceCounts m={m} />
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">{m.lastEvidenceAt === null ? "–" : fmt.format(m.lastEvidenceAt)}</TableCell>
                <TableCell>
                  <PracticeLinks targets={targets.get(m.conceptId)} onOpen={onOpen} limit={1} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>

      <details className="text-sm text-muted-foreground" data-testid="how-calculated">
        <summary className="cursor-pointer select-none">How mastery is calculated</summary>
        <div className="mt-2 max-w-[75ch] space-y-2 leading-relaxed">
          <p>
            Every saved result for a concept is one piece of evidence with a score from 0 to 1: a correct answer is 1 and a wrong one 0; Three Statements and Valuation Builder attempts score by the share of the task done
            correctly; flashcard ratings are self-assessments worth Again 0, Hard {MASTERY_MODEL.flashcardScores.hard}, Good {MASTERY_MODEL.flashcardScores.good}, Easy 1 and count half as much as a graded answer. Newer evidence
            counts more (it halves every {MASTERY_MODEL.halfLifeDays} days). The score is pulled gently toward 50% so one result never decides a concept.
          </p>
          <p>
            Weak is below {MASTERY_MODEL.weakBelow * 100}%. Strong is {MASTERY_MODEL.strongAtLeast * 100}% or more with at least {MASTERY_MODEL.strongMinEvidence} results, one of them graded, so self-ratings alone never make a concept Strong.
            A concept with no results is Not studied. The full rules are in docs/MASTERY.md.
          </p>
          <p data-testid="evidence-sources">
            Results counted: {totals.length === 0 ? "none yet" : totals.map((t) => `${SOURCE_LABEL[t.source]} ${t.n}`).join(" · ")}
            {state.unlinked > 0 && ` · ${state.unlinked} result${state.unlinked === 1 ? "" : "s"} not linked to a concept (for example generated Quick Maths questions)`}.
          </p>
        </div>
      </details>
    </div>
  )
}
