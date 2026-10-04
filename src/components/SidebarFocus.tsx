import { useMemo } from "react"
import { useContent } from "@/content/contentContext"
import type { PracticeTarget } from "@/lib/conceptTargets"
import { GlowButton } from "@/components/kit"
import { LEVEL_LABEL, recommendPractice } from "@/lib/mastery"
import { useMastery } from "@/lib/useMastery"
import { ProgressBar } from "@/components/kit"

/** "Next up" card at the foot of the menu: the single concept most worth practising, with a way in. */
export function SidebarFocus({ onOpen }: { onOpen: (target: PracticeTarget) => void }) {
  const { bank } = useContent()
  const { state, targets } = useMastery()
  const top = useMemo(() => {
    if (!state) return null
    const [first] = recommendPractice(state.mastery, state.computedAt, (id) => (targets.get(id)?.length ?? 0) > 0)
    if (!first) return null
    return { concept: bank.concepts.find((c) => c.id === first.conceptId), mastery: state.byId.get(first.conceptId)!, target: targets.get(first.conceptId)?.[0] }
  }, [state, targets, bank.concepts])

  if (!state) return null
  return (
    <div className="sidebar-focus mt-2 rounded-xl border border-primary/25 bg-primary/[0.06] p-3 shadow-[inset_0_0_30px_-18px_rgb(var(--accent-rgb)/0.8)]" data-testid="sidebar-focus">
      <p className="text-[0.65rem] font-medium tracking-wider text-primary uppercase">Next up</p>
      {top?.concept ? (
        <>
          <p className="mt-1 text-sm leading-snug font-semibold" data-testid="sidebar-focus-name">
            {top.concept.name}
          </p>
          <p className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>{LEVEL_LABEL[top.mastery.level]}</span>
            <span className="tabular-nums">{top.mastery.score === null ? "–" : `${Math.round(top.mastery.score * 100)}%`}</span>
          </p>
          <div className="mt-1">
            <ProgressBar value={Math.round((top.mastery.score ?? 0) * 100)} max={100} label="Mastery of the next concept" />
          </div>
          {top.target && (
            <GlowButton tone="blue" className="mt-3 h-8 w-full text-xs" onClick={() => onOpen(top.target!)} data-testid="sidebar-focus-practise">
              Practise
            </GlowButton>
          )}
        </>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">You are all caught up.</p>
      )}
    </div>
  )
}
