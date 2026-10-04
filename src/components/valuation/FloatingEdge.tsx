import { BaseEdge, getBezierPath, useInternalNode, type EdgeProps } from "@xyflow/react"
import { getEdgeParams } from "./geometry"
import { EDGE_COLOR, type FlowEdge } from "./status"

/** An edge that runs bubble to bubble along the shortest line, whatever their positions. */
export function FloatingEdge({ id, source, target, markerEnd, data, selected }: EdgeProps<FlowEdge>) {
  const sourceNode = useInternalNode(source)
  const targetNode = useInternalNode(target)
  if (!sourceNode || !targetNode) return null

  const { sx, sy, tx, ty, sourcePos, targetPos } = getEdgeParams(sourceNode, targetNode)
  const [path] = getBezierPath({ sourceX: sx, sourceY: sy, sourcePosition: sourcePos, targetX: tx, targetY: ty, targetPosition: targetPos })
  const status = data?.status ?? "idle"
  const color = EDGE_COLOR[status]

  return (
    <BaseEdge
      id={id}
      path={path}
      markerEnd={markerEnd}
      interactionWidth={22}
      style={{
        stroke: color,
        strokeWidth: selected ? 3.4 : 2.4,
        strokeDasharray: status === "optional" ? "7 6" : undefined,
        filter: `drop-shadow(0 0 ${selected ? 7 : 4}px ${color}99)`,
      }}
    />
  )
}
