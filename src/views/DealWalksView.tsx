import { useCallback, useEffect, useState } from "react"
import { DealWalkRunner } from "@/components/DealWalkRunner"
import { GlowButton, Panel } from "@/components/kit"
import { useContent } from "@/content/contentContext"
import type { Process } from "@/content/types"
import { getMeta, getWalk, getWalks, setMeta, startWalk, type Walk } from "@/lib/db"
import { newWalk, shuffled, walkScore } from "@/lib/walks"

const CURRENT_KEY = "dealWalk:current"
const fmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })

export function DealWalksView() {
  const { bank, choicesById, processesById } = useContent()
  const [walks, setWalks] = useState<Walk[] | null>(null)
  const [current, setCurrent] = useState<Walk | null>(null)
  const [loaded, setLoaded] = useState(false)

  // On opening, return to the walk that was open when the app last closed.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [all, currentId] = await Promise.all([getWalks(), getMeta<string | null>(CURRENT_KEY)])
      const open = typeof currentId === "string" && currentId ? await getWalk(currentId) : undefined
      if (cancelled) return
      setWalks(all)
      // Only a walk still in progress is reopened; a finished one shows as "Last score" in the process list.
      if (open && open.status === "active" && processesById.has(open.processId)) setCurrent(open)
      setLoaded(true)
    })()
    return () => {
      cancelled = true
    }
  }, [processesById])

  const refresh = useCallback(async () => setWalks(await getWalks()), [])

  const open = useCallback((walk: Walk | null) => {
    setCurrent(walk)
    void setMeta(CURRENT_KEY, walk ? walk.sessionId : null)
  }, [])

  const begin = useCallback(
    async (process: Process) => {
      const first = choicesById.get(process.stages[0].choiceId)
      if (!first) return
      const walk = newWalk(process, shuffled(first.options.map((o) => o.id)))
      await startWalk(walk) // also retires an unfinished walk of this process
      await refresh()
      open(walk)
    },
    [choicesById, refresh, open],
  )

  const exit = useCallback(async () => {
    open(null)
    await refresh()
  }, [open, refresh])

  if (!loaded || !walks) return null

  if (current) {
    const process = processesById.get(current.processId)
    if (process) {
      return (
        <DealWalkRunner
          key={current.sessionId}
          process={process}
          initialWalk={current}
          onExit={() => void exit()}
          onRestart={() => void begin(process)}
        />
      )
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6" data-testid="deal-walks">
      <div>
        <h1 className="font-serif text-2xl font-semibold">Deal Walks</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose a process and answer one question at each stage, in order.
        </p>
      </div>

      {bank.processes.length === 0 ? (
        <Panel className="p-6">
          <p className="text-muted-foreground" data-testid="walks-empty">
            No processes yet. Import a content pack that includes processes in Settings → Content.
          </p>
        </Panel>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {bank.processes.map((process) => {
            const mine = walks.filter((w) => w.processId === process.id)
            const active = mine.find((w) => w.status === "active")
            const last = mine.find((w) => w.status === "complete")
            const missing = process.stages.filter((s) => !choicesById.has(s.choiceId)).length
            const answered = active ? walkScore(active, process).answered : 0
            return (
              <Panel key={process.id} className="flex flex-col p-6" data-testid="process-card" data-process-id={process.id}>
                <h2 className="font-serif text-xl font-semibold">{process.title}</h2>
                {process.description && <p className="mt-1.5 text-sm text-muted-foreground">{process.description}</p>}
                <p className="mt-3 text-sm text-muted-foreground" data-testid="process-status">
                  {process.stages.length} {process.stages.length === 1 ? "stage" : "stages"}
                  {active
                    ? ` · In progress: ${answered} of ${process.stages.length} answered`
                    : last
                      ? ` · Last score ${walkScore(last, process).correct} of ${process.stages.length} (${fmt.format(last.completedAt ?? last.updatedAt)})`
                      : ""}
                </p>
                {missing > 0 && (
                  <p className="mt-2 text-sm text-destructive">
                    {missing} {missing === 1 ? "question is" : "questions are"} missing from the content, so this process can't be started.
                  </p>
                )}
                <div className="mt-5 flex flex-wrap gap-3">
                  {active ? (
                    <>
                      <GlowButton tone="blue" solid className="h-10 px-4 text-sm" onClick={() => open(active)} data-testid="process-resume">
                        Resume
                      </GlowButton>
                      <GlowButton className="h-10 px-4 text-sm" disabled={missing > 0} onClick={() => void begin(process)} data-testid="process-restart">
                        Start over
                      </GlowButton>
                    </>
                  ) : (
                    <GlowButton tone="blue" solid className="h-10 px-4 text-sm" disabled={missing > 0} onClick={() => void begin(process)} data-testid="process-start">
                      Start walk
                    </GlowButton>
                  )}
                </div>
              </Panel>
            )
          })}
        </div>
      )}
    </div>
  )
}
