import type { Edge } from "@xyflow/react"

export type EdgeStatus = "idle" | "correct" | "wrong" | "expected" | "optional"

export type FlowEdgeData = { status: EdgeStatus }

export type FlowEdge = Edge<FlowEdgeData, "floating">

export const EDGE_COLOR: Record<EdgeStatus, string> = {
  idle: "#8b9cff",
  correct: "#38c98d",
  wrong: "#f0657a",
  expected: "#a89bff",
  optional: "#a89bff",
}
