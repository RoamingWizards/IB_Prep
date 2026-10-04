// Behavioural mode logic with no presentation: combining provided and personal questions, readiness, the personal
// export and small text helpers. No browser APIs, so Node can check it. Personal writing never enters this module's
// question objects: a question is content, a note is the learner's own words, and they are joined only by ID.
import type { AnswerFramework, BehaviouralQuestion } from "../content/types.ts"
import type { BehaviouralNote, BehaviouralSession, BehaviouralUserQuestion } from "./db"

export type Outcome = "needs-work" | "ready"
export type Readiness = Outcome | "not-practised"
export const READINESS_LABEL: Record<Readiness, string> = { ready: "Ready", "needs-work": "Needs work", "not-practised": "Not practised" }

/** A question as the screen shows it, whether it came from content or was written by the user. */
export interface Question {
  id: string
  source: "provided" | "yours"
  category: string
  title: string
  prompt: string
  firm?: string
  guidance: string[]
  framework?: AnswerFramework
  checklist: string[]
}

export const STAR_FRAMEWORK: AnswerFramework = {
  name: "STAR",
  steps: [
    { label: "Situation", hint: "Set the scene briefly: who, what, when." },
    { label: "Task", hint: "What you were responsible for and what was at stake." },
    { label: "Action", hint: "What you did, in the first person." },
    { label: "Result", hint: "The outcome, with numbers if you can, and what you learned." },
  ],
}

export const STAR_CHECKLIST = [
  "Opens with a specific situation",
  "Says what I personally was responsible for",
  "Describes what I did, not only what we did",
  "Gives a concrete result",
  "Says what I learned",
  "Fits in about two minutes",
]

export const DEFAULT_USER_CATEGORY = "My questions"

export function fromContent(q: BehaviouralQuestion): Question {
  return { id: q.id, source: "provided", category: q.category, title: q.title, prompt: q.prompt, firm: q.firm, guidance: q.guidance ?? [], framework: q.framework, checklist: q.checklist ?? [] }
}

export function fromUser(q: BehaviouralUserQuestion): Question {
  return { id: q.id, source: "yours", category: q.category, title: q.title, prompt: q.prompt, firm: q.firm, guidance: q.guidance ?? [], framework: q.framework, checklist: q.checklist ?? [] }
}

/** Provided questions first (in content order), then the user's own (oldest first). */
export function combineQuestions(provided: readonly BehaviouralQuestion[], own: readonly BehaviouralUserQuestion[]): Question[] {
  return [...provided.map(fromContent), ...own.map(fromUser)]
}

/** Categories in the order they first appear. */
export function categoriesOf(questions: readonly Question[]): string[] {
  const out: string[] = []
  for (const q of questions) if (!out.includes(q.category)) out.push(q.category)
  return out
}

export type SourceFilter = "all" | "provided" | "yours"

export function filterQuestions(questions: readonly Question[], category: string | null, source: SourceFilter): Question[] {
  return questions.filter((q) => (category === null || q.category === category) && (source === "all" || q.source === source))
}

// ---- Readiness: from practice sessions only, never mixed with technical concept mastery ----

/** The outcome of the most recent session for each question that has one. Ties go to the later record. */
export function latestOutcomes(sessions: readonly BehaviouralSession[]): Map<string, { outcome: Outcome; at: number }> {
  const out = new Map<string, { outcome: Outcome; at: number }>()
  for (const s of sessions) {
    const have = out.get(s.questionId)
    if (!have || s.at >= have.at) out.set(s.questionId, { outcome: s.outcome, at: s.at })
  }
  return out
}

export interface ReadinessSummary {
  total: number
  ready: number
  needsWork: number
  notPractised: number
}

export function readinessSummary(questions: readonly Question[], sessions: readonly BehaviouralSession[]): ReadinessSummary {
  const latest = latestOutcomes(sessions)
  let ready = 0
  let needsWork = 0
  for (const q of questions) {
    const o = latest.get(q.id)?.outcome
    if (o === "ready") ready++
    else if (o === "needs-work") needsWork++
  }
  return { total: questions.length, ready, needsWork, notPractised: questions.length - ready - needsWork }
}

export const readinessOf = (id: string, latest: ReadonlyMap<string, { outcome: Outcome }>): Readiness => latest.get(id)?.outcome ?? "not-practised"

// ---- Text helpers ----

/** Practice bullets as a list: one per non-empty line, with any leading bullet marker removed. */
export function bulletLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-*•–]|\d+[.)])\s*/, "").trim())
    .filter((l) => l.length > 0)
}

export const wordCount = (text: string) => (text.trim() === "" ? 0 : text.trim().split(/\s+/).length)

/** 83_000 -> "1:23". */
export function formatClock(ms: number): string {
  const total = Math.floor(ms / 1000)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`
}

/** Splits a textarea of lines into trimmed non-empty lines (for guidance paragraphs and checklist items). */
export const linesOf = (text: string) => text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)

// ---- Personal export (separate from the content exporter) ----

export const PERSONAL_EXPORT_KIND = "ib-prep-behavioural-personal"

export interface PersonalExport {
  kind: typeof PERSONAL_EXPORT_KIND
  version: 1
  exportedAt: string
  note: string
  /** The user's own questions, including firm-specific prompts. */
  questions: BehaviouralUserQuestion[]
  /** Answers and practice bullets, with the question's title for readability. Keyed by question ID. */
  answers: { questionId: string; questionTitle: string; category: string; answer: string; bullets: string[]; updatedAt: string }[]
  /** Practice sessions with outcome and reflection, oldest first. */
  sessions: { questionId: string; questionTitle: string; category: string; practisedAt: string; durationSeconds: number | null; outcome: Outcome; reflection: string; checklist: { checked: number; total: number } | null }[]
}

/** The learner's own writing, outcomes and reflections as one document. Contains no provided question content except titles. */
export function buildPersonalExport(
  questions: readonly Question[],
  notes: readonly BehaviouralNote[],
  sessions: readonly BehaviouralSession[],
  own: readonly BehaviouralUserQuestion[],
  exportedAt: Date,
): PersonalExport {
  const byId = new Map(questions.map((q) => [q.id, q]))
  return {
    kind: PERSONAL_EXPORT_KIND,
    version: 1,
    exportedAt: exportedAt.toISOString(),
    note: "Personal behavioural answers, bullets, reflections and your own questions. This is not a content pack and cannot be imported as one.",
    questions: [...own],
    answers: notes
      .filter((n) => n.answer.trim() !== "" || n.bullets.trim() !== "")
      .map((n) => ({
        questionId: n.questionId,
        questionTitle: byId.get(n.questionId)?.title ?? n.questionId,
        category: byId.get(n.questionId)?.category ?? "",
        answer: n.answer,
        bullets: bulletLines(n.bullets),
        updatedAt: new Date(n.updatedAt).toISOString(),
      }))
      .sort((a, b) => a.questionId.localeCompare(b.questionId)),
    sessions: [...sessions]
      .sort((a, b) => a.at - b.at)
      .map((s) => ({
        questionId: s.questionId,
        questionTitle: s.questionTitle,
        category: s.category,
        practisedAt: new Date(s.at).toISOString(),
        durationSeconds: s.durationMs === null ? null : Math.round(s.durationMs / 1000),
        outcome: s.outcome,
        reflection: s.reflection,
        checklist: s.checklist,
      })),
  }
}
