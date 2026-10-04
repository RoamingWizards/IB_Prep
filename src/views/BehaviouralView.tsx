import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Download, Pencil, Plus, Trash2 } from "lucide-react"
import { AnswerEditor, QuestionContext } from "@/components/behavioural/AnswerEditor"
import { selectClass } from "@/components/behavioural/fields"
import { PracticePanel } from "@/components/behavioural/PracticePanel"
import { QuestionForm } from "@/components/behavioural/QuestionForm"
import { GlowButton, Panel, ProgressBar } from "@/components/kit"
import { Badge } from "@/components/ui/badge"
import { useContent } from "@/content/contentContext"
import {
  deleteBehaviouralUserQuestion,
  getAllBehaviouralNotes,
  getBehaviouralSessions,
  getBehaviouralUserQuestions,
  getMeta,
  saveBehaviouralUserQuestion,
  setMeta,
  type BehaviouralNote,
  type BehaviouralSession,
  type BehaviouralUserQuestion,
} from "@/lib/db"
import {
  buildPersonalExport,
  categoriesOf,
  combineQuestions,
  filterQuestions,
  latestOutcomes,
  READINESS_LABEL,
  readinessOf,
  readinessSummary,
  type Question,
  type SourceFilter,
} from "@/lib/behavioural"
import { cn } from "@/lib/utils"

const SELECTION_KEY = "behavioural:selection"
const SOURCES: { id: SourceFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "provided", label: "Provided" },
  { id: "yours", label: "Yours" },
]
const READINESS_CLASS = { ready: "text-grade-easy", "needs-work": "text-grade-hard", "not-practised": "text-muted-foreground" } as const

type FormState = { kind: "new" } | { kind: "edit" } | { kind: "copy" } | null

interface Saved {
  category: string | null
  source: SourceFilter
  questionId: string | null
  tab: "write" | "practise"
}

export function BehaviouralView() {
  const { bank } = useContent()
  const [own, setOwn] = useState<BehaviouralUserQuestion[]>([])
  const [notes, setNotes] = useState<Map<string, BehaviouralNote>>(new Map())
  const [sessions, setSessions] = useState<BehaviouralSession[]>([])
  const [loaded, setLoaded] = useState(false)
  const [category, setCategory] = useState<string | null>(null)
  const [source, setSource] = useState<SourceFilter>("all")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [tab, setTab] = useState<"write" | "practise">("write")
  const [form, setForm] = useState<FormState>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const flushRef = useRef<(() => Promise<void>) | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [q, n, s, saved] = await Promise.all([getBehaviouralUserQuestions(), getAllBehaviouralNotes(), getBehaviouralSessions(), getMeta<Saved>(SELECTION_KEY)])
      if (cancelled) return
      setOwn(q)
      setNotes(new Map(n.map((x) => [x.questionId, x])))
      setSessions(s)
      if (saved && typeof saved === "object") {
        setCategory(saved.category ?? null)
        setSource(saved.source ?? "all")
        setSelectedId(saved.questionId ?? null)
        setTab(saved.tab === "practise" ? "practise" : "write")
      }
      setLoaded(true)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const all = useMemo(() => combineQuestions(bank.behaviouralQuestions, own), [bank.behaviouralQuestions, own])
  const categories = useMemo(() => categoriesOf(all), [all])
  const visible = useMemo(() => filterQuestions(all, category, source), [all, category, source])
  const latest = useMemo(() => latestOutcomes(sessions), [sessions])
  const summary = useMemo(() => readinessSummary(all, sessions), [all, sessions])
  // A saved selection may refer to a question that no longer exists or is filtered out; fall back to the first shown.
  const selected: Question | undefined = all.find((q) => q.id === selectedId && visible.some((v) => v.id === q.id)) ?? visible[0]

  const remember = useCallback((next: Partial<Saved>) => {
    void setMeta(SELECTION_KEY, { category, source, questionId: selectedId, tab, ...next } satisfies Saved)
  }, [category, source, selectedId, tab])

  const choose = (id: string) => {
    setSelectedId(id)
    setForm(null)
    setConfirmDelete(false)
    remember({ questionId: id })
  }

  const onSaved = useCallback((n: BehaviouralNote) => setNotes((prev) => new Map(prev).set(n.questionId, n)), [])
  const onRecorded = useCallback((s: BehaviouralSession) => setSessions((prev) => [s, ...prev]), [])

  async function saveQuestion(q: BehaviouralUserQuestion) {
    const existing = own.find((x) => x.id === q.id)
    const next = { ...q, createdAt: existing?.createdAt ?? q.createdAt }
    await saveBehaviouralUserQuestion(next)
    setOwn((prev) => (existing ? prev.map((x) => (x.id === q.id ? next : x)) : [...prev, next]))
    setCategory(null)
    setSource("all")
    setSelectedId(next.id)
    setTab("write")
    setForm(null)
    remember({ category: null, source: "all", questionId: next.id, tab: "write" })
  }

  async function removeQuestion(id: string) {
    await deleteBehaviouralUserQuestion(id)
    setOwn((prev) => prev.filter((x) => x.id !== id))
    setNotes((prev) => {
      const next = new Map(prev)
      next.delete(id)
      return next
    })
    setConfirmDelete(false)
    setSelectedId(null)
  }

  async function exportAnswers() {
    await flushRef.current?.() // include text typed a moment ago
    const [freshNotes, freshSessions, freshOwn] = await Promise.all([getAllBehaviouralNotes(), getBehaviouralSessions(), getBehaviouralUserQuestions()])
    const doc = buildPersonalExport(combineQuestions(bank.behaviouralQuestions, freshOwn), freshNotes, freshSessions, freshOwn, new Date())
    const blob = new Blob([JSON.stringify(doc, null, 2) + "\n"], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `ib-prep-behavioural-answers-${new Date().toISOString().slice(0, 10)}.json`
    document.body.append(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    setNote(`Exported ${doc.answers.length} ${doc.answers.length === 1 ? "answer" : "answers"}, ${doc.sessions.length} practice ${doc.sessions.length === 1 ? "session" : "sessions"} and ${doc.questions.length} of your own ${doc.questions.length === 1 ? "question" : "questions"}.`)
  }

  if (!loaded) return null
  const status = selected ? readinessOf(selected.id, latest) : "not-practised"

  return (
    <div className="mx-auto w-full max-w-[84rem] space-y-5" data-testid="behavioural">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-semibold">Behavioural</h1>
          <p className="mt-1 text-sm text-muted-foreground">Draft your own answers, then practise them out loud. Your writing is kept apart from the questions.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <GlowButton className="h-10 gap-2 px-4 text-sm" onClick={() => void exportAnswers()} data-testid="export-answers">
            <Download className="size-4" aria-hidden />
            Export my answers
          </GlowButton>
          <GlowButton tone="blue" solid className="h-10 gap-2 px-4 text-sm" onClick={() => (setForm({ kind: "new" }), setConfirmDelete(false))} data-testid="new-question">
            <Plus className="size-4" aria-hidden />
            New question
          </GlowButton>
        </div>
      </div>
      {note && (
        <p role="status" className="text-sm text-muted-foreground" data-testid="export-note">
          {note}
        </p>
      )}

      <Panel className="p-5" data-testid="readiness">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <div>
            <h2 className="text-[0.7rem] font-medium tracking-wider text-muted-foreground uppercase">Behavioural readiness</h2>
            <p className="mt-1 text-2xl font-semibold tabular-nums" data-testid="readiness-headline">
              {summary.ready} of {summary.total} <span className="text-base font-normal text-muted-foreground">ready</span>
            </p>
          </div>
          <p className="text-sm text-muted-foreground tabular-nums" data-testid="readiness-counts">
            <span className="text-grade-easy">{summary.ready} ready</span> · <span className="text-grade-hard">{summary.needsWork} needs work</span> · {summary.notPractised} not practised
          </p>
        </div>
        <div className="mt-3">
          <ProgressBar value={summary.ready} max={Math.max(1, summary.total)} label="Behavioural questions marked ready" />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">From your own practice ratings only. It is separate from technical concept mastery.</p>
      </Panel>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[21rem_minmax(0,1fr)]">
        <Panel className="min-w-0 space-y-4 p-4" data-testid="question-picker">
          <div>
            <label htmlFor="bq-category" className="mb-1.5 block text-sm text-muted-foreground">
              Category
            </label>
            <select
              id="bq-category"
              className={selectClass}
              value={category ?? ""}
              onChange={(e) => {
                setCategory(e.target.value || null)
                remember({ category: e.target.value || null })
              }}
              data-testid="category-select"
            >
              <option value="">All categories ({all.length})</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c} ({all.filter((q) => q.category === c).length})
                </option>
              ))}
            </select>
          </div>
          <div role="radiogroup" aria-label="Show questions" className="flex gap-1" data-testid="source-pills">
            {SOURCES.map((s) => (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={source === s.id}
                data-value={s.id}
                onClick={() => (setSource(s.id), remember({ source: s.id }))}
                onMouseUp={(e) => e.currentTarget.blur()}
                className={cn(
                  "flex-1 rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                  source === s.id && "bg-primary/15 font-medium text-primary shadow-[inset_0_0_0_1px_rgb(var(--accent-rgb)/0.3)]",
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
          {visible.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="no-questions">
              No questions here. {source === "yours" ? "Use New question to write your own." : "Change the category or source."}
            </p>
          ) : (
            <ul className="thin-scroll max-h-[34rem] space-y-1.5 overflow-y-auto pr-1" data-testid="question-list">
              {visible.map((q) => {
                const r = readinessOf(q.id, latest)
                const hasNotes = !!notes.get(q.id) && (notes.get(q.id)!.answer.trim() !== "" || notes.get(q.id)!.bullets.trim() !== "")
                const active = selected?.id === q.id && !form
                return (
                  <li key={q.id}>
                    <button
                      type="button"
                      onClick={() => choose(q.id)}
                      onMouseUp={(e) => e.currentTarget.blur()}
                      aria-current={active ? "true" : undefined}
                      data-testid="question-item"
                      data-question-id={q.id}
                      className={cn(
                        "w-full rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2.5 text-left transition-colors outline-none hover:border-white/20 focus-visible:ring-2 focus-visible:ring-ring",
                        active && "border-primary/40 bg-primary/10 shadow-[inset_0_0_0_1px_rgb(var(--accent-rgb)/0.2)]",
                      )}
                    >
                      <span className="block text-sm font-medium">{q.title}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                        <span>{q.category}</span>
                        {q.firm && <span>· {q.firm}</span>}
                        {q.source === "yours" && <Badge variant="outline">Yours</Badge>}
                        {hasNotes && <span title="You have written notes for this question">· notes</span>}
                        <span className={cn("ml-auto font-medium", READINESS_CLASS[r])} data-testid="item-readiness">
                          {READINESS_LABEL[r]}
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </Panel>

        <div className="min-w-0 space-y-4" data-testid="workspace">
          {form ? (
            <QuestionForm
              key={form.kind + (selected?.id ?? "")}
              initial={form.kind === "new" ? null : (selected ?? null)}
              editing={form.kind === "edit"}
              categories={categories}
              onSave={saveQuestion}
              onCancel={() => setForm(null)}
            />
          ) : selected ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div role="tablist" aria-label="Mode" className="flex gap-1 rounded-xl border border-white/10 bg-black/20 p-1" data-testid="mode-tabs">
                  {(["write", "practise"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      role="tab"
                      aria-selected={tab === t}
                      data-value={t}
                      onClick={() => (setTab(t), remember({ tab: t }))}
                      onMouseUp={(e) => e.currentTarget.blur()}
                      className={cn(
                        "rounded-lg px-4 py-1.5 text-sm text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                        tab === t && "bg-primary/15 font-medium text-primary shadow-[inset_0_0_0_1px_rgb(var(--accent-rgb)/0.3)]",
                      )}
                    >
                      {t === "write" ? "Write" : "Practise"}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className={cn("text-sm font-medium", READINESS_CLASS[status])} data-testid="selected-readiness">
                    {READINESS_LABEL[status]}
                  </span>
                  {selected.source === "yours" ? (
                    <>
                      <GlowButton className="h-9 gap-2 px-3 text-sm" onClick={() => setForm({ kind: "edit" })} data-testid="edit-question">
                        <Pencil className="size-4" aria-hidden />
                        Edit
                      </GlowButton>
                      <GlowButton tone="again" className="h-9 gap-2 px-3 text-sm" onClick={() => setConfirmDelete(true)} data-testid="delete-question">
                        <Trash2 className="size-4" aria-hidden />
                        Delete
                      </GlowButton>
                    </>
                  ) : (
                    <GlowButton className="h-9 px-3 text-sm" onClick={() => setForm({ kind: "copy" })} data-testid="copy-question">
                      Make my own copy
                    </GlowButton>
                  )}
                </div>
              </div>
              {confirmDelete && selected.source === "yours" && (
                <div role="alertdialog" aria-label="Confirm delete" className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-3" data-testid="delete-confirm">
                  <p className="text-sm">Delete this question and the answer and bullets you wrote for it? Practice sessions stay in History.</p>
                  <GlowButton tone="again" className="h-9 px-3 text-sm" onClick={() => void removeQuestion(selected.id)} data-testid="delete-confirm-yes">
                    Delete question
                  </GlowButton>
                  <GlowButton className="h-9 px-3 text-sm" onClick={() => setConfirmDelete(false)}>
                    Keep it
                  </GlowButton>
                </div>
              )}

              {tab === "write" ? (
                <Panel className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]" data-testid="write-tab">
                  <QuestionContext question={selected} />
                  <AnswerEditor key={selected.id} question={selected} initial={notes.get(selected.id)} onSaved={onSaved} flushRef={flushRef} />
                </Panel>
              ) : (
                <PracticePanel key={selected.id} question={selected} note={notes.get(selected.id)} onRecorded={onRecorded} />
              )}
            </>
          ) : (
            <Panel className="p-6">
              <p className="text-muted-foreground">Choose a question to start.</p>
            </Panel>
          )}
        </div>
      </div>
    </div>
  )
}

