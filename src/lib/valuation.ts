// Pure logic for the Valuation Builder: grading a learner's diagram against the accepted solutions and
// laying a solution out. No browser APIs, so it can also be checked from Node.
import type { ValuationExercise, ValuationGraph } from "@/content/types"

export interface LearnerEdge {
  id: string // `${from}>${to}`
  from: string
  to: string
}

export const edgeKey = (from: string, to: string) => `${from}>${to}`

export type EdgeIssue = "reversed" | "unsupported" | "not-in-solution"

export interface ValuationGrade {
  graphId: string // the accepted solution the diagram was graded against (the closest one)
  requiredSteps: number
  correctSteps: number
  missingStepIds: string[]
  distractorIds: string[] // selected steps that belong in no solution
  extraStepIds: string[] // selected steps that belong to another accepted solution but not this one
  requiredEdges: number
  correctEdges: number
  missingEdgeIds: string[] // required connections (by solution edge ID) that were not drawn
  correctEdgeKeys: string[] // drawn connections that were right
  incorrectEdges: { id: string; from: string; to: string; reason: EdgeIssue }[]
  perfect: boolean
}

interface Accepted {
  edgeId: string
  optional: boolean
}

/** Grades one learner diagram against one accepted solution. Only relationships matter, never positions. */
function gradeAgainst(
  exercise: ValuationExercise,
  graph: ValuationGraph,
  placed: ReadonlySet<string>,
  edges: LearnerEdge[],
): ValuationGrade {
  const inGraph = new Set(graph.steps)
  const distractors = new Set(exercise.distractors)

  const accepted = new Map<string, Accepted>()
  for (const e of graph.edges) {
    accepted.set(edgeKey(e.from, e.to), { edgeId: e.id, optional: !!e.optional })
    for (const alt of e.alternatives ?? []) accepted.set(edgeKey(alt.from, alt.to), { edgeId: e.id, optional: !!e.optional })
  }

  const missingStepIds = graph.steps.filter((s) => !placed.has(s))
  const distractorIds = [...placed].filter((s) => distractors.has(s))
  const extraStepIds = [...placed].filter((s) => !inGraph.has(s) && !distractors.has(s))

  const satisfied = new Set<string>()
  const correctEdgeKeys: string[] = []
  const incorrectEdges: ValuationGrade["incorrectEdges"] = []
  for (const e of edges) {
    const key = edgeKey(e.from, e.to)
    const hit = accepted.get(key)
    if (hit) {
      correctEdgeKeys.push(key)
      satisfied.add(hit.edgeId)
    } else {
      const reason: EdgeIssue =
        !inGraph.has(e.from) || !inGraph.has(e.to) ? "not-in-solution" : accepted.has(edgeKey(e.to, e.from)) ? "reversed" : "unsupported"
      incorrectEdges.push({ id: key, from: e.from, to: e.to, reason })
    }
  }

  const required = graph.edges.filter((e) => !e.optional)
  const missingEdgeIds = required.filter((e) => !satisfied.has(e.id)).map((e) => e.id)
  const correctSteps = graph.steps.length - missingStepIds.length
  const correctEdges = required.length - missingEdgeIds.length

  return {
    graphId: graph.id,
    requiredSteps: graph.steps.length,
    correctSteps,
    missingStepIds,
    distractorIds,
    extraStepIds,
    requiredEdges: required.length,
    correctEdges,
    missingEdgeIds,
    correctEdgeKeys,
    incorrectEdges,
    perfect:
      missingStepIds.length === 0 &&
      distractorIds.length === 0 &&
      extraStepIds.length === 0 &&
      missingEdgeIds.length === 0 &&
      incorrectEdges.length === 0,
  }
}

const score = (g: ValuationGrade) =>
  g.correctSteps + g.correctEdges - g.distractorIds.length - g.extraStepIds.length - g.incorrectEdges.length

/** Grades against every accepted solution and reports against the closest one. */
export function gradeValuation(exercise: ValuationExercise, placedIds: readonly string[], edges: LearnerEdge[]): ValuationGrade {
  const placed = new Set(placedIds)
  let best: ValuationGrade | null = null
  for (const graph of exercise.solutions) {
    const result = gradeAgainst(exercise, graph, placed, edges)
    if (!best || score(result) > score(best)) best = result
  }
  return best!
}

/**
 * Positions a solution left to right by dependency depth, so independent branches sit side by side
 * and a step always appears to the right of everything it depends on.
 */
export function layoutGraph(graph: ValuationGraph, columnWidth = 310, rowHeight = 112): Record<string, { x: number; y: number }> {
  const into = new Map<string, string[]>(graph.steps.map((s) => [s, []]))
  for (const e of graph.edges) into.get(e.to)?.push(e.from)
  const depth = new Map<string, number>()
  const depthOf = (s: string): number => {
    const known = depth.get(s)
    if (known !== undefined) return known
    depth.set(s, 0) // guards against a cycle in malformed data
    const d = Math.max(-1, ...(into.get(s) ?? []).map(depthOf)) + 1
    depth.set(s, d)
    return d
  }
  graph.steps.forEach(depthOf)
  const columns = new Map<number, string[]>()
  for (const s of graph.steps) columns.set(depth.get(s)!, [...(columns.get(depth.get(s)!) ?? []), s])
  const tallest = Math.max(...[...columns.values()].map((c) => c.length))
  const out: Record<string, { x: number; y: number }> = {}
  for (const [d, ids] of columns) {
    const offset = ((tallest - ids.length) * rowHeight) / 2
    ids.forEach((id, i) => (out[id] = { x: d * columnWidth, y: offset + i * rowHeight }))
  }
  return out
}
