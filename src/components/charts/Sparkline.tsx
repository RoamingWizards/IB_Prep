import { useId } from "react"

interface Props {
  values: (number | null)[]
  color: string
  /** Value range; defaults to the data's own range. */
  domain?: [number, number]
  height?: number
  className?: string
}

/** A small trend line with a soft area under it. Gaps (null) are skipped, not drawn as zero. */
export function Sparkline({ values, color, domain, height = 44, className }: Props) {
  const id = useId()
  const width = 160
  const pts = values.flatMap((v, i) => (v === null ? [] : [{ i, v }]))
  if (pts.length === 0) return <div className={className} style={{ height }} aria-hidden />
  const lo = domain ? domain[0] : Math.min(...pts.map((p) => p.v))
  const hi = domain ? domain[1] : Math.max(...pts.map((p) => p.v))
  const span = hi - lo || 1
  const x = (i: number) => (values.length === 1 ? width / 2 : (i / (values.length - 1)) * width)
  const y = (v: number) => 4 + (1 - (v - lo) / span) * (height - 8)
  const line = pts.map((p, k) => `${k === 0 ? "M" : "L"}${x(p.i).toFixed(1)} ${y(p.v).toFixed(1)}`).join(" ")
  const first = pts[0]
  const last = pts[pts.length - 1]
  const area = `${line} L${x(last.i).toFixed(1)} ${height} L${x(first.i).toFixed(1)} ${height} Z`
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className={className} style={{ width: "100%", height }} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.32" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
