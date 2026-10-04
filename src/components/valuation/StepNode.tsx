import { Handle, Position, type Node, type NodeProps } from "@xyflow/react"
import { Check, X } from "lucide-react"

export type NodeStatus = "idle" | "correct" | "wrong" | "expected"

export type StepData = {
  label: string
  detail?: string
  status: NodeStatus
}

export type StepNodeType = Node<StepData, "step">

/** A valuation step as a rounded bubble. Small handles at the sides start and receive connections. */
export function StepNode({ data, selected }: NodeProps<StepNodeType>) {
  return (
    <div className="vb-node" title={data.label} data-status={data.status} data-selected={selected || undefined}>
      <Handle type="target" position={Position.Left} className="vb-handle" aria-label="Incoming connection" />
      {data.status === "correct" && <Check className="size-4 shrink-0 text-grade-easy" aria-label="Correct" />}
      {data.status === "wrong" && <X className="size-4 shrink-0 text-grade-again" aria-label="Does not belong" />}
      <span className="vb-label">{data.label}</span>
      <Handle type="source" position={Position.Right} className="vb-handle" aria-label="Outgoing connection" />
    </div>
  )
}
