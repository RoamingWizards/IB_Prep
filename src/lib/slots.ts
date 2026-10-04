// The Valuation Builder's slot grid. Stages run top to bottom and lanes left to right: every step sits in one slot,
// a stage is a row, and steps in the same row can run in parallel in different lanes. Pure and independent of any
// exercise's solution, so the grid never hints at the answer. Positions are never graded.

/** Size of a step bubble (matches the bubble styling). */
export const NODE_W = 230
export const NODE_H = 64
/** Distance between slot origins: lanes sit side by side, stages stack with room between them for arrows. */
export const LANE_W = 262
export const STAGE_H = 96

/** The grid always shows at least this much, and grows (one spare stage and lane) as steps are placed. */
export const MIN_LANES = 3
export const MIN_STAGES = 4
export const MAX_LANES = 8
export const MAX_STAGES = 14

export interface Slot {
  lane: number
  stage: number
}
export interface Point {
  x: number
  y: number
}

export const slotKey = (s: Slot) => `${s.lane},${s.stage}`
export const slotPosition = (s: Slot): Point => ({ x: s.lane * LANE_W, y: s.stage * STAGE_H })

/** The slot whose origin is nearest to a bubble's top-left corner, inside the largest possible grid. */
export function slotAt(p: Point): Slot {
  return {
    lane: Math.min(MAX_LANES - 1, Math.max(0, Math.round(p.x / LANE_W))),
    stage: Math.min(MAX_STAGES - 1, Math.max(0, Math.round(p.y / STAGE_H))),
  }
}

/** The size the grid is drawn at for these occupied slots: one spare lane and stage beyond the furthest step. */
export function gridSize(occupied: readonly Slot[]): { lanes: number; stages: number } {
  const maxLane = occupied.reduce((m, s) => Math.max(m, s.lane), -1)
  const maxStage = occupied.reduce((m, s) => Math.max(m, s.stage), -1)
  return {
    lanes: Math.min(MAX_LANES, Math.max(MIN_LANES, maxLane + 2)),
    stages: Math.min(MAX_STAGES, Math.max(MIN_STAGES, maxStage + 2)),
  }
}

/**
 * The nearest unoccupied slot to a dropped or dragged bubble. A bubble dropped on a taken slot goes to the closest
 * free one, never on top of another bubble. The search covers the grid as it will be drawn once the neighbours
 * are placed, plus one extra lane and stage so a bubble can always start a new stage.
 */
export function snapToSlot(p: Point, taken: ReadonlySet<string>, occupied: readonly Slot[]): Slot {
  const grid = gridSize(occupied)
  const lanes = Math.min(MAX_LANES, grid.lanes + 1)
  const stages = Math.min(MAX_STAGES, grid.stages + 1)
  let best: Slot | null = null
  let bestDistance = Number.POSITIVE_INFINITY
  for (let lane = 0; lane < lanes; lane++) {
    for (let stage = 0; stage < stages; stage++) {
      if (taken.has(slotKey({ lane, stage }))) continue
      const at = slotPosition({ lane, stage })
      // Measure in slot units so both directions count fairly.
      const d = ((at.x - p.x) / LANE_W) ** 2 + ((at.y - p.y) / STAGE_H) ** 2
      if (d < bestDistance) {
        bestDistance = d
        best = { lane, stage }
      }
    }
  }
  return best ?? { lane: 0, stage: 0 }
}

/**
 * Where a step added by clicking goes: the first free slot, filling stage by stage across the lanes of the starting
 * grid, then widening to more lanes. It is an arbitrary starting place, not a suggested order.
 */
export function firstFreeSlot(taken: ReadonlySet<string>): Slot {
  for (const lanes of [MIN_LANES, 5, MAX_LANES]) {
    for (let stage = 0; stage < MAX_STAGES; stage++) {
      for (let lane = 0; lane < lanes; lane++) if (!taken.has(slotKey({ lane, stage }))) return { lane, stage }
    }
  }
  return { lane: 0, stage: 0 }
}

/** Puts several bubbles on slots, one after another, so no two share a slot. Returns their new top-left positions. */
export function snapAll(
  items: readonly { id: string; position: Point }[],
  fixed: readonly { id: string; position: Point }[],
): Record<string, Point> {
  const occupied = fixed.map((f) => slotAt(f.position))
  const taken = new Set(occupied.map(slotKey))
  const out: Record<string, Point> = {}
  for (const item of items) {
    const slot = snapToSlot(item.position, taken, occupied)
    taken.add(slotKey(slot))
    occupied.push(slot)
    out[item.id] = slotPosition(slot)
  }
  return out
}

/**
 * Turns a left-to-right layered layout (x = depth, y = lane) into slot positions (y = stage, x = lane), so a
 * solution is drawn top to bottom on the same grid. `layout` must have been made with column width `STAGE_H`
 * and row height `LANE_W`, uncentred.
 */
export function toSlotLayout(layout: Record<string, Point>): Record<string, Point> {
  return Object.fromEntries(Object.entries(layout).map(([id, p]) => [id, { x: p.y, y: p.x }]))
}
