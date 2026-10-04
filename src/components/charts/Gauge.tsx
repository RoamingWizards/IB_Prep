import { useId } from "react"

interface Props {
  /** 0..1 */
  value: number
  title: string
  caption: string
}

/** A semicircular gauge from red through amber to green, with the value and a one-word reading underneath. */
export function Gauge({ value, title, caption }: Props) {
  const id = useId()
  const w = 220
  const h = 124
  const cx = w / 2
  const cy = 108
  const r = 88
  const clamped = Math.min(1, Math.max(0, value))
  const angle = Math.PI * (1 - clamped)
  const px = cx + r * Math.cos(angle)
  const py = cy - r * Math.sin(angle)
  const arc = (a: number) => `M${cx - r} ${cy} A${r} ${r} 0 ${a > Math.PI / 2 ? 0 : 0} 1 ${cx + r * Math.cos(Math.PI - a)} ${cy - r * Math.sin(Math.PI - a)}`
  return (
    <div className="relative mx-auto" style={{ width: w, height: h }} data-testid="gauge">
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`${title}: ${Math.round(clamped * 100)} percent, ${caption}`}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="var(--grade-again)" />
            <stop offset="0.5" stopColor="var(--grade-hard)" />
            <stop offset="1" stopColor="var(--grade-easy)" />
          </linearGradient>
        </defs>
        <path d={`M${cx - r} ${cy} A${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke="rgb(var(--text-rgb) / 0.09)" strokeWidth="14" strokeLinecap="round" />
        {clamped > 0 && <path d={arc(clamped * Math.PI)} fill="none" stroke={`url(#${id})`} strokeWidth="14" strokeLinecap="round" style={{ filter: "drop-shadow(0 0 6px rgb(var(--accent-rgb) / 0.4))" }} />}
        <circle cx={px} cy={py} r="6" fill="var(--foreground)" stroke="var(--background)" strokeWidth="2" />
        <text x={cx - r} y={h - 2} fontSize="11" fill="var(--muted-foreground)" textAnchor="middle">
          0
        </text>
        <text x={cx + r} y={h - 2} fontSize="11" fill="var(--muted-foreground)" textAnchor="middle">
          100
        </text>
      </svg>
      <div className="pointer-events-none absolute inset-x-0 top-[48px] flex flex-col items-center">
        <span className="text-3xl font-semibold tabular-nums" data-testid="gauge-value">
          {Math.round(clamped * 100)}
        </span>
        <span className="text-sm text-muted-foreground" data-testid="gauge-caption">
          {caption}
        </span>
      </div>
    </div>
  )
}
