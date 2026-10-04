import { useState } from "react"
import { Check, Link2, Trash2, X } from "lucide-react"
import { GlowButton } from "@/components/kit"
import type { ValuationExercise, ValuationGraph, ValuationStep } from "@/content/types"
import { layoutGraph, type EdgeIssue, type LearnerEdge, type ValuationGrade } from "@/lib/valuation"

export const STEP_DRAG_TYPE = "application/x-valuation-step"

const selectClass =
  "h-10 w-full rounded-xl border border-white/12 bg-black/20 px-3 text-sm outline-none transition-colors hover:border-white/25 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"

const heading = "text-sm font-medium"

/** The bank of steps. Each can be dragged onto the canvas or added with its button. */
export function StepBank({
  steps,
  placed,
  locked,
  onAdd,
  onReturn,
}: {
  steps: ValuationStep[]
  placed: ReadonlySet<string>
  locked: boolean
  onAdd: (stepId: string) => void
  onReturn: (stepId: string) => void
}) {
  return (
    <section aria-labelledby="bank-heading">
      <h2 id="bank-heading" className={heading}>
        Steps <span className="font-normal text-muted-foreground" data-testid="bank-count">({placed.size} of {steps.length} placed)</span>
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">Drag a step onto the canvas, or use its Add button. Some steps do not belong.</p>
      <ul className="mt-3 space-y-2" data-testid="step-bank">
        {steps.map((step) => {
          const isPlaced = placed.has(step.id)
          return (
            <li
              key={step.id}
              className="vb-bank-item flex items-start gap-2 p-2.5 pl-3"
              data-testid="bank-item"
              data-step-id={step.id}
              data-placed={isPlaced}
              draggable={!isPlaced && !locked}
              onDragStart={(e) => {
                e.dataTransfer.setData(STEP_DRAG_TYPE, step.id)
                e.dataTransfer.setData("text/plain", step.label)
                e.dataTransfer.effectAllowed = "move"
              }}
            >
              <div className="min-w-0 flex-1 text-sm leading-snug">
                <p>{step.label}</p>
                {step.detail && <p className="mt-0.5 text-xs text-muted-foreground">{step.detail}</p>}
              </div>
              {isPlaced ? (
                <GlowButton
                  className="h-8 shrink-0 px-2.5 text-xs"
                  disabled={locked}
                  onClick={() => onReturn(step.id)}
                  aria-label={`Return to the bank: ${step.label}`}
                  data-testid="bank-return"
                >
                  Return
                </GlowButton>
              ) : (
                <GlowButton
                  tone="blue"
                  className="h-8 shrink-0 px-2.5 text-xs"
                  disabled={locked}
                  onClick={() => onAdd(step.id)}
                  aria-label={`Add to the canvas: ${step.label}`}
                  data-testid="bank-add"
                >
                  Add
                </GlowButton>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** Keyboard-accessible way to draw and remove connections. */
export function ConnectionsPanel({
  steps,
  placed,
  edges,
  locked,
  message,
  onConnect,
  onRemove,
}: {
  steps: Map<string, ValuationStep>
  placed: string[]
  edges: LearnerEdge[]
  locked: boolean
  message: string
  onConnect: (from: string, to: string) => void
  onRemove: (edgeId: string) => void
}) {
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const label = (id: string) => steps.get(id)?.label ?? id
  const exists = from !== "" && to !== "" && edges.some((e) => e.from === from && e.to === to)
  const canConnect = !locked && from !== "" && to !== "" && from !== to && !exists

  return (
    <section aria-labelledby="connections-heading">
      <h2 id="connections-heading" className={heading}>
        Connections <span className="font-normal text-muted-foreground" data-testid="connection-count">({edges.length})</span>
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        An arrow runs from a step to the step that depends on it. Draw one by dragging from a bubble's right dot to another bubble, or choose below.
      </p>
      <div className="mt-3 space-y-2">
        <label className="block text-xs text-muted-foreground" htmlFor="vb-from">Done first</label>
        <select id="vb-from" className={selectClass} value={from} disabled={locked || placed.length < 2} onChange={(e) => setFrom(e.target.value)} data-testid="connect-from">
          <option value="">Choose a step</option>
          {placed.map((id) => (
            <option key={id} value={id}>{label(id)}</option>
          ))}
        </select>
        <label className="block text-xs text-muted-foreground" htmlFor="vb-to">Depends on it</label>
        <select id="vb-to" className={selectClass} value={to} disabled={locked || placed.length < 2} onChange={(e) => setTo(e.target.value)} data-testid="connect-to">
          <option value="">Choose a step</option>
          {placed.map((id) => (
            <option key={id} value={id}>{label(id)}</option>
          ))}
        </select>
        <GlowButton
          tone="blue"
          className="h-9 w-full gap-1.5 text-sm"
          disabled={!canConnect}
          onClick={() => {
            onConnect(from, to)
            setTo("")
          }}
          data-testid="connect-button"
        >
          <Link2 className="size-4" aria-hidden />
          Connect
        </GlowButton>
        <p role="status" aria-live="polite" className="min-h-4 text-xs text-muted-foreground" data-testid="connect-message">
          {exists ? "That connection already exists." : from !== "" && from === to ? "Choose two different steps." : message}
        </p>
      </div>
      {edges.length > 0 && (
        <ul className="mt-2 space-y-1.5" data-testid="connection-list">
          {edges.map((e) => (
            <li key={e.id} className="flex items-start gap-2 text-xs leading-snug" data-testid="connection-item">
              <span className="min-w-0 flex-1">
                {label(e.from)} <span className="text-muted-foreground">→</span> {label(e.to)}
              </span>
              <button
                type="button"
                className="shrink-0 rounded-md p-1 text-muted-foreground outline-none hover:bg-white/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
                disabled={locked}
                onClick={() => onRemove(e.id)}
                aria-label={`Remove connection from ${label(e.from)} to ${label(e.to)}`}
                data-testid="connection-remove"
              >
                <Trash2 className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

const ISSUE_TEXT: Record<EdgeIssue, string> = {
  reversed: "This dependency runs the other way.",
  unsupported: "These steps do not depend on each other directly.",
  "not-in-solution": "This involves a step that is not part of the solution.",
}

function FeedbackSection({ title, count, testId, children }: { title: string; count: number; testId: string; children: React.ReactNode }) {
  if (count === 0) return null
  return (
    <section data-testid={testId}>
      <h3 className={heading}>
        {title} <span className="font-normal text-muted-foreground">({count})</span>
      </h3>
      <ul className="mt-2 space-y-2 text-xs leading-snug">{children}</ul>
    </section>
  )
}

/** What was missing, what did not belong and which connections were wrong. */
export function Feedback({ exercise, grade }: { exercise: ValuationExercise; grade: ValuationGrade }) {
  const steps = new Map(exercise.steps.map((s) => [s.id, s]))
  const graph = exercise.solutions.find((g) => g.id === grade.graphId)!
  const edgeById = new Map(graph.edges.map((e) => [e.id, e]))
  const label = (id: string) => steps.get(id)?.label ?? id
  return (
    <div className="space-y-5" data-testid="valuation-feedback">
      {grade.perfect ? (
        <p className="flex items-start gap-2 text-sm text-grade-easy" data-testid="feedback-perfect">
          <Check className="mt-0.5 size-4 shrink-0" aria-hidden />
          Your process matches an accepted solution: {graph.title}.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Compared with the closest accepted solution: <span className="text-foreground">{graph.title}</span>.
        </p>
      )}
      <FeedbackSection title="Missing steps" count={grade.missingStepIds.length} testId="feedback-missing-steps">
        {grade.missingStepIds.map((id) => (
          <li key={id}>
            <span className="font-medium">{label(id)}</span>
            <span className="block text-muted-foreground">{steps.get(id)?.explanation}</span>
          </li>
        ))}
      </FeedbackSection>
      <FeedbackSection title="Steps that do not belong" count={grade.distractorIds.length} testId="feedback-distractors">
        {grade.distractorIds.map((id) => (
          <li key={id}>
            <span className="flex items-start gap-1.5 font-medium"><X className="mt-0.5 size-3.5 shrink-0 text-grade-again" aria-hidden />{label(id)}</span>
            <span className="block text-muted-foreground">{steps.get(id)?.explanation}</span>
          </li>
        ))}
      </FeedbackSection>
      <FeedbackSection title="Not part of this solution" count={grade.extraStepIds.length} testId="feedback-extra">
        {grade.extraStepIds.map((id) => (
          <li key={id}>
            <span className="font-medium">{label(id)}</span>
            <span className="block text-muted-foreground">This step belongs to a different accepted solution. Use one approach, not both.</span>
          </li>
        ))}
      </FeedbackSection>
      <FeedbackSection title="Missing connections" count={grade.missingEdgeIds.length} testId="feedback-missing-edges">
        {grade.missingEdgeIds.map((id) => {
          const e = edgeById.get(id)!
          return (
            <li key={id}>
              <span className="font-medium">{label(e.from)} → {label(e.to)}</span>
              <span className="block text-muted-foreground">{e.explanation}</span>
            </li>
          )
        })}
      </FeedbackSection>
      <FeedbackSection title="Incorrect connections" count={grade.incorrectEdges.length} testId="feedback-incorrect-edges">
        {grade.incorrectEdges.map((e) => (
          <li key={e.id}>
            <span className="flex items-start gap-1.5 font-medium"><X className="mt-0.5 size-3.5 shrink-0 text-grade-again" aria-hidden />{label(e.from)} → {label(e.to)}</span>
            <span className="block text-muted-foreground">{ISSUE_TEXT[e.reason]}</span>
          </li>
        ))}
      </FeedbackSection>
    </div>
  )
}

/** The expected process, in dependency order, with the reason for every step and connection. */
export function SolutionNotes({ exercise, graph }: { exercise: ValuationExercise; graph: ValuationGraph }) {
  const steps = new Map(exercise.steps.map((s) => [s.id, s]))
  const label = (id: string) => steps.get(id)?.label ?? id
  const position = layoutGraph(graph)
  const ordered = [...graph.steps].sort((a, b) => position[a].x - position[b].x || position[a].y - position[b].y)
  return (
    <div className="space-y-5" data-testid="solution-notes">
      <section>
        <h3 className={heading}>Steps <span className="font-normal text-muted-foreground">({graph.steps.length})</span></h3>
        <ol className="mt-2 space-y-2 text-xs leading-snug">
          {ordered.map((id) => (
            <li key={id}>
              <span className="font-medium">{label(id)}</span>
              <span className="block text-muted-foreground">{steps.get(id)?.explanation}</span>
            </li>
          ))}
        </ol>
      </section>
      <section>
        <h3 className={heading}>Connections <span className="font-normal text-muted-foreground">({graph.edges.length})</span></h3>
        <ul className="mt-2 space-y-2 text-xs leading-snug">
          {graph.edges.map((e) => (
            <li key={e.id} data-testid="solution-edge">
              <span className="font-medium">{label(e.from)} → {label(e.to)}</span>
              {e.optional && <span className="ml-1.5 text-muted-foreground">(optional)</span>}
              <span className="block text-muted-foreground">{e.explanation}</span>
              {e.alternatives?.map((a) => (
                <span key={`${a.from}>${a.to}`} className="block text-muted-foreground">Also accepted: {label(a.from)} → {label(a.to)}</span>
              ))}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
