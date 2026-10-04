import { alpha } from "./colour"

export interface Segment {
  label: string
  value: number
  color: string
}

interface Props {
  segments: Segment[]
  centerLabel: string
  centerValue: string
  size?: number
}

/** A ring split into segments with a total in the middle. An empty ring is drawn when there is nothing to show. */
export function Doughnut({ segments, centerLabel, centerValue, size = 168 }: Props) {
  const total = segments.reduce((n, s) => n + s.value, 0)
  const stroke = 18
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const gap = total > 0 && segments.filter((s) => s.value > 0).length > 1 ? 3 : 0
  let offset = 0
  return (
    <div className="relative" style={{ width: size, height: size }} data-testid="doughnut">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${centerLabel}: ${centerValue}. ${segments.map((s) => `${s.label} ${s.value}`).join(", ")}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(var(--text-rgb) / 0.08)" strokeWidth={stroke} />
        {total > 0 &&
          segments.map((s) => {
            if (s.value === 0) return null
            const length = (s.value / total) * c
            const dash = Math.max(0, length - gap)
            const el = (
              <circle
                key={s.label}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={stroke}
                strokeLinecap="butt"
                strokeDasharray={`${dash} ${c - dash}`}
                strokeDashoffset={-offset}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
                style={{ filter: `drop-shadow(0 0 4px ${alpha(s.color, 40)})` }}
              />
            )
            offset += length
            return el
          })}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xs text-muted-foreground">{centerLabel}</span>
        <span className="text-2xl font-semibold tabular-nums">{centerValue}</span>
      </div>
    </div>
  )
}
