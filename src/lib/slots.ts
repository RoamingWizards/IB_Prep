// The Valuation Builder's slot grid: stages run left to right, lanes top to bottom, and every step sits in one slot.
// Pure and independent of any exercise's solution, so the grid never hints at the answer. Positions are never graded.

/** Size of a step bubble (matches the bubble styling). */
export const NODE_W = 230
export const NODE_H = 56
/** Distance between slot origins: leaves room between stages for arrows and between lanes for parallel steps. */
export const COL_W = 300
export const ROW_H = 96

/** The grid always shows at least this much, and grows (one spare stage and lane) as steps are placed. */
export const MIN_COLS = 4
export const MIN_ROWS = 3
export const MAX_COLS = 14
export const MAX_ROWS = 10

export interface Slot {
  col: number
  row: number
}
export interface Point {
  x: number
  y: number
}

export const slotKey = (s: Slot) => `${s.col},${s.row}`
export const slotPosition = (s: Slot): Point => ({ x: s.col * COL_W, y: s.row * ROW_H })

/** The slot whose origin is nearest to a bubble's top-left corner, inside the largest possible grid. */
export function slotAt(p: Point): Slot {
  return {
    col: Math.min(MAX_COLS - 1, Math.max(0, Math.round(p.x / COL_W))),
    row: Math.min(MAX_ROWS - 1, Math.max(0, Math.round(p.y / ROW_H))),
  }
}

/** The size the grid is drawn at for these occupied slots: one spare stage and lane beyond the furthest step. */
export function gridSize(occupied: readonly Slot[]): { cols: number; rows: number } {
  const maxCol = occupied.reduce((m, s) => Math.max(m, s.col), -1)
  const maxRow = occupied.reduce((m, s) => Math.max(m, s.row), -1)
  return {
    cols: Math.min(MAX_COLS, Math.max(MIN_COLS, maxCol + 2)),
    rows: Math.min(MAX_ROWS, Math.max(MIN_ROWS, maxRow + 2)),
  }
}

/**
 * The nearest unoccupied slot to a dropped or dragged bubble. A bubble dropped on a taken slot goes to the closest
 * free one, never on top of another bubble. The search covers the grid as it will be drawn once the neighbours
 * are placed, plus one extra stage and lane so a bubble can always start a new stage.
 */
export function snapToSlot(p: Point, taken: ReadonlySet<string>, occupied: readonly Slot[]): Slot {
  const grid = gridSize(occupied)
  const cols = Math.min(MAX_COLS, grid.cols + 1)
  const rows = Math.min(MAX_ROWS, grid.rows + 1)
  let best: Slot | null = null
  let bestDistance = Number.POSITIVE_INFINITY
  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < rows; row++) {
      if (taken.has(slotKey({ col, row }))) continue
      const at = slotPosition({ col, row })
      // Lanes are closer together than stages, so measure in slot units to treat both directions fairly.
      const d = ((at.x - p.x) / COL_W) ** 2 + ((at.y - p.y) / ROW_H) ** 2
      if (d < bestDistance) {
        bestDistance = d
        best = { col, row }
      }
    }
  }
  return best ?? { col: 0, row: 0 }
}

/**
 * Where a step added by clicking goes: the first free slot, filling stage by stage down the lanes of the starting
 * grid, then widening to more lanes. It is an arbitrary starting place, not a suggested order.
 */
export function firstFreeSlot(taken: ReadonlySet<string>): Slot {
  for (const rows of [MIN_ROWS, 5, MAX_ROWS]) {
    for (let col = 0; col < MAX_COLS; col++) {
      for (let row = 0; row < rows; row++) if (!taken.has(slotKey({ col, row }))) return { col, row }
    }
  }
  return { col: 0, row: 0 }
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
