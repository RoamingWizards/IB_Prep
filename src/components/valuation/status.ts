import type { Edge } from "@xyflow/react"

export type EdgeStatus = "idle" | "correct" | "wrong" | "expected" | "optional"

export type FlowEdgeData = { status: EdgeStatus }

export type FlowEdge = Edge<FlowEdgeData, "floating">

export const EDGE_COLOR: Record<EdgeStatus, string> = {
  idle: "var(--primary)",
  correct: "var(--grade-easy)",
  wrong: "var(--grade-again)",
  expected: "#8b7cf6",
  optional: "#8b7cf6",
}
