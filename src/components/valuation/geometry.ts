// Where a floating edge meets a bubble. Edges attach to the nearest point on the bubble's rounded border
// along the line between the two centres, so they never depend on fixed handle positions.
import { Position, type InternalNode } from "@xyflow/react"

/** Matches the bubble's corner radius in ui.css. */
const RADIUS = 26

/** Signed distance from the origin-centred rounded rectangle (half sizes hw, hh, corner radius r). */
function distance(px: number, py: number, hw: number, hh: number, r: number) {
  const qx = Math.abs(px) - (hw - r)
  const qy = Math.abs(py) - (hh - r)
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r
}

function borderPoint(cx: number, cy: number, hw: number, hh: number, toX: number, toY: number) {
  const dx = toX - cx
  const dy = toY - cy
  const length = Math.hypot(dx, dy) || 1
  const ux = dx / length
  const uy = dy / length
  const r = Math.min(RADIUS, hw, hh)
  let inside = 0
  let outside = Math.hypot(hw, hh) + 2
  for (let i = 0; i < 24; i++) {
    const mid = (inside + outside) / 2
    if (distance(ux * mid, uy * mid, hw, hh, r) <= 0) inside = mid
    else outside = mid
  }
  return { x: cx + ux * inside, y: cy + uy * inside }
}

function side(dx: number, dy: number, away: boolean): Position {
  const horizontal = Math.abs(dx) > Math.abs(dy)
  const sign = away ? 1 : -1
  if (horizontal) return dx * sign > 0 ? Position.Right : Position.Left
  return dy * sign > 0 ? Position.Bottom : Position.Top
}

export function getEdgeParams(source: InternalNode, target: InternalNode) {
  const sw = (source.measured.width ?? 0) / 2
  const sh = (source.measured.height ?? 0) / 2
  const tw = (target.measured.width ?? 0) / 2
  const th = (target.measured.height ?? 0) / 2
  const scx = source.internals.positionAbsolute.x + sw
  const scy = source.internals.positionAbsolute.y + sh
  const tcx = target.internals.positionAbsolute.x + tw
  const tcy = target.internals.positionAbsolute.y + th
  const s = borderPoint(scx, scy, sw, sh, tcx, tcy)
  const t = borderPoint(tcx, tcy, tw, th, scx, scy)
  const dx = tcx - scx
  const dy = tcy - scy
  return { sx: s.x, sy: s.y, tx: t.x, ty: t.y, sourcePos: side(dx, dy, true), targetPos: side(dx, dy, false) }
}
