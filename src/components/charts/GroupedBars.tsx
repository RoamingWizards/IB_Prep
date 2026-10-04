import { useElementWidth } from "./useElementWidth"

export interface BarSeries {
  name: string
  color: string
  values: number[]
}

interface Props {
  labels: string[]
  series: BarSeries[]
  height?: number
  label: string
}

const PAD = { left: 30, right: 6, top: 8, bottom: 24 }

/** Side-by-side bars per label (for example this week against last week by weekday), with whole-number y ticks. */
export function GroupedBars({ labels, series, height = 190, label }: Props) {
  const [ref, width] = useElementWidth<HTMLDivElement>()
  const innerW = width - PAD.left - PAD.right
  const innerH = height - PAD.top - PAD.bottom
  const raw = Math.max(1, ...series.flatMap((s) => s.values))
  const step = raw <= 4 ? 1 : raw <= 10 ? 2 : raw <= 20 ? 5 : 10
  const top = Math.ceil(raw / step) * step
  const ticks = Array.from({ length: top / step + 1 }, (_, i) => i * step)
  const group = innerW / labels.length
  const bar = Math.min(18, (group * 0.7) / series.length)
  const y = (v: number) => PAD.top + (1 - v / top) * innerH
  return (
    <div ref={ref} style={{ height }} data-testid="bars">
      <svg width={width} height={height} role="img" aria-label={`${label}. ${labels.map((l, i) => `${l}: ${series.map((s) => `${s.name} ${s.values[i]}`).join(", ")}`).join("; ")}`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke="rgb(var(--text-rgb) / 0.08)" />
            <text x={PAD.left - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--muted-foreground)">
              {t}
            </text>
          </g>
        ))}
        {labels.map((l, i) => {
          const gx = PAD.left + i * group + group / 2
          return (
            <g key={l}>
              <text x={gx} y={height - 6} textAnchor="middle" fontSize="11" fill="var(--muted-foreground)">
                {l}
              </text>
              {series.map((s, k) => {
                const v = s.values[i]
                const bx = gx - (series.length * bar) / 2 + k * bar + 1
                const bh = y(0) - y(v)
                return v > 0 ? <rect key={s.name} x={bx} y={y(v)} width={bar - 2} height={bh} rx="3" fill={s.color} opacity={k === 0 ? 1 : 0.55} /> : null
              })}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
