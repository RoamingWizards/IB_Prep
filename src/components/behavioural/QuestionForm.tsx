import { useId, useState } from "react"
import { GlowButton, Panel } from "@/components/kit"
import { fieldClass, selectClass } from "@/components/behavioural/fields"
import type { BehaviouralUserQuestion } from "@/lib/db"
import { DEFAULT_USER_CATEGORY, linesOf, STAR_CHECKLIST, STAR_FRAMEWORK, type Question } from "@/lib/behavioural"

interface Props {
  /** The question being edited, or a copy of a provided one to start from, or null for a blank form. */
  initial: Question | null
  /** True when `initial` is the user's own question, so saving updates it rather than creating a new one. */
  editing: boolean
  categories: string[]
  onSave: (question: BehaviouralUserQuestion) => Promise<void>
  onCancel: () => void
}

/** Create or edit one of the user's own questions, including firm-specific prompts. Provided questions are never edited. */
export function QuestionForm({ initial, editing, categories, onSave, onCancel }: Props) {
  const id = useId()
  const [title, setTitle] = useState(initial?.title ?? "")
  const [prompt, setPrompt] = useState(initial?.prompt ?? "")
  const [category, setCategory] = useState(initial?.category ?? DEFAULT_USER_CATEGORY)
  const [firm, setFirm] = useState(initial?.firm ?? "")
  const [useStar, setUseStar] = useState(initial?.framework?.name === "STAR")
  const [guidance, setGuidance] = useState((initial?.guidance ?? []).join("\n"))
  const [checklist, setChecklist] = useState((initial?.checklist ?? []).join("\n"))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    if (title.trim() === "") return setError("Give the question a short title.")
    if (prompt.trim() === "") return setError("Write the question itself.")
    setBusy(true)
    setError(null)
    const now = Date.now()
    const list = linesOf(checklist)
    const paragraphs = linesOf(guidance)
    const base: BehaviouralUserQuestion = {
      id: editing && initial ? initial.id : `bu-${crypto.randomUUID()}`,
      category: category.trim() || DEFAULT_USER_CATEGORY,
      title: title.trim(),
      prompt: prompt.trim(),
      createdAt: now,
      updatedAt: now,
    }
    if (firm.trim()) base.firm = firm.trim()
    if (paragraphs.length > 0) base.guidance = paragraphs
    if (useStar) base.framework = STAR_FRAMEWORK
    else if (initial?.framework && initial.framework.name !== "STAR") base.framework = initial.framework // keep a copied framework
    if (list.length > 0) base.checklist = list
    else if (useStar) base.checklist = STAR_CHECKLIST
    try {
      await onSave(base)
    } catch (err) {
      console.error("Could not save the question", err)
      setError("The question could not be saved. Try again.")
      setBusy(false)
    }
  }

  return (
    <Panel className="p-6" data-testid="question-form">
      <h2 className="font-serif text-xl font-semibold">{editing ? "Edit your question" : initial ? "Your own copy" : "New question"}</h2>
      <p className="mt-1 text-sm text-muted-foreground">Your questions are kept with your own answers and are never changed by content imports.</p>
      <form className="mt-5 space-y-4" onSubmit={(e) => void submit(e)}>
        <div>
          <label htmlFor={`${id}-title`} className="mb-1.5 block text-sm text-muted-foreground">
            Title
          </label>
          <input id={`${id}-title`} className={selectClass} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="For example: Why Goldman Sachs?" data-testid="form-title" />
        </div>
        <div>
          <label htmlFor={`${id}-prompt`} className="mb-1.5 block text-sm text-muted-foreground">
            Question
          </label>
          <textarea id={`${id}-prompt`} className={fieldClass} rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} maxLength={1000} placeholder="The question as the interviewer would ask it" data-testid="form-prompt" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={`${id}-category`} className="mb-1.5 block text-sm text-muted-foreground">
              Category
            </label>
            <input id={`${id}-category`} className={selectClass} list={`${id}-cats`} value={category} onChange={(e) => setCategory(e.target.value)} maxLength={80} data-testid="form-category" />
            <datalist id={`${id}-cats`}>
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <div>
            <label htmlFor={`${id}-firm`} className="mb-1.5 block text-sm text-muted-foreground">
              Firm (optional)
            </label>
            <input id={`${id}-firm`} className={selectClass} value={firm} onChange={(e) => setFirm(e.target.value)} maxLength={80} placeholder="For a firm-specific prompt" data-testid="form-firm" />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={useStar} onChange={(e) => setUseStar(e.target.checked)} className="size-4 accent-[var(--primary)]" data-testid="form-star" />
          Use the STAR framework (Situation, Task, Action, Result)
        </label>
        <div>
          <label htmlFor={`${id}-guidance`} className="mb-1.5 block text-sm text-muted-foreground">
            Guidance (optional, one paragraph per line)
          </label>
          <textarea id={`${id}-guidance`} className={fieldClass} rows={3} value={guidance} onChange={(e) => setGuidance(e.target.value)} data-testid="form-guidance" />
        </div>
        <div>
          <label htmlFor={`${id}-checklist`} className="mb-1.5 block text-sm text-muted-foreground">
            Self-review checklist (optional, one item per line{useStar ? "; the STAR checklist is used if left empty" : ""})
          </label>
          <textarea id={`${id}-checklist`} className={fieldClass} rows={4} value={checklist} onChange={(e) => setChecklist(e.target.value)} data-testid="form-checklist" />
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive" data-testid="form-error">
            {error}
          </p>
        )}
        <div className="flex gap-3">
          <GlowButton type="submit" tone="blue" solid className="h-10 px-5 text-sm" disabled={busy} data-testid="form-save">
            {editing ? "Save changes" : "Save question"}
          </GlowButton>
          <GlowButton className="h-10 px-4 text-sm" onClick={onCancel} data-testid="form-cancel">
            Cancel
          </GlowButton>
        </div>
      </form>
    </Panel>
  )
}
