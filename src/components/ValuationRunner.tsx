import "@xyflow/react/dist/style.css"
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react"
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  Panel as FlowPanel,
  type Connection,
  type EdgeTypes,
  type NodeChange,
  type NodeTypes,
} from "@xyflow/react"
import { ArrowLeft, ChevronDown, ChevronUp, Maximize, RotateCcw } from "lucide-react"
import { GlowButton, Panel } from "@/components/kit"
import { prefersReducedMotion } from "@/components/kit/motion"
import { ConnectionsPanel, Feedback, SolutionNotes, StepBank, STEP_DRAG_TYPE } from "@/components/ValuationPanels"
import { FloatingEdge } from "@/components/valuation/FloatingEdge"
import { EDGE_COLOR, type EdgeStatus, type FlowEdge } from "@/components/valuation/status"
import { isLight } from "@/lib/theme"
import { useTheme } from "@/lib/themeContext"
import { SlotNode, StageNode, type SlotNodeType, type StageNodeType } from "@/components/valuation/GridNodes"
import { StepNode, type NodeStatus, type StepNodeType } from "@/components/valuation/StepNode"
import type { ValuationStep } from "@/content/types"
import { saveValuationDraft, saveValuationView, submitValuationAttempt, type ValuationAttempt } from "@/lib/db"
import { firstFreeSlot, gridSize, LANE_W, NODE_H, NODE_W, slotAt, slotKey, slotPosition, snapAll, snapToSlot, STAGE_H, toSlotLayout } from "@/lib/slots"
import { edgeKey, gradeValuation, layoutGraph, type LearnerEdge } from "@/lib/valuation"

interface Props {
  initialAttempt: ValuationAttempt
  /** True when this draft already exists in storage (so a reload resumes it). */
  persisted: boolean
  onExit: () => void
  /** Start a new attempt at the same exercise. */
  onRetry: () => void
}

const nodeTypes: NodeTypes = { step: StepNode, slot: SlotNode, stage: StageNode }
const edgeTypes: EdgeTypes = { floating: FloatingEdge }
const SAVE_DELAY_MS = 500
const isGridId = (id: string) => id.startsWith("slot-") || id.startsWith("stage-")

/** Width of the "Stage n" label at the left of each row. */
const STAGE_LABEL_W = 70

function makeNode(step: ValuationStep, position: { x: number; y: number }, status: NodeStatus = "idle"): StepNodeType {
  return { id: step.id, type: "step", position, data: { label: step.label, status } }
}

function makeEdge(from: string, to: string, status: EdgeStatus = "idle"): FlowEdge {
  return {
    id: edgeKey(from, to),
    source: from,
    target: to,
    type: "floating",
    data: { status },
    markerEnd: { type: MarkerType.ArrowClosed, color: EDGE_COLOR[status], width: 18, height: 18 },
  }
}

/**
 * One attempt at a Valuation Builder exercise. Everything shown comes from the attempt's own copy of the
 * exercise, so content updated later never changes an attempt already begun.
 */
export function ValuationRunner(props: Props) {
  return (
    <ReactFlowProvider>
      <Runner {...props} />
    </ReactFlowProvider>
  )
}

function Runner({ initialAttempt, persisted, onExit, onRetry }: Props) {
  const { screenToFlowPosition, fitView } = useReactFlow()
  const { theme } = useTheme()
  const flowMode = isLight(theme) ? "light" : "dark"
  const [attempt, setAttempt] = useState(initialAttempt)
  const exercise = attempt.snapshot
  const steps = useMemo(() => new Map(exercise.steps.map((s) => [s.id, s])), [exercise])
  const submitted = attempt.status === "submitted"
  const grade = attempt.grade

  const [seed] = useState(() => {
    const byId = new Map(initialAttempt.snapshot.steps.map((s) => [s.id, s]))
    // Attempts saved before the slot grid existed have free-form positions: snap them to slots, left to right.
    const entries = Object.entries(initialAttempt.placed)
      .filter(([id]) => byId.has(id))
      .sort(([, a], [, b]) => a.x - b.x || a.y - b.y)
    const snapped = snapAll(entries.map(([id, position]) => ({ id, position })), [])
    return {
      nodes: entries.map(([id]) => makeNode(byId.get(id)!, snapped[id])),
      edges: initialAttempt.edges.map((e) => makeEdge(e.from, e.to)),
    }
  })
  const [nodes, setNodes, onNodesChange] = useNodesState<StepNodeType>(seed.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState<FlowEdge>(seed.edges)

  const [tab, setTab] = useState<"answer" | "solution">(initialAttempt.view?.tab ?? "answer")
  const [graphId, setGraphId] = useState(initialAttempt.view?.graphId ?? initialAttempt.grade?.graphId ?? exercise.solutions[0].id)
  const [showInstructions, setShowInstructions] = useState(true)
  const [confirmReset, setConfirmReset] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState<string | null>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const lock = useRef(false)

  const learnerEdges = useMemo<LearnerEdge[]>(() => edges.map((e) => ({ id: e.id, from: e.source, to: e.target })), [edges])
  const placedIds = useMemo(() => nodes.map((n) => n.id), [nodes])
  const placedSet = useMemo(() => new Set(placedIds), [placedIds])

  // ---- Draft autosave: placements and connections survive a reload ----
  const serialise = useCallback(
    () => ({
      placed: Object.fromEntries(nodes.map((n) => [n.id, { x: Math.round(n.position.x), y: Math.round(n.position.y) }])),
      edges: learnerEdges,
    }),
    [nodes, learnerEdges],
  )
  const latest = useRef({ attempt, snapshot: serialise() })
  useEffect(() => {
    latest.current = { attempt, snapshot: serialise() }
  })
  const timer = useRef(0)
  const savedJson = useRef<string | null>(persisted ? JSON.stringify({ placed: initialAttempt.placed, edges: initialAttempt.edges }) : null)
  const flush = useCallback(() => {
    window.clearTimeout(timer.current)
    const { attempt: a, snapshot } = latest.current
    if (a.status === "submitted") return
    const json = JSON.stringify(snapshot)
    if (json === savedJson.current) return
    // Merely opening an exercise does not create a record; the first placement does.
    if (savedJson.current === null && Object.keys(snapshot.placed).length === 0) return
    savedJson.current = json
    void saveValuationDraft({ ...a, ...snapshot, updatedAt: Date.now() })
  }, [])
  useEffect(() => {
    timer.current = window.setTimeout(flush, SAVE_DELAY_MS)
    return () => window.clearTimeout(timer.current)
  }, [nodes, edges, flush])
  useEffect(() => () => flush(), [flush])

  // ---- Editing the diagram ----
  /** Puts a step into a slot. A step already placed is ignored, so it can never appear twice. */
  const addStep = useCallback(
    (stepId: string, at?: { x: number; y: number }) => {
      const step = steps.get(stepId)
      if (!step || submitted) return
      setNodes((ns) => {
        if (ns.some((n) => n.id === stepId)) return ns
        const occupied = ns.map((n) => slotAt(n.position))
        const taken = new Set(occupied.map(slotKey))
        const slot = at ? snapToSlot(at, taken, occupied) : firstFreeSlot(taken)
        return [...ns, makeNode(step, slotPosition(slot))]
      })
    },
    [steps, submitted, setNodes],
  )

  // A bubble let go between slots, or nudged, settles into the nearest free slot. Never onto another bubble.
  const nodesRef = useRef<StepNodeType[]>([])
  useEffect(() => {
    nodesRef.current = nodes
  })
  const snapNodes = useCallback(
    (ids: string[]) => {
      const idSet = new Set(ids)
      const current = nodesRef.current
      const snapped = snapAll(
        current.filter((n) => idSet.has(n.id)).map((n) => ({ id: n.id, position: n.position })),
        current.filter((n) => !idSet.has(n.id)).map((n) => ({ id: n.id, position: n.position })),
      )
      setNodes((ns) => ns.map((n) => (snapped[n.id] ? { ...n, position: snapped[n.id] } : n)))
    },
    [setNodes],
  )
  const handleNodesChange = useCallback(
    (changes: NodeChange<StepNodeType>[]) => {
      // The slot guides and stage headings are not part of the attempt: ignoring their size and selection changes keeps
      // them from re-triggering state updates (and the draft autosave timer) on every render.
      const own = changes.filter((c) => !("id" in c) || !isGridId(c.id))
      if (own.length === 0) return
      onNodesChange(own)
      const settled = own.flatMap((c) => (c.type === "position" && c.dragging === false && c.position ? [c.id] : []))
      if (settled.length > 0) window.setTimeout(() => snapNodes(settled), 0)
    },
    [onNodesChange, snapNodes],
  )

  const returnStep = useCallback(
    (stepId: string) => {
      if (submitted) return
      setNodes((ns) => ns.filter((n) => n.id !== stepId))
      setEdges((es) => es.filter((e) => e.source !== stepId && e.target !== stepId))
      setMessage(`Returned to the bank: ${steps.get(stepId)?.label ?? stepId}`)
    },
    [submitted, setNodes, setEdges, steps],
  )

  const connect = useCallback(
    (from: string, to: string) => {
      if (submitted || from === to) return
      setEdges((es) => (es.some((e) => e.id === edgeKey(from, to)) ? es : [...es, makeEdge(from, to)]))
      setMessage(`Connected ${steps.get(from)?.label} to ${steps.get(to)?.label}`)
    },
    [submitted, setEdges, steps],
  )

  const removeEdge = useCallback(
    (edgeId: string) => {
      if (submitted) return
      setEdges((es) => es.filter((e) => e.id !== edgeId))
      setMessage("Connection removed")
    },
    [submitted, setEdges],
  )

  const onConnect = useCallback(
    (c: Connection) => {
      if (c.source && c.target) connect(c.source, c.target)
    },
    [connect],
  )
  const isValidConnection = useCallback(
    (c: { source: string; target: string }) => c.source !== c.target && !edges.some((e) => e.source === c.source && e.target === c.target),
    [edges],
  )

  const onDragOver = useCallback((e: DragEvent) => {
    if (e.dataTransfer.types.includes(STEP_DRAG_TYPE)) {
      e.preventDefault()
      e.dataTransfer.dropEffect = "move"
    }
  }, [])
  const onDrop = useCallback(
    (e: DragEvent) => {
      const id = e.dataTransfer.getData(STEP_DRAG_TYPE)
      if (!id) return
      e.preventDefault()
      const p = screenToFlowPosition({ x: e.clientX, y: e.clientY })
      addStep(id, { x: p.x - NODE_W / 2, y: p.y - NODE_H / 2 })
    },
    [screenToFlowPosition, addStep],
  )

  const reset = useCallback(() => {
    setNodes([])
    setEdges([])
    setConfirmReset(false)
    setMessage("")
  }, [setNodes, setEdges])

  const submit = useCallback(async () => {
    if (submitted || lock.current) return
    lock.current = true
    setError(null)
    window.clearTimeout(timer.current)
    try {
      const result = gradeValuation(exercise, placedIds, learnerEdges)
      const outcome = await submitValuationAttempt({ ...attempt, ...serialise() }, result)
      setAttempt(outcome.attempt)
      setTab("answer")
      setGraphId(outcome.attempt.grade?.graphId ?? exercise.solutions[0].id)
      setConfirmReset(false)
    } catch (err) {
      console.error("Could not save the attempt", err)
      setError("Your attempt could not be saved. Try submitting again.")
    } finally {
      lock.current = false
    }
  }, [submitted, exercise, placedIds, learnerEdges, attempt, serialise])

  const changeView = useCallback(
    (next: { tab: "answer" | "solution"; graphId: string }) => {
      setTab(next.tab)
      setGraphId(next.graphId)
      void saveValuationView(attempt.id, next)
    },
    [attempt.id],
  )

  // ---- What the canvas shows ----
  const showSolution = submitted && tab === "solution"
  const solution = exercise.solutions.find((g) => g.id === graphId) ?? exercise.solutions[0]

  const answerNodes = useMemo(
    () =>
      nodes.map((n) => {
        const status: NodeStatus = !grade ? "idle" : grade.distractorIds.includes(n.id) || grade.extraStepIds.includes(n.id) ? "wrong" : "correct"
        return { ...n, data: { ...n.data, status }, draggable: !submitted, selectable: !submitted, deletable: !submitted, connectable: !submitted }
      }),
    [nodes, grade, submitted],
  )
  const answerEdges = useMemo(
    () =>
      edges.map((e) => {
        const status: EdgeStatus = !grade ? "idle" : grade.correctEdgeKeys.includes(e.id) ? "correct" : "wrong"
        return { ...e, data: { status }, markerEnd: { type: MarkerType.ArrowClosed, color: EDGE_COLOR[status], width: 18, height: 18 }, deletable: !submitted, selectable: !submitted }
      }),
    [edges, grade, submitted],
  )
  const solutionNodes = useMemo(() => {
    const pos = toSlotLayout(layoutGraph(solution, STAGE_H, LANE_W, false))
    return solution.steps.flatMap((id) => {
      const step = steps.get(id)
      return step ? [{ ...makeNode(step, pos[id], "expected"), draggable: false, selectable: false, connectable: false }] : []
    })
  }, [solution, steps])
  const solutionEdges = useMemo(
    () => solution.edges.map((e) => ({ ...makeEdge(e.from, e.to, e.optional ? "optional" : "expected"), selectable: false })),
    [solution],
  )

  // The slot grid: stage headings and empty slots. Its size depends only on where steps have been placed,
  // never on the solution, so it gives nothing away before submitting.
  const grid = useMemo(() => {
    const shown = showSolution ? solutionNodes : nodes
    const occupied = shown.map((n) => slotAt(n.position))
    const size = showSolution
      ? { lanes: Math.max(1, ...occupied.map((o) => o.lane + 1)), stages: Math.max(1, ...occupied.map((o) => o.stage + 1)) }
      : gridSize(occupied)
    const list: (SlotNodeType | StageNodeType)[] = []
    for (let stage = 0; stage < size.stages; stage++) {
      list.push({
        id: `stage-${stage}`,
        type: "stage",
        position: { x: -STAGE_LABEL_W - 16, y: stage * STAGE_H + (NODE_H - 24) / 2 },
        data: { label: `Stage ${stage + 1}` },
        width: STAGE_LABEL_W,
        height: 24,
        measured: { width: STAGE_LABEL_W, height: 24 },
        selectable: false,
        draggable: false,
        connectable: false,
        focusable: false,
      })
      for (let lane = 0; lane < size.lanes; lane++) {
        list.push({
          id: `slot-${lane}-${stage}`,
          type: "slot",
          position: slotPosition({ lane, stage }),
          data: {},
          width: NODE_W,
          height: NODE_H,
          measured: { width: NODE_W, height: NODE_H },
          selectable: false,
          draggable: false,
          connectable: false,
          focusable: false,
          zIndex: -1,
        })
      }
    }
    return { nodes: list, lanes: size.lanes, stages: size.stages }
  }, [showSolution, solutionNodes, nodes])

  // Fit view frames the diagram (the placed steps) so labels stay as large as possible; with nothing placed it frames the grid.
  const fit = useCallback(
    (duration = prefersReducedMotion() ? 0 : 300) => {
      // The "Stage n" labels are part of the picture, so keep them in view with the steps.
      const ids = [...(showSolution ? solutionNodes : nodesRef.current).map((n) => ({ id: n.id })), ...grid.nodes.filter((n) => n.type === "stage").map((n) => ({ id: n.id }))]
      void fitView({ padding: 0.15, duration, ...(ids.length > 0 ? { nodes: ids } : {}) })
    },
    [fitView, showSolution, solutionNodes, grid.nodes],
  )

  const flowNodes = useMemo(
    () => [...grid.nodes, ...(showSolution ? solutionNodes : answerNodes)] as StepNodeType[],
    [grid.nodes, showSolution, solutionNodes, answerNodes],
  )

  // When the grid grows (a step placed in the last spare stage or lane) bring all of it back into view.
  const firstGrid = useRef(true)
  useEffect(() => {
    if (firstGrid.current) {
      firstGrid.current = false
      return
    }
    const t = window.setTimeout(() => fit(prefersReducedMotion() ? 0 : 250), 80)
    return () => window.clearTimeout(t)
  }, [grid.lanes, grid.stages, fit])

  const counts = grade
    ? [
        ["Steps correct", `${grade.correctSteps} of ${grade.requiredSteps}`, "stat-steps"],
        ["Steps that do not belong", String(grade.distractorIds.length + grade.extraStepIds.length), "stat-distractors"],
        ["Connections correct", `${grade.correctEdges} of ${grade.requiredEdges}`, "stat-edges"],
        ["Missing connections", String(grade.missingEdgeIds.length), "stat-missing"],
        ["Incorrect connections", String(grade.incorrectEdges.length), "stat-incorrect"],
      ]
    : []

  return (
    <div className="flex h-full min-h-0 flex-col gap-3" data-testid="valuation-runner">
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">
            {exercise.category} · {exercise.subcategory}
          </p>
          <h1 className="font-serif text-2xl font-semibold" data-testid="exercise-title">
            {exercise.title}
          </h1>
        </div>
        <GlowButton className="h-8 gap-1.5 px-3 text-sm" onClick={onExit} onMouseUp={(e) => e.currentTarget.blur()} data-testid="valuation-exit">
          <ArrowLeft className="size-4" aria-hidden />
          All exercises
        </GlowButton>
      </div>

      <Panel className="shrink-0 p-4" data-testid="exercise-brief">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[0.9375rem] leading-relaxed" data-testid="exercise-task">
            <span className="font-medium text-[var(--accent-text)]">Task: </span>
            {exercise.task}
          </p>
          <button
            type="button"
            className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground outline-none hover:bg-white/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            aria-expanded={showInstructions}
            onClick={() => setShowInstructions((s) => !s)}
            data-testid="toggle-instructions"
          >
            {showInstructions ? <ChevronUp className="size-4" aria-hidden /> : <ChevronDown className="size-4" aria-hidden />}
            {showInstructions ? "Hide instructions" : "Show instructions"}
          </button>
        </div>
        {showInstructions && (
          <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <div className="max-w-[80ch] space-y-2 text-sm leading-relaxed text-foreground/90">
              {exercise.instructions.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
            {exercise.assumptions.length > 0 && (
              <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm" data-testid="exercise-assumptions">
                {exercise.assumptions.map((a) => (
                  <div key={a.label} className="contents">
                    <dt className="text-muted-foreground">{a.label}</dt>
                    <dd>{a.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        )}
      </Panel>

      {submitted && grade ? (
        <Panel glow="blue" className="shrink-0 p-4" data-testid="valuation-summary">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="grid flex-1 gap-3 sm:grid-cols-3 xl:grid-cols-5">
              {counts.map(([title, value, id]) => (
                <div key={id}>
                  <p className="text-xs text-muted-foreground">{title}</p>
                  <p className="text-xl font-semibold tabular-nums" data-testid={id}>{value}</p>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <GlowButton
                tone="blue"
                solid
                className="h-9 px-4 text-sm"
                onClick={() => changeView({ tab: showSolution ? "answer" : "solution", graphId })}
                onMouseUp={(e) => e.currentTarget.blur()}
                data-testid="toggle-solution"
              >
                {showSolution ? "Show my diagram" : "Show correct solution"}
              </GlowButton>
              <GlowButton className="h-9 px-4 text-sm" onClick={onRetry} onMouseUp={(e) => e.currentTarget.blur()} data-testid="valuation-retry">
                Try again
              </GlowButton>
            </div>
          </div>
          {showSolution && exercise.solutions.length > 1 && (
            <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label="Accepted solutions" data-testid="solution-choices">
              <span className="text-xs text-muted-foreground">Accepted solutions:</span>
              {exercise.solutions.map((g) => (
                <GlowButton
                  key={g.id}
                  tone={g.id === solution.id ? "blue" : "neutral"}
                  className="h-8 px-3 text-xs"
                  onClick={() => changeView({ tab: "solution", graphId: g.id })}
                  onMouseUp={(e) => e.currentTarget.blur()}
                  data-testid="solution-choice"
                  aria-pressed={g.id === solution.id}
                >
                  {g.title}
                </GlowButton>
              ))}
            </div>
          )}
        </Panel>
      ) : (
        <Panel className="shrink-0 p-3" data-testid="valuation-actions">
          <div className="flex flex-wrap items-center gap-3">
            <GlowButton tone="blue" solid className="h-10 px-5 text-sm" onClick={() => void submit()} onMouseUp={(e) => e.currentTarget.blur()} data-testid="valuation-submit">
              Submit
            </GlowButton>
            <GlowButton
              className="h-10 gap-1.5 px-4 text-sm"
              disabled={nodes.length === 0 && edges.length === 0}
              onClick={() => setConfirmReset(true)}
              onMouseUp={(e) => e.currentTarget.blur()}
              data-testid="valuation-reset"
            >
              <RotateCcw className="size-4" aria-hidden />
              Reset
            </GlowButton>
            <GlowButton className="h-10 gap-1.5 px-4 text-sm" onClick={() => fit()} onMouseUp={(e) => e.currentTarget.blur()} data-testid="fit-view">
              <Maximize className="size-4" aria-hidden />
              Fit view
            </GlowButton>
            <p className="text-sm text-muted-foreground" data-testid="valuation-progress">
              {nodes.length} of {exercise.steps.length} steps placed · {edges.length} {edges.length === 1 ? "connection" : "connections"}
            </p>
          </div>
          {confirmReset && (
            <div role="alertdialog" aria-label="Confirm reset" className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-3" data-testid="reset-confirm">
              <p className="text-sm">
                Clear the canvas? Your {nodes.length} placed {nodes.length === 1 ? "step" : "steps"} and {edges.length} {edges.length === 1 ? "connection" : "connections"} will be lost.
              </p>
              <GlowButton tone="again" className="h-9 px-3 text-sm" onClick={reset} data-testid="reset-confirm-yes">
                Clear canvas
              </GlowButton>
              <GlowButton className="h-9 px-3 text-sm" onClick={() => setConfirmReset(false)} data-testid="reset-confirm-no">
                Keep working
              </GlowButton>
            </div>
          )}
          {error && (
            <p role="alert" className="mt-2 text-sm text-destructive" data-testid="valuation-error">
              {error}
            </p>
          )}
        </Panel>
      )}

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[19rem_minmax(0,1fr)]" data-testid="valuation-workspace">
        <aside
          key={showSolution ? "solution" : submitted ? "review" : "edit"}
          className="thin-scroll panel min-h-0 space-y-6 overflow-y-auto p-4 max-lg:max-h-[24rem]"
          data-testid="valuation-sidebar"
        >
          {!submitted && (
            <>
              <StepBank steps={bankSteps(exercise.steps, attempt.bankOrder)} placed={placedSet} locked={false} onAdd={(id) => addStep(id)} onReturn={returnStep} />
              <ConnectionsPanel steps={steps} placed={placedIds} edges={learnerEdges} locked={false} message={message} onConnect={connect} onRemove={removeEdge} />
            </>
          )}
          {submitted && grade && !showSolution && <Feedback exercise={exercise} grade={grade} />}
          {showSolution && <SolutionNotes exercise={exercise} graph={solution} />}
        </aside>

        <div className="min-h-[26rem] min-w-0" ref={canvasRef} onDragOver={onDragOver} onDrop={onDrop}>
          <div className="vb-canvas" data-testid="valuation-canvas" data-mode={showSolution ? "solution" : submitted ? "review" : "edit"}>
            <ReactFlow
              key={showSolution ? `solution-${solution.id}` : "answer"}
              nodes={flowNodes}
              edges={showSolution ? solutionEdges : answerEdges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              onNodesChange={showSolution ? undefined : handleNodesChange}
              onNodeDragStop={(_, __, dragged) => {
                if (!showSolution && !submitted) snapNodes(dragged.map((n) => n.id))
              }}
              onEdgesChange={showSolution ? undefined : onEdgesChange}
              onConnect={onConnect}
              isValidConnection={isValidConnection}
              connectionRadius={60}
              nodesDraggable={!submitted}
              nodesConnectable={!submitted}
              elementsSelectable={!submitted}
              deleteKeyCode={submitted ? null : ["Backspace", "Delete"]}
              colorMode={flowMode}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              minZoom={0.2}
              maxZoom={1.8}
            >
              <Background variant={BackgroundVariant.Dots} gap={22} size={1.4} color="rgb(var(--text-rgb) / 0.14)" />
              <Controls showInteractive={false} fitViewOptions={{ padding: 0.2 }} />
              {!submitted && (
                <FlowPanel position="top-left" className="vb-caption" data-testid="grid-caption">
                  Each row is a stage. Steps in the same row can run in parallel.
                </FlowPanel>
              )}
            </ReactFlow>
          </div>
        </div>
      </div>
    </div>
  )
}

/** The bank in the order saved with the attempt, so the shuffle happens once and survives a reload. */
function bankSteps(steps: ValuationStep[], order: string[]): ValuationStep[] {
  const byId = new Map(steps.map((s) => [s.id, s]))
  const ordered = order.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []))
  const seen = new Set(ordered.map((s) => s.id))
  return [...ordered, ...steps.filter((s) => !seen.has(s.id))]
}
