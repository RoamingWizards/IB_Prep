import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react"
import { Panel } from "@/components/kit"
import { fieldClass } from "@/components/behavioural/fields"
import { saveBehaviouralNote, type BehaviouralNote } from "@/lib/db"
import { bulletLines, wordCount, type Question } from "@/lib/behavioural"

const SAVE_DELAY_MS = 600
type Status = "idle" | "unsaved" | "saving" | "saved" | "error"
const clock = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })

export function QuestionContext({ question }: { question: Question }) {
  return (
    <div className="space-y-4" data-testid="question-context">
      <div>
        <p className="text-sm text-muted-foreground">
          {question.category}
          {question.firm ? ` · ${question.firm}` : ""}
        </p>
        <h2 className="mt-1 font-serif text-2xl leading-snug font-semibold" data-testid="question-prompt">
          {question.prompt}
        </h2>
      </div>
      {question.guidance.length > 0 && (
        <div className="space-y-2 text-sm leading-relaxed text-foreground/90" data-testid="question-guidance">
          {question.guidance.map((g, i) => (
            <p key={i}>{g}</p>
          ))}
        </div>
      )}
      {question.framework && (
        <Panel inset className="p-4" data-testid="question-framework">
          <h3 className="text-sm font-medium">{question.framework.name}</h3>
          <ol className="mt-2 space-y-2 text-sm">
            {question.framework.steps.map((s, i) => (
              <li key={s.label} className="flex gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-medium text-primary">{i + 1}</span>
                <span>
                  <span className="font-medium">{s.label}.</span> <span className="text-muted-foreground">{s.hint}</span>
                </span>
              </li>
            ))}
          </ol>
        </Panel>
      )}
    </div>
  )
}

interface Props {
  question: Question
  /** What is saved for this question already, if anything. */
  initial: BehaviouralNote | undefined
  onSaved: (note: BehaviouralNote) => void
  /** Filled with a function that saves any pending text now, so an export can include what was just typed. */
  flushRef?: MutableRefObject<(() => Promise<void>) | null>
}

/**
 * The learner's own answer and practice bullets. Both autosave shortly after typing stops, on leaving a box and on
 * leaving the screen, and come back after a reload. A visible status always says whether the latest text is safe.
 */
export function AnswerEditor({ question, initial, onSaved, flushRef }: Props) {
  const [answer, setAnswer] = useState(initial?.answer ?? "")
  const [bullets, setBullets] = useState(initial?.bullets ?? "")
  const [status, setStatus] = useState<Status>(initial ? "saved" : "idle")
  const [savedAt, setSavedAt] = useState<number | null>(initial?.updatedAt ?? null)
  const latest = useRef({ answer, bullets })
  const saved = useRef({ answer: initial?.answer ?? "", bullets: initial?.bullets ?? "" })
  const timer = useRef(0)
  const saving = useRef(false)
  const hasStored = useRef(!!initial)
  const pending = useRef(false)

  const flush = useCallback(async () => {
    window.clearTimeout(timer.current)
    const { answer: a, bullets: b } = latest.current
    if (a === saved.current.answer && b === saved.current.bullets) {
      // The text is back to what is stored (for example after undoing an edit): nothing to write.
      setStatus((prev) => (prev === "unsaved" ? (hasStored.current ? "saved" : "idle") : prev))
      return
    }
    if (saving.current) {
      pending.current = true // saved again as soon as the write in progress finishes
      return
    }
    saving.current = true
    setStatus("saving")
    try {
      const note: BehaviouralNote = { questionId: question.id, answer: a, bullets: b, updatedAt: Date.now() }
      await saveBehaviouralNote(note)
      saved.current = { answer: a, bullets: b }
      hasStored.current = true
      setSavedAt(note.updatedAt)
      onSaved(note)
      setStatus(latest.current.answer === a && latest.current.bullets === b ? "saved" : "unsaved")
    } catch (err) {
      console.error("Could not save your answer", err)
      setStatus("error")
    } finally {
      saving.current = false
      if (pending.current) {
        pending.current = false
        void flush()
      }
    }
  }, [question.id, onSaved])

  useEffect(() => {
    if (!flushRef) return
    flushRef.current = async () => {
      await flush()
      while (saving.current) await new Promise((r) => window.setTimeout(r, 20))
    }
    return () => {
      flushRef.current = null
    }
  }, [flush, flushRef])

  function change(next: { answer?: string; bullets?: string }) {
    if (next.answer !== undefined) setAnswer(next.answer)
    if (next.bullets !== undefined) setBullets(next.bullets)
    latest.current = { answer: next.answer ?? latest.current.answer, bullets: next.bullets ?? latest.current.bullets }
    setStatus("unsaved")
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => void flush(), SAVE_DELAY_MS)
  }

  useEffect(() => {
    const onHide = () => void flush()
    window.addEventListener("pagehide", onHide)
    return () => {
      window.removeEventListener("pagehide", onHide)
      void flush() // leaving the question or the screen keeps the text
    }
  }, [flush])

  const statusText =
    status === "saving"
      ? "Saving…"
      : status === "unsaved"
        ? "Unsaved changes"
        : status === "error"
          ? "Could not save. Your text is still here."
          : status === "saved" && savedAt
            ? `Saved at ${clock.format(savedAt)}`
            : "Nothing written yet"

  return (
    <div className="space-y-4" data-testid="answer-editor">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Your writing</h3>
        <p
          role="status"
          aria-live="polite"
          className={status === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"}
          data-testid="save-status"
          data-status={status}
        >
          {statusText}
          {status === "error" && (
            <button type="button" className="ml-2 underline" onClick={() => void flush()} data-testid="save-retry">
              Retry
            </button>
          )}
        </p>
      </div>
      <div>
        <label htmlFor="bq-bullets" className="mb-1.5 block text-sm text-muted-foreground">
          Practice bullet points <span className="text-xs">(one per line; what you will say, in short)</span>
        </label>
        <textarea
          id="bq-bullets"
          className={fieldClass}
          rows={6}
          value={bullets}
          onChange={(e) => change({ bullets: e.target.value })}
          onBlur={() => void flush()}
          placeholder={"- Opening line\n- Key example\n- Result and link to the role"}
          data-testid="bullets-input"
        />
        <p className="mt-1 text-xs text-muted-foreground tabular-nums">{bulletLines(bullets).length} bullets</p>
      </div>
      <div>
        <label htmlFor="bq-answer" className="mb-1.5 block text-sm text-muted-foreground">
          Your answer
        </label>
        <textarea
          id="bq-answer"
          className={fieldClass}
          rows={12}
          value={answer}
          onChange={(e) => change({ answer: e.target.value })}
          onBlur={() => void flush()}
          placeholder="Write the answer as you would say it."
          data-testid="answer-input"
        />
        <p className="mt-1 text-xs text-muted-foreground tabular-nums" data-testid="word-count">
          {wordCount(answer)} words · about {Math.max(0, Math.round(wordCount(answer) / 2.5))} seconds spoken
        </p>
      </div>
      {question.checklist.length > 0 && (
        <details className="text-sm" data-testid="editor-checklist">
          <summary className="cursor-pointer text-muted-foreground select-none">Self-review checklist ({question.checklist.length})</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-foreground/90">
            {question.checklist.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
