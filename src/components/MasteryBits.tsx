// Small pieces shared by the Dashboard and the Skill Tree: level badge, evidence counts and practice links.
import { GlowButton } from "@/components/kit"
import { Badge } from "@/components/ui/badge"
import type { PracticeTarget } from "@/lib/conceptTargets"
import { LEVEL_LABEL, type ConceptMastery, type MasteryLevel } from "@/lib/mastery"
import { cn } from "@/lib/utils"
import { LEVEL_CLASS, pct } from "./masteryFormat"

export function LevelBadge({ level }: { level: MasteryLevel }) {
  return (
    <Badge variant="outline" className={cn("shrink-0", LEVEL_CLASS[level])} data-testid="level-badge" data-level={level}>
      {LEVEL_LABEL[level]}
    </Badge>
  )
}

/** Objective and self-rated evidence side by side, so the two are never mistaken for one another. */
export function EvidenceCounts({ m }: { m: ConceptMastery }) {
  if (m.evidenceCount === 0) return <span className="text-muted-foreground">No evidence</span>
  return (
    <span className="tabular-nums" data-testid="evidence-counts">
      <span data-testid="evidence-objective">
        {m.objective.count} graded{m.objective.score !== null && ` (${pct(m.objective.score)})`}
      </span>
      <span className="text-muted-foreground"> · </span>
      <span data-testid="evidence-self">
        {m.selfRated.count} self-rated{m.selfRated.score !== null && ` (${pct(m.selfRated.score)})`}
      </span>
    </span>
  )
}

/**
 * Buttons that open a practice target. They preselect a topic for that visit only; nothing is saved.
 * `stack` lists them full width with the amount on a second line, for narrow panels.
 */
export function PracticeLinks({
  targets,
  onOpen,
  limit = Number.POSITIVE_INFINITY,
  stack = false,
}: {
  targets: PracticeTarget[] | undefined
  onOpen: (t: PracticeTarget) => void
  limit?: number
  stack?: boolean
}) {
  if (!targets || targets.length === 0) return <span className="text-sm text-muted-foreground">No exercises for this concept yet.</span>
  return (
    <div className={stack ? "flex flex-col gap-2" : "flex flex-wrap gap-2"}>
      {targets.slice(0, limit).map((t) => (
        <GlowButton
          key={`${t.mode}-${t.id ?? t.category}-${t.subcategory ?? ""}`}
          className={stack ? "h-auto min-h-8 w-full flex-col items-start! justify-center gap-0 px-3 py-2 text-left! text-sm" : "h-8 px-3 text-sm"}
          onClick={() => onOpen(t)}
          data-testid="practice-link"
          data-mode={t.mode}
        >
          <span>{t.label}</span>
          {stack ? <span className="text-xs text-muted-foreground">{t.detail}</span> : <span className="text-muted-foreground"> · {t.detail}</span>}
        </GlowButton>
      ))}
    </div>
  )
}
