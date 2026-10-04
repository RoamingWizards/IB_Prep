import { useMemo, useState } from "react"
import { Activity, BookOpen, Brain, Calculator, CalendarCheck, FileSpreadsheet, Flame, Route, Target, Trophy, Workflow, type LucideIcon } from "lucide-react"
import { AreaChart, type AreaPoint } from "@/components/charts/AreaChart"
import { Doughnut } from "@/components/charts/Doughnut"
import { Gauge } from "@/components/charts/Gauge"
import { GroupedBars } from "@/components/charts/GroupedBars"
import { Sparkline } from "@/components/charts/Sparkline"
import { ConceptDetails } from "@/components/dashboard/ConceptDetails"
import { KpiCard } from "@/components/dashboard/KpiCard"
import { Panel } from "@/components/kit"
import { LevelBadge, PracticeLinks } from "@/components/MasteryBits"
import { useContent } from "@/content/contentContext"
import {
  dailyCounts,
  DAY,
  deltaPoints,
  extractActivity,
  masteryHistory,
  meanScore,
  readinessLabel,
  sourceStats,
  streaks,
  weekdayCounts,
  weeklyMeans,
} from "@/lib/analytics"
import type { PracticeTarget } from "@/lib/conceptTargets"
import { LEVEL_LABEL, recommendPractice, SOURCE_LABEL, type EvidenceSource, type MasteryLevel, type Recommendation } from "@/lib/mastery"
import { useMastery } from "@/lib/useMastery"
import { cn } from "@/lib/utils"

const GREEN = "var(--primary)"
const VIOLET = "#8b7cf6"
const BLUE = "var(--grade-good)"
const AMBER = "var(--grade-hard)"
const LEVEL_COLOR: Record<MasteryLevel, string> = { strong: "var(--grade-easy)", developing: "var(--grade-good)", weak: "var(--grade-again)", "not-studied": "color-mix(in srgb, var(--foreground) 22%, var(--background))" }
const SOURCE_ICON: Record<EvidenceSource, LucideIcon> = {
  flashcard: BookOpen,
  "deal-walk": Route,
  "three-statements": FileSpreadsheet,
  valuation: Workflow,
  "quick-maths": Calculator,
}
const REASON_TEXT: Record<Recommendation["reason"], string> = {
  weak: "Your results here are weak.",
  stale: "Not practised for a while.",
  developing: "Still developing: graded practice would settle it.",
  "self-rated-only": "Only self-rated so far.",
  "not-studied": "No results yet.",
}
const RANGES = [
  { id: "4", label: "4W", weeks: 4 },
  { id: "8", label: "8W", weeks: 8 },
  { id: "12", label: "12W", weeks: 12 },
  { id: "26", label: "26W", weeks: 26 },
] as const
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
const shortDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" })

const pct = (v: number | null) => (v === null ? "–" : `${Math.round(v * 100)}%`)
function pointsDelta(points: number | null) {
  if (points === null) return null
  const r = Math.round(points * 10) / 10
  return { text: `${r > 0 ? "+" : ""}${r} pts`, direction: r > 0 ? ("up" as const) : r < 0 ? ("down" as const) : ("flat" as const) }
}
function countDelta(diff: number) {
  return { text: `${diff > 0 ? "+" : ""}${diff}`, direction: diff > 0 ? ("up" as const) : diff < 0 ? ("down" as const) : ("flat" as const) }
}
function timeAgo(at: number, now: number) {
  const mins = Math.max(0, Math.round((now - at) / 60000))
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.round(hours / 24)
  return days === 1 ? "yesterday" : `${days} days ago`
}

function PanelTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-[0.7rem] font-medium tracking-wider text-muted-foreground uppercase">{children}</h2>
      {right}
    </div>
  )
}

function Pills<T extends string>({ value, options, onChange, label, testId }: { value: T; options: readonly { id: T; label: string }[]; onChange: (v: T) => void; label: string; testId: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1" data-testid={testId}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          data-value={o.id}
          onClick={() => onChange(o.id)}
          onMouseUp={(e) => e.currentTarget.blur()}
          className={cn(
            "rounded-lg px-2.5 py-1 text-xs text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
            value === o.id && "bg-primary/15 font-medium text-primary shadow-[inset_0_0_0_1px_rgb(var(--accent-rgb)/0.3)]",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** The front page: how you are doing and how that has changed, then the concept-level detail. */
export function DashboardView({ onOpen }: { onOpen: (target: PracticeTarget) => void }) {
  const { bank, exercisesById, processesById } = useContent()
  const { state, targets } = useMastery()
  const [range, setRange] = useState<(typeof RANGES)[number]["id"]>("12")
  const [metric, setMetric] = useState<"mastery" | "accuracy">("mastery")
  const names = useMemo(() => new Map(bank.concepts.map((c) => [c.id, c.name])), [bank.concepts])
  const conceptIds = useMemo(() => bank.concepts.map((c) => c.id), [bank.concepts])

  const data = useMemo(() => {
    if (!state) return null
    const now = state.computedAt
    const events = extractActivity(state.raw, { exercise: (id) => exercisesById.get(id)?.title, process: (id) => processesById.get(id)?.title })
    const history = masteryHistory(state.evidence, conceptIds, now, 26)
    const last = history[history.length - 1]
    const monthAgo = history[history.length - 5]
    const acc = meanScore(events, now - 28 * DAY + 1, now + 1, "objective")
    const accBefore = meanScore(events, now - 56 * DAY + 1, now - 28 * DAY + 1, "objective")
    const week = events.filter((e) => e.at > now - 7 * DAY && e.at <= now).length
    const weekBefore = events.filter((e) => e.at > now - 14 * DAY && e.at <= now - 7 * DAY).length
    const objectiveAll = meanScore(events, 0, now + 1, "objective")
    return {
      now,
      events,
      history,
      last,
      acc,
      accDelta: deltaPoints(acc.mean, accBefore.mean),
      accSpark: weeklyMeans(events, now, 8, "objective"),
      masteryDelta: deltaPoints(last.average, monthAgo?.average ?? null),
      masterySpark: history.slice(-9).map((p) => p.average),
      strongDelta: last.strong - (monthAgo?.strong ?? 0),
      strongSpark: history.slice(-9).map((p) => p.strong),
      week,
      weekDiff: week - weekBefore,
      daily: dailyCounts(events, now, 14),
      weekdays: weekdayCounts(events, now),
      streak: streaks(events, now),
      byMode: sourceStats(events, now),
      objectiveAll,
      recent: [...events].reverse().slice(0, 6),
      accWeekly: weeklyMeans(events, now, 26, "objective"),
    }
  }, [state, conceptIds, exercisesById, processesById])

  const recommendations = useMemo(
    () => (state ? recommendPractice(state.mastery, state.computedAt, (id) => (targets.get(id)?.length ?? 0) > 0).slice(0, 4) : []),
    [state, targets],
  )
  if (!state || !data) return null
  const { summary } = state
  const weeks = RANGES.find((r) => r.id === range)!.weeks
  const chartPoints: AreaPoint[] =
    metric === "mastery"
      ? data.history.slice(-(weeks + 1)).map((p) => ({ label: shortDate.format(p.at), value: p.average }))
      : data.accWeekly.slice(-weeks).map((v, i, all) => ({ label: shortDate.format(data.now - (all.length - 1 - i) * 7 * DAY), value: v }))
  const hasEvents = data.events.length > 0
  const levels: MasteryLevel[] = ["strong", "developing", "weak", "not-studied"]
  const segments = levels.map((l) => ({ label: LEVEL_LABEL[l], value: summary.counts[l], color: LEVEL_COLOR[l] }))

  return (
    <div className="mx-auto w-full max-w-[84rem] space-y-5" data-testid="dashboard">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-semibold">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">How your practice is going and how it has changed, from every result saved in every mode.</p>
        </div>
        {!hasEvents && (
          <p className="rounded-xl border border-primary/25 bg-primary/10 px-3 py-2 text-sm text-primary" data-testid="dashboard-empty">
            No results yet. Answer a few questions in any mode and your track record appears here.
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" data-testid="kpis">
        <KpiCard
          testId="kpi-accuracy"
          icon={Target}
          label="Answer accuracy"
          value={pct(data.acc.mean)}
          sub={data.acc.count > 0 ? `${data.acc.count} graded answers in 4 weeks` : "No graded answers in 4 weeks"}
          delta={pointsDelta(data.accDelta)}
          trend={data.accSpark}
          trendDomain={[0, 1]}
          color={GREEN}
        />
        <KpiCard
          testId="kpi-mastery"
          icon={Brain}
          label="Concept mastery"
          value={pct(data.last.average)}
          sub={`average of ${data.last.studied} studied of ${summary.total} concepts`}
          delta={pointsDelta(data.masteryDelta)}
          trend={data.masterySpark}
          trendDomain={[0, 1]}
          color={VIOLET}
        />
        <KpiCard
          testId="kpi-answers"
          icon={Activity}
          label="Answers this week"
          value={String(data.week)}
          sub="in the last 7 days"
          delta={countDelta(data.weekDiff)}
          trend={data.daily}
          color={BLUE}
        />
        <KpiCard
          testId="kpi-strong"
          icon={Trophy}
          label="Strong concepts"
          value={String(summary.counts.strong)}
          sub={`of ${summary.total} concepts`}
          delta={countDelta(data.strongDelta)}
          trend={data.strongSpark}
          color={AMBER}
        />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <Panel className="min-w-0 p-5" data-testid="trend-panel">
          <PanelTitle
            right={
              <div className="flex flex-wrap items-center gap-3">
                <Pills value={metric} onChange={setMetric} label="Measure" testId="metric-pills" options={[{ id: "mastery", label: "Mastery" }, { id: "accuracy", label: "Accuracy" }]} />
                <Pills value={range} onChange={setRange} label="Range" testId="range-pills" options={RANGES.map((r) => ({ id: r.id, label: r.label }))} />
              </div>
            }
          >
            {metric === "mastery" ? "Mastery over time" : "Answer accuracy over time"}
          </PanelTitle>
          <AreaChart
            points={chartPoints}
            label={metric === "mastery" ? "Average mastery of studied concepts by week" : "Graded answer accuracy by week"}
            color={metric === "mastery" ? VIOLET : GREEN}
          />
          <p className="mt-2 text-xs text-muted-foreground">
            {metric === "mastery"
              ? "Average mastery score of the concepts you had studied by each date, recalculated from the results saved by then."
              : "Share of graded answers correct, as a score from 0 to 100%, over the 7 days up to each date. Self-rated flashcards are not included."}
          </p>
        </Panel>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
          <Panel className="p-5" data-testid="breakdown-panel">
            <PanelTitle>Mastery breakdown</PanelTitle>
            <div className="flex items-center gap-4">
              <Doughnut segments={segments} centerLabel="Concepts" centerValue={String(summary.total)} size={144} />
              <ul className="min-w-0 flex-1 space-y-1.5 text-sm">
                {segments.map((s) => (
                  <li key={s.label} className="flex items-center gap-2" data-testid="breakdown-row" data-level={levels[segments.indexOf(s)]}>
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: s.color }} aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">{s.label}</span>
                    <span className="font-medium tabular-nums">{s.value}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Panel>
          <Panel className="p-5" data-testid="readiness-panel">
            <PanelTitle>Readiness</PanelTitle>
            <Gauge value={data.last.readiness} title="Readiness" caption={readinessLabel(data.last.readiness)} />
            <p className="mt-2 text-center text-xs text-muted-foreground">Average mastery across all concepts; concepts not studied count as 0.</p>
          </Panel>
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel className="p-5" data-testid="by-mode-panel">
          <PanelTitle>Results by mode</PanelTitle>
          {data.byMode.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
          ) : (
            <ul className="divide-y divide-white/[0.06]">
              {data.byMode.map((m) => {
                const Icon = SOURCE_ICON[m.source]
                return (
                  <li key={m.source} className="grid grid-cols-[auto_minmax(0,1fr)_5rem_4.5rem] items-center gap-3 py-2.5" data-testid="mode-row" data-source={m.source}>
                    <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-[inset_0_0_0_1px_rgb(var(--accent-rgb)/0.2)]">
                      <Icon className="size-[18px]" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{SOURCE_LABEL[m.source]}</p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {m.count} {m.count === 1 ? "result" : "results"} · {m.kind === "self-rated" ? "self-rated" : "graded"}
                      </p>
                    </div>
                    <Sparkline values={m.trend} color={m.kind === "self-rated" ? VIOLET : GREEN} domain={[0, 1]} height={30} />
                    <p className="text-right text-sm font-semibold tabular-nums" data-testid="mode-score">
                      {pct(m.mean)}
                    </p>
                  </li>
                )
              })}
            </ul>
          )}
        </Panel>

        <Panel className="p-5" data-testid="recommendations">
          <PanelTitle>Recommended next practice</PanelTitle>
          {recommendations.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="recommendations-empty">
              {summary.studied === 0 ? "Nothing studied yet. Practise in any mode and recommendations appear here." : "Nothing needs attention right now."}
            </p>
          ) : (
            <ol className="divide-y divide-white/[0.06]">
              {recommendations.map((r) => {
                const m = state.byId.get(r.conceptId)!
                return (
                  <li key={r.conceptId} className="space-y-2 py-3 first:pt-0" data-testid="recommendation" data-concept-id={r.conceptId}>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="font-medium">{names.get(r.conceptId) ?? r.conceptId}</span>
                      <LevelBadge level={m.level} />
                      <span className="text-sm text-muted-foreground">{REASON_TEXT[r.reason]}</span>
                    </div>
                    <PracticeLinks targets={targets.get(r.conceptId)} onOpen={onOpen} limit={2} />
                  </li>
                )
              })}
            </ol>
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel className="p-5" data-testid="activity-panel">
          <PanelTitle
            right={
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-sm" style={{ background: GREEN }} aria-hidden />
                  This week
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-sm opacity-55" style={{ background: GREEN }} aria-hidden />
                  Last week
                </span>
              </div>
            }
          >
            Practice by day
          </PanelTitle>
          <GroupedBars
            labels={WEEKDAYS}
            label="Results per weekday, this week and last week"
            series={[
              { name: "This week", color: GREEN, values: data.weekdays.thisWeek },
              { name: "Last week", color: GREEN, values: data.weekdays.lastWeek },
            ]}
          />
        </Panel>

        <Panel className="p-5" data-testid="recent-panel">
          <PanelTitle>Recent activity</PanelTitle>
          {data.recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing yet.</p>
          ) : (
            <ul className="divide-y divide-white/[0.06]">
              {data.recent.map((e, i) => {
                const Icon = SOURCE_ICON[e.source]
                const tone = e.correct === true ? "text-grade-easy" : e.correct === false ? "text-grade-again" : e.score >= 0.75 ? "text-grade-easy" : e.score >= 0.5 ? "text-grade-hard" : "text-grade-again"
                return (
                  <li key={`${e.at}-${i}`} className="flex items-center gap-3 py-2.5" data-testid="recent-row" data-source={e.source}>
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] text-muted-foreground">
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{e.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {SOURCE_LABEL[e.source]} · {timeAgo(e.at, data.now)}
                      </p>
                    </div>
                    <span className={cn("shrink-0 text-sm font-medium", tone)}>{e.detail}</span>
                  </li>
                )
              })}
            </ul>
          )}
        </Panel>
      </div>

      <Panel className="grid grid-cols-2 gap-y-4 p-5 lg:grid-cols-5" data-testid="totals-strip">
        {[
          { icon: CalendarCheck, value: String(data.streak.days), label: "days practised", id: "total-days" },
          { icon: Flame, value: String(data.streak.current), label: `day streak (best ${data.streak.best})`, id: "total-streak" },
          { icon: Activity, value: String(data.events.length), label: "results saved", id: "total-results" },
          { icon: Target, value: pct(data.objectiveAll.mean), label: `graded accuracy, all time (${data.objectiveAll.count})`, id: "total-accuracy" },
          { icon: Brain, value: `${summary.studied}/${summary.total}`, label: "concepts studied", id: "total-studied" },
        ].map(({ icon: Icon, value, label, id }) => (
          <div key={id} className="flex items-center gap-3 px-2 lg:border-l lg:border-white/[0.07] lg:first:border-l-0" data-testid={id}>
            <Icon className="size-7 shrink-0 text-primary" aria-hidden />
            <div className="min-w-0">
              <p className="text-xl leading-tight font-semibold tabular-nums">{value}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </div>
          </div>
        ))}
      </Panel>

      <div>
        <h2 className="mb-3 font-serif text-xl font-semibold">Concepts</h2>
        <ConceptDetails state={state} names={names} targets={targets} onOpen={onOpen} />
      </div>
    </div>
  )
}
