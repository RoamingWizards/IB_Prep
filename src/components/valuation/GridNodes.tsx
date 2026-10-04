import type { Node, NodeProps } from "@xyflow/react"

export type SlotNodeType = Node<Record<string, never>, "slot">
export type StageNodeType = Node<{ label: string }, "stage">

/** An empty slot: a faint dashed outline a step can snap into. Not interactive. */
export function SlotNode() {
  return <div className="vb-slot" aria-hidden />
}

/** A stage heading above a column of slots. It numbers the columns only; it says nothing about what belongs in them. */
export function StageNode({ data }: NodeProps<StageNodeType>) {
  return (
    <div className="vb-stage" data-testid="stage-label">
      {data.label}
    </div>
  )
}
