import { useEffect, useMemo, useState } from "react"
import { useContent } from "@/content/contentContext"
import { conceptTargets } from "./conceptTargets"
import {
  getQuickMathResults,
  getRecentAttempts,
  getRecentChoiceAttempts,
  getStatementAttempts,
  getValuationAttempts,
} from "./db"
import { computeMastery, extractEvidence, summariseMastery, type ConceptMastery, type Evidence, type MasterySummary, type RawResults } from "./mastery"

export interface MasteryState {
  /** One entry per concept in the content, in content order. */
  mastery: ConceptMastery[]
  byId: Map<string, ConceptMastery>
  summary: MasterySummary
  /** Results that could not be tied to a concept (removed exercises, generated Quick Maths). */
  unlinked: number
  /** Every saved result as concept evidence, for time-based views. */
  evidence: Evidence[]
  /** Every saved result as stored, for activity views (includes results that name no concept). */
  raw: RawResults
  /** When the calculation was made. Pass this as `now` to repeat it. */
  computedAt: number
}

/** Reads every saved result once and calculates concept mastery. For the dashboard and, later, the skill tree. */
export function useMastery(): { state: MasteryState | null; targets: ReturnType<typeof conceptTargets> } {
  const { bank, exercisesById } = useContent()
  const [raw, setRaw] = useState<{ results: RawResults; at: number } | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      getRecentAttempts(Number.MAX_SAFE_INTEGER),
      getRecentChoiceAttempts(Number.MAX_SAFE_INTEGER),
      getStatementAttempts(),
      getValuationAttempts(),
      getQuickMathResults(),
    ])
      .then(([attempts, choiceAttempts, statementAttempts, valuationAttempts, quickMathResults]) => {
        if (!cancelled) setRaw({ results: { attempts, choiceAttempts, statementAttempts, valuationAttempts, quickMathResults }, at: Date.now() })
      })
      .catch((err) => console.error("Could not read saved results", err))
    return () => {
      cancelled = true
    }
  }, [])

  const state = useMemo<MasteryState | null>(() => {
    if (!raw) return null
    const { evidence, report } = extractEvidence(raw.results, (id) => exercisesById.get(id)?.conceptIds)
    const mastery = computeMastery(evidence, bank.concepts.map((c) => c.id), raw.at)
    return { mastery, evidence, raw: raw.results, byId: new Map(mastery.map((m) => [m.conceptId, m])), summary: summariseMastery(mastery), unlinked: report.unlinked, computedAt: raw.at }
  }, [raw, bank.concepts, exercisesById])

  const targets = useMemo(() => conceptTargets(bank), [bank])
  return { state, targets }
}
