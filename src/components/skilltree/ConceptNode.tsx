import { Handle, Position, type Node, type NodeProps } from "@xyflow/react"
import { LEVEL_LABEL, type MasteryLevel } from "@/lib/mastery"

export type ConceptData = {
  label: string
  level: MasteryLevel
  /** Combined score 0..1, or null when not studied. */
  score: number | null
}

export type ConceptNodeType = Node<ConceptData, "concept">

/** A concept as a rounded node, bordered in its mastery colour. The level is also written out, never colour alone. */
export function ConceptNode({ data, selected }: NodeProps<ConceptNodeType>) {
  return (
    <div className="st-node" data-level={data.level} data-selected={selected || undefined} data-testid="concept-node">
      <Handle type="target" position={Position.Left} className="st-handle" isConnectable={false} />
      <span className="st-name">{data.label}</span>
      <span className="st-level">{data.score === null ? LEVEL_LABEL[data.level] : `${LEVEL_LABEL[data.level]} · ${Math.round(data.score * 100)}%`}</span>
      <Handle type="source" position={Position.Right} className="st-handle" isConnectable={false} />
    </div>
  )
}
