import { useId, useState } from "react"
import { alpha } from "./colour"
import { useElementWidth } from "./useElementWidth"

export interface AreaPoint {
  label: string
  /** 0..1, or null for no data at that point. */
  value: number | null
}

interface Props {
  points: AreaPoint[]
  color?: string
  height?: number
  /** Describes the chart for assistive technology. */
  label: string
  format?: (value: number) => string
}

const PAD = { left: 42, right: 14, top: 14, bottom: 28 }

/** A line chart with a filled area, y axis in percent, and a tooltip that follows the pointer. */
export function AreaChart({ points, color = "var(--primary)", height = 310, label, format = (v) => `${Math.round(v * 100)}%` }: Props) {
  const id = useId()
  const [ref, width] = useElementWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const innerW = width - PAD.left - PAD.right
  const innerH = height - PAD.top - PAD.bottom
  const x = (i: number) => PAD.left + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW)
  // The y axis fits the data (with some headroom) so improvement is visible, but never goes past 0 to 100%.
  const values = points.flatMap((p) => (p.value === null ? [] : [p.value]))
  let lo = values.length ? Math.min(...values) : 0
  let hi = values.length ? Math.max(...values) : 1
  if (hi - lo < 0.2) {
    const mid = (hi + lo) / 2
    lo = mid - 0.1
    hi = mid + 0.1
  }
  lo = Math.max(0, Math.floor((lo - 0.05) * 10) / 10)
  hi = Math.min(1, Math.ceil((hi + 0.05) * 10) / 10)
  if (hi - lo < 0.2) hi = Math.min(1, lo + 0.2)
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => lo + t * (hi - lo))
  const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * innerH
  const segments: { i: number; v: number }[][] = []
  points.forEach((p, i) => {
    if (p.value === null) segments.push([])
    else {
      if (segments.length === 0) segments.push([])
      segments[segments.length - 1].push({ i, v: p.value })
    }
  })
  const drawn = segments.filter((s) => s.length > 0)
  const every = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(innerW / 70))))
  const active = hover !== null ? points[hover] : null

  return (
    <div ref={ref} className="relative" style={{ height }} data-testid="area-chart">
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={label}
        onPointerLeave={() => setHover(null)}
        onPointerMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          const t = (e.clientX - rect.left - PAD.left) / innerW
          setHover(Math.min(points.length - 1, Math.max(0, Math.round(t * (points.length - 1)))))
        }}
      >
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.4" />
            <stop offset="1" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke="rgb(var(--text-rgb) / 0.08)" />
            <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--muted-foreground)">
              {Math.round(t * 100)}%
            </text>
          </g>
        ))}
        {points.map((p, i) =>
          i % every === 0 || i === points.length - 1 ? (
            <text key={i} x={x(i)} y={height - 8} textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"} fontSize="11" fill="var(--muted-foreground)">
              {p.label}
            </text>
          ) : null,
        )}
        {drawn.map((seg, k) => {
          const line = seg.map((p, j) => `${j === 0 ? "M" : "L"}${x(p.i).toFixed(1)} ${y(p.v).toFixed(1)}`).join(" ")
          const area = `${line} L${x(seg[seg.length - 1].i).toFixed(1)} ${y(lo)} L${x(seg[0].i).toFixed(1)} ${y(lo)} Z`
          return (
            <g key={k}>
              {seg.length > 1 && <path d={area} fill={`url(#${id})`} />}
              <path d={line} fill="none" stroke={color} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" style={{ filter: `drop-shadow(0 0 5px ${alpha(color, 55)})` }} />
              {seg.length === 1 && <circle cx={x(seg[0].i)} cy={y(seg[0].v)} r="3.5" fill={color} />}
            </g>
          )
        })}
        {active && active.value !== null && hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={y(lo)} stroke={color} strokeOpacity="0.35" strokeDasharray="3 4" />
            <circle cx={x(hover)} cy={y(active.value)} r="5" fill={color} stroke="var(--background)" strokeWidth="2" />
          </g>
        )}
      </svg>
      {values.length === 0 && (
        <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted-foreground" data-testid="chart-empty">
          No data yet for this range.
        </p>
      )}
      {active && hover !== null && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg border border-white/10 bg-popover/95 px-2.5 py-1.5 text-xs shadow-lg"
          style={{ left: Math.min(width - 110, Math.max(0, x(hover) - 48)), top: 0 }}
          data-testid="area-tooltip"
        >
          <div className="text-muted-foreground">{active.label}</div>
          <div className="text-sm font-semibold tabular-nums">{active.value === null ? "No data" : format(active.value)}</div>
        </div>
      )}
    </div>
  )
}
