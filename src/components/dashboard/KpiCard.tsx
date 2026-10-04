import type { LucideIcon } from "lucide-react"
import { Panel } from "@/components/kit"
import { alpha } from "@/components/charts/colour"
import { Sparkline } from "@/components/charts/Sparkline"
import { cn } from "@/lib/utils"

interface Props {
  icon: LucideIcon
  label: string
  /** The headline figure, or "–" when there is nothing to show yet. */
  value: string
  /** A line under the figure, for example "of 33 concepts studied". */
  sub?: string
  /** Change against the previous period, as text, with its direction deciding the colour. */
  delta?: { text: string; direction: "up" | "down" | "flat" } | null
  trend: (number | null)[]
  /** Colour of the icon chip and the trend line. */
  color: string
  trendDomain?: [number, number]
  testId: string
}

const DELTA_CLASS = { up: "text-grade-easy", down: "text-grade-again", flat: "text-muted-foreground" } as const

/** One headline metric: icon, small label, large figure, trend line and change, as in the reference dashboard. */
export function KpiCard({ icon: Icon, label, value, sub, delta, trend, color, trendDomain, testId }: Props) {
  return (
    <Panel className="flex flex-col gap-1 p-4" data-testid={testId}>
      <div className="flex items-center gap-2.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl" style={{ background: alpha(color, 14), color, boxShadow: `inset 0 0 0 1px ${alpha(color, 22)}` }}>
          <Icon className="size-[18px]" aria-hidden />
        </span>
        <p className="text-[0.7rem] font-medium tracking-wider text-muted-foreground uppercase">{label}</p>
      </div>
      <p className="mt-2 text-[1.75rem] leading-none font-semibold tabular-nums" data-testid={`${testId}-value`}>
        {value}
      </p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      <div className="mt-1.5 flex items-end gap-3">
        <div className="min-w-0 flex-1">
          <Sparkline values={trend} color={color} domain={trendDomain} />
        </div>
        <p className={cn("shrink-0 pb-0.5 text-xs font-medium tabular-nums", delta ? DELTA_CLASS[delta.direction] : "text-muted-foreground")} data-testid={`${testId}-delta`}>
          {delta ? delta.text : "–"}
        </p>
      </div>
    </Panel>
  )
}
