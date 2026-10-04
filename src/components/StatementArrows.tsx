import { useCallback, useEffect, useRef, useState, type RefObject } from "react"
import type { ExplanationConnection } from "@/content/types"

interface Arrow {
  n: number
  d: string
  x: number
  y: number
}

interface Props {
  /** The positioned element that contains the statements. Arrows are drawn in its coordinates, so they scroll with it. */
  containerRef: RefObject<HTMLElement | null>
  connections: ExplanationConnection[]
  enabled: boolean
  /** Changing this re-measures (step, layout or column changes that the container's size alone would not reveal). */
  layoutKey: string
}

const MIN_GAP = 24

/** Curved, numbered arrows between the figure cells of connected rows. Measured from the real layout. */
export function StatementArrows({ containerRef, connections, enabled, layoutKey }: Props) {
  const [arrows, setArrows] = useState<Arrow[]>([])
  const frame = useRef(0)

  const measure = useCallback(() => {
    const container = containerRef.current
    if (!container || !enabled) {
      setArrows([])
      return
    }
    const box = container.getBoundingClientRect()
    const anchor = (rowId: string) => {
      const cell = container.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(rowId)}"] [data-anchor]`)
      if (!cell) return null
      const r = cell.getBoundingClientRect()
      return { left: r.left - box.left, right: r.right - box.left, y: r.top - box.top + r.height / 2 }
    }
    const out: Arrow[] = []
    connections.forEach((c, i) => {
      const a = anchor(c.from)
      const b = anchor(c.to)
      if (!a || !b) return
      let sx: number, sy: number, ex: number, ey: number, c1x: number, c2x: number
      if (a.right + MIN_GAP < b.left) {
        // the target is in a column to the right
        ;[sx, sy, ex, ey] = [a.right, a.y, b.left, b.y]
        const dx = Math.max(40, (ex - sx) * 0.5)
        ;[c1x, c2x] = [sx + dx, ex - dx]
      } else if (b.right + MIN_GAP < a.left) {
        // the target is in a column to the left
        ;[sx, sy, ex, ey] = [a.left, a.y, b.right, b.y]
        const dx = Math.max(40, (sx - ex) * 0.5)
        ;[c1x, c2x] = [sx - dx, ex + dx]
      } else {
        // same column: bow out to the right of the figures
        ;[sx, sy, ex, ey] = [a.right, a.y, b.right, b.y]
        const bow = 34 + Math.min(60, Math.abs(ey - sy) * 0.12)
        ;[c1x, c2x] = [sx + bow, ex + bow]
      }
      // the midpoint of a cubic Bezier at t = 0.5, where the number sits
      const x = (sx + 3 * c1x + 3 * c2x + ex) / 8
      const y = (sy + 3 * sy + 3 * ey + ey) / 8
      out.push({ n: i + 1, d: `M ${sx} ${sy} C ${c1x} ${sy}, ${c2x} ${ey}, ${ex} ${ey}`, x, y })
    })
    setArrows(out)
  }, [containerRef, connections, enabled])

  useEffect(() => {
    const schedule = () => {
      cancelAnimationFrame(frame.current)
      frame.current = requestAnimationFrame(measure)
    }
    schedule()
    const container = containerRef.current
    const observer = container ? new ResizeObserver(schedule) : null
    if (container) observer?.observe(container)
    window.addEventListener("resize", schedule)
    void document.fonts?.ready.then(schedule)
    return () => {
      cancelAnimationFrame(frame.current)
      observer?.disconnect()
      window.removeEventListener("resize", schedule)
    }
    // layoutKey is intentionally a dependency: it forces a re-measure when the layout changes in ways the
    // container's size does not show.
  }, [measure, containerRef, layoutKey])

  if (!enabled || arrows.length === 0) return null
  return (
    <svg className="stmt-arrows" aria-hidden data-testid="statement-arrows">
      <defs>
        <marker id="stmt-arrowhead" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--primary)" />
        </marker>
      </defs>
      {arrows.map((a) => (
        <g key={`${layoutKey}-${a.n}`} className="stmt-arrow" data-arrow={a.n}>
          <path className="line" d={a.d} markerEnd="url(#stmt-arrowhead)" />
          <circle cx={a.x} cy={a.y} r={9.5} />
          <text x={a.x} y={a.y}>
            {a.n}
          </text>
        </g>
      ))}
    </svg>
  )
}
