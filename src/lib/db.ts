// User progress lives in IndexedDB, separate from the read-only JSON content.
// Records reference content only by stable exercise ID.
import { openDB, type DBSchema, type IDBPDatabase } from "idb"
import type { ExerciseKind, ThreeStatementExercise, ValuationExercise } from "@/content/types"
import type { StatementGrade } from "./threeStatements"
import type { ValuationGrade } from "./valuation"
import type { Mode, Result, SessionQuestion, Selection } from "./quickMath"

export type Rating = "again" | "hard" | "good" | "easy"
export const RATINGS: Rating[] = ["again", "hard", "good", "easy"]

export interface CardState {
  exerciseId: string
  reps: number // successful reviews in a row
  lapses: number // total "again" ratings
  ease: number
  intervalDays: number
  due: number // epoch ms
  lastRating: Rating
  lastReviewed: number
}

export interface Attempt {
  id?: number
  exerciseId: string
  kind: ExerciseKind
  rating: Rating
  sessionId: string
  at: number
}

export interface Session {
  id: string
  kind: ExerciseKind
  startedAt: number
  lastActivity: number
  counts: Record<Rating, number>
}

/** The result of one submitted Deal Walk stage, kept inside the walk so a reload shows it again. */
export interface StageResult {
  selectedOptionId: string
  correct: boolean
  at: number
}

/** A Deal Walk in progress or finished. One record per walk; `sessionId` is its session ID. */
export interface Walk {
  sessionId: string
  processId: string
  startedAt: number
  updatedAt: number
  stageIndex: number // the stage being shown (it may already be submitted, awaiting "Next")
  order: Record<string, string[]> // stage ID -> option IDs in the order shown; shuffled once per stage
  results: Record<string, StageResult> // stage ID -> submitted result
  status: "active" | "complete" | "abandoned"
  completedAt?: number
}

/** One objective (multiple-choice) result. Kept apart from flashcard `Attempt` ratings. */
export interface ChoiceAttempt {
  id?: number
  sessionId: string
  processId: string
  stageId: string
  choiceId: string
  conceptIds: string[]
  selectedOptionId: string
  correct: boolean
  at: number
}

/**
 * One attempt at a Three Statements exercise. `snapshot` is a copy of the exercise as it was when the
 * attempt began, so later content updates never change an attempt already started or submitted.
 */
export interface StatementAttempt {
  id: string
  exerciseId: string
  startedAt: number
  updatedAt: number
  snapshot: ThreeStatementExercise
  entries: Record<string, string> // row ID -> text as typed
  status: "draft" | "submitted"
  submittedAt?: number
  grade?: StatementGrade
  solution?: { shown: boolean; step: number } // where the learner was in the worked solution
}

/**
 * One attempt at a Valuation Builder exercise. `snapshot` is a copy of the exercise as it was when the
 * attempt began, so later content updates never change an attempt already started or submitted.
 */
export interface ValuationAttempt {
  id: string
  exerciseId: string
  startedAt: number
  updatedAt: number
  snapshot: ValuationExercise
  bankOrder: string[] // step IDs in the order the bank shows them; shuffled once per attempt
  placed: Record<string, { x: number; y: number }> // step ID -> position on the canvas (never graded)
  edges: { id: string; from: string; to: string }[] // the learner's directed connections
  status: "draft" | "submitted"
  submittedAt?: number
  grade?: ValuationGrade
  view?: { tab: "answer" | "solution"; graphId?: string } // what the learner was looking at after submitting
}

/**
 * A Quick Maths session. `questions` is a full copy of every question, generated values and answers included,
 * so a reload or a later content import never changes a session already begun.
 */
export interface QuickMathSession {
  id: string
  startedAt: number
  updatedAt: number
  mode: Mode
  selection: Selection
  requested: number // the session length asked for; `questions.length` may be smaller if fewer were available
  questions: SessionQuestion[]
  index: number // the question being shown (it may already be answered, awaiting "Next")
  draft: string // the unsent text in the answer box for the current question
  elapsedMs: number // response time so far on the current question, counting only while the app is visible
  answers: Record<string, Result> // question key -> submitted result
  status: "active" | "complete" | "abandoned"
  completedAt?: number
}

/** One objective Quick Maths result. Kept apart from flashcard `Attempt` ratings. One per answered question. */
export interface QuickMathResult {
  id?: number
  sessionId: string
  questionKey: string
  questionId: string // "qm-…" for authored questions, "gen-…" for generated ones
  source: "generated" | "authored"
  category: string
  subcategory: string
  difficulty: string
  conceptIds: string[]
  mode: Mode
  entered: number
  answer: number
  correct: boolean
  responseMs: number | null
  at: number
}

interface ProgressDB extends DBSchema {
  cardStates: { key: string; value: CardState }
  attempts: {
    key: number
    value: Attempt
    indexes: { by_session: string; by_at: number }
  }
  sessions: { key: string; value: Session; indexes: { by_started: number } }
  meta: { key: string; value: unknown }
  walks: {
    key: string
    value: Walk
    indexes: { by_process: string; by_started: number }
  }
  choiceAttempts: {
    key: number
    value: ChoiceAttempt
    indexes: { by_at: number; by_session_stage: [string, string] }
  }
  statementAttempts: {
    key: string
    value: StatementAttempt
    indexes: { by_exercise: string; by_started: number }
  }
  valuationAttempts: {
    key: string
    value: ValuationAttempt
    indexes: { by_exercise: string; by_started: number }
  }
  quickMathSessions: {
    key: string
    value: QuickMathSession
    indexes: { by_started: number }
  }
  quickMathResults: {
    key: number
    value: QuickMathResult
    indexes: { by_at: number; by_session_question: [string, string] }
  }
}

let dbPromise: Promise<IDBPDatabase<ProgressDB>> | null = null

function db() {
  // Version 2 added the Deal Walk stores and version 3 the Three Statements attempts and version 4 the Valuation Builder attempts and version 5 the Quick Maths sessions and results. Upgrading only adds
  // stores; existing progress is left untouched.
  dbPromise ??= openDB<ProgressDB>("ib-prep-progress", 5, {
    upgrade(d, oldVersion) {
      if (oldVersion < 1) {
        d.createObjectStore("cardStates", { keyPath: "exerciseId" })
        const attempts = d.createObjectStore("attempts", {
          keyPath: "id",
          autoIncrement: true,
        })
        attempts.createIndex("by_session", "sessionId")
        attempts.createIndex("by_at", "at")
        const sessions = d.createObjectStore("sessions", { keyPath: "id" })
        sessions.createIndex("by_started", "startedAt")
        d.createObjectStore("meta")
      }
      if (oldVersion < 2) {
        const walks = d.createObjectStore("walks", { keyPath: "sessionId" })
        walks.createIndex("by_process", "processId")
        walks.createIndex("by_started", "startedAt")
        const results = d.createObjectStore("choiceAttempts", { keyPath: "id", autoIncrement: true })
        results.createIndex("by_at", "at")
        // One saved result per stage per walk: a second submission of the same stage is rejected by the database.
        results.createIndex("by_session_stage", ["sessionId", "stageId"], { unique: true })
      }
      if (oldVersion < 3) {
        const attempts = d.createObjectStore("statementAttempts", { keyPath: "id" })
        attempts.createIndex("by_exercise", "exerciseId")
        attempts.createIndex("by_started", "startedAt")
      }
      if (oldVersion < 4) {
        const attempts = d.createObjectStore("valuationAttempts", { keyPath: "id" })
        attempts.createIndex("by_exercise", "exerciseId")
        attempts.createIndex("by_started", "startedAt")
      }
      if (oldVersion < 5) {
        const sessions = d.createObjectStore("quickMathSessions", { keyPath: "id" })
        sessions.createIndex("by_started", "startedAt")
        const results = d.createObjectStore("quickMathResults", { keyPath: "id", autoIncrement: true })
        results.createIndex("by_at", "at")
        // One saved result per question per session: a second submission of the same question is rejected by the database.
        results.createIndex("by_session_question", ["sessionId", "questionKey"], { unique: true })
      }
    },
  })
  return dbPromise
}

export async function getAllCardStates(): Promise<Map<string, CardState>> {
  const all = await (await db()).getAll("cardStates")
  return new Map(all.map((s) => [s.exerciseId, s]))
}

export async function getSession(id: string) {
  return (await db()).get("sessions", id)
}

/** Writes the card state, the attempt and the session tally in one transaction. */
export async function recordAttempt(
  state: CardState,
  attempt: Attempt,
  session: Session,
) {
  const tx = (await db()).transaction(
    ["cardStates", "attempts", "sessions"],
    "readwrite",
  )
  await Promise.all([
    tx.objectStore("cardStates").put(state),
    tx.objectStore("attempts").add(attempt),
    tx.objectStore("sessions").put(session),
    tx.done,
  ])
}

export async function getSessions(): Promise<Session[]> {
  const all = await (await db()).getAllFromIndex("sessions", "by_started")
  return all.reverse()
}

export async function getRecentAttempts(limit = 50): Promise<Attempt[]> {
  const out: Attempt[] = []
  let cursor = await (await db())
    .transaction("attempts")
    .store.index("by_at")
    .openCursor(null, "prev")
  while (cursor && out.length < limit) {
    out.push(cursor.value)
    cursor = await cursor.continue()
  }
  return out
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await (await db()).get("meta", key)) as T | undefined
}

export async function setMeta(key: string, value: unknown) {
  await (await db()).put("meta", value, key)
}

// ---- Deal Walks ----

export async function getWalks(): Promise<Walk[]> {
  const all = await (await db()).getAllFromIndex("walks", "by_started")
  return all.reverse()
}

export async function getWalk(sessionId: string) {
  return (await db()).get("walks", sessionId)
}

/** Saves a new walk and retires any other unfinished walk of the same process. */
export async function startWalk(walk: Walk) {
  const tx = (await db()).transaction("walks", "readwrite")
  const open = await tx.store.index("by_process").getAll(walk.processId)
  for (const w of open) {
    if (w.status === "active" && w.sessionId !== walk.sessionId) {
      await tx.store.put({ ...w, status: "abandoned", updatedAt: walk.startedAt })
    }
  }
  await tx.store.put(walk)
  await tx.done
}

export async function saveWalk(walk: Walk) {
  await (await db()).put("walks", walk)
}

export type SubmitOutcome = { walk: Walk; duplicate: boolean }

/**
 * Records a stage result and its objective attempt together in one transaction. If the stage already
 * has a result (a double click, a second tab, a replay after reload) nothing is written and the
 * stored walk is returned with `duplicate: true`.
 */
export async function submitStage(
  sessionId: string,
  attempt: Omit<ChoiceAttempt, "id" | "sessionId">,
  stageCount: number,
): Promise<SubmitOutcome | null> {
  const d = await db()
  const tx = d.transaction(["walks", "choiceAttempts"], "readwrite")
  try {
    const walk = await tx.objectStore("walks").get(sessionId)
    if (!walk || walk.status !== "active") {
      await tx.done
      return walk ? { walk, duplicate: true } : null
    }
    if (walk.results[attempt.stageId]) {
      await tx.done
      return { walk, duplicate: true }
    }
    await tx.objectStore("choiceAttempts").add({ ...attempt, sessionId })
    const results = {
      ...walk.results,
      [attempt.stageId]: { selectedOptionId: attempt.selectedOptionId, correct: attempt.correct, at: attempt.at },
    }
    const done = Object.keys(results).length >= stageCount
    const next: Walk = {
      ...walk,
      results,
      updatedAt: attempt.at,
      status: done ? "complete" : "active",
      ...(done ? { completedAt: attempt.at } : {}),
    }
    await tx.objectStore("walks").put(next)
    await tx.done
    return { walk: next, duplicate: false }
  } catch (err) {
    tx.done.catch(() => {})
    try {
      tx.abort()
    } catch {
      /* already finished */
    }
    if (err instanceof DOMException && err.name === "ConstraintError") {
      // Another tab saved this stage first; show what is stored rather than writing it again.
      const stored = await getWalk(sessionId)
      if (stored) return { walk: stored, duplicate: true }
    }
    throw err
  }
}

export async function getRecentChoiceAttempts(limit = 50): Promise<ChoiceAttempt[]> {
  const out: ChoiceAttempt[] = []
  let cursor = await (await db()).transaction("choiceAttempts").store.index("by_at").openCursor(null, "prev")
  while (cursor && out.length < limit) {
    out.push(cursor.value)
    cursor = await cursor.continue()
  }
  return out
}

// ---- Three Statements ----

export async function getStatementAttempts(): Promise<StatementAttempt[]> {
  const all = await (await db()).getAllFromIndex("statementAttempts", "by_started")
  return all.reverse()
}

export async function getStatementAttempt(id: string) {
  return (await db()).get("statementAttempts", id)
}

/** Saves a draft. A submitted attempt is never overwritten, so a late autosave cannot undo a submission. */
export async function saveStatementDraft(attempt: StatementAttempt): Promise<StatementAttempt> {
  const tx = (await db()).transaction("statementAttempts", "readwrite")
  const existing = await tx.store.get(attempt.id)
  if (existing && existing.status === "submitted") {
    await tx.done
    return existing
  }
  const next = { ...attempt, status: "draft" as const }
  await tx.store.put(next)
  await tx.done
  return next
}

export type StatementSubmitOutcome = { attempt: StatementAttempt; duplicate: boolean }

/** Marks an attempt submitted exactly once. A second submission returns the stored result unchanged. */
export async function submitStatementAttempt(
  attempt: StatementAttempt,
  grade: StatementGrade,
  now = Date.now(),
): Promise<StatementSubmitOutcome> {
  const tx = (await db()).transaction("statementAttempts", "readwrite")
  const existing = await tx.store.get(attempt.id)
  if (existing && existing.status === "submitted") {
    await tx.done
    return { attempt: existing, duplicate: true }
  }
  const submitted: StatementAttempt = { ...attempt, status: "submitted", grade, submittedAt: now, updatedAt: now }
  await tx.store.put(submitted)
  await tx.done
  return { attempt: submitted, duplicate: false }
}

/** Remembers where the learner is in the worked solution. */
export async function saveStatementView(id: string, solution: { shown: boolean; step: number }) {
  const tx = (await db()).transaction("statementAttempts", "readwrite")
  const existing = await tx.store.get(id)
  if (existing && existing.status === "submitted") await tx.store.put({ ...existing, solution })
  await tx.done
}

/** Removes unfinished attempts of an exercise (used when the learner starts over). Submitted ones stay. */
export async function discardStatementDrafts(exerciseId: string) {
  const tx = (await db()).transaction("statementAttempts", "readwrite")
  for (const a of await tx.store.index("by_exercise").getAll(exerciseId)) {
    if (a.status === "draft") await tx.store.delete(a.id)
  }
  await tx.done
}

// ---- Valuation Builder ----

export async function getValuationAttempts(): Promise<ValuationAttempt[]> {
  const all = await (await db()).getAllFromIndex("valuationAttempts", "by_started")
  return all.reverse()
}

export async function getValuationAttempt(id: string) {
  return (await db()).get("valuationAttempts", id)
}

/** Saves a draft. A submitted attempt is never overwritten, so a late autosave cannot undo a submission. */
export async function saveValuationDraft(attempt: ValuationAttempt): Promise<ValuationAttempt> {
  const tx = (await db()).transaction("valuationAttempts", "readwrite")
  const existing = await tx.store.get(attempt.id)
  if (existing && existing.status === "submitted") {
    await tx.done
    return existing
  }
  const next = { ...attempt, status: "draft" as const }
  await tx.store.put(next)
  await tx.done
  return next
}

export type ValuationSubmitOutcome = { attempt: ValuationAttempt; duplicate: boolean }

/** Marks an attempt submitted exactly once. A second submission returns the stored result unchanged. */
export async function submitValuationAttempt(
  attempt: ValuationAttempt,
  grade: ValuationGrade,
  now = Date.now(),
): Promise<ValuationSubmitOutcome> {
  const tx = (await db()).transaction("valuationAttempts", "readwrite")
  const existing = await tx.store.get(attempt.id)
  if (existing && existing.status === "submitted") {
    await tx.done
    return { attempt: existing, duplicate: true }
  }
  const submitted: ValuationAttempt = { ...attempt, status: "submitted", grade, submittedAt: now, updatedAt: now }
  await tx.store.put(submitted)
  await tx.done
  return { attempt: submitted, duplicate: false }
}

/** Remembers whether the learner was looking at their own diagram or the solution. */
export async function saveValuationView(id: string, view: NonNullable<ValuationAttempt["view"]>) {
  const tx = (await db()).transaction("valuationAttempts", "readwrite")
  const existing = await tx.store.get(id)
  if (existing && existing.status === "submitted") await tx.store.put({ ...existing, view })
  await tx.done
}

/** Removes unfinished attempts of an exercise (used when the learner starts over). Submitted ones stay. */
export async function discardValuationDrafts(exerciseId: string) {
  const tx = (await db()).transaction("valuationAttempts", "readwrite")
  for (const a of await tx.store.index("by_exercise").getAll(exerciseId)) {
    if (a.status === "draft") await tx.store.delete(a.id)
  }
  await tx.done
}

// ---- Quick Maths ----

export async function getQuickMathSessions(): Promise<QuickMathSession[]> {
  const all = await (await db()).getAllFromIndex("quickMathSessions", "by_started")
  return all.reverse()
}

export async function getQuickMathSession(id: string) {
  return (await db()).get("quickMathSessions", id)
}

export async function getQuickMathResults(): Promise<QuickMathResult[]> {
  return (await db()).getAll("quickMathResults")
}

/** Saves a new session and retires any other unfinished one, so there is at most one active session. */
export async function startQuickMathSession(session: QuickMathSession) {
  const tx = (await db()).transaction("quickMathSessions", "readwrite")
  for (const other of await tx.store.getAll()) {
    if (other.status === "active" && other.id !== session.id) {
      await tx.store.put({ ...other, status: "abandoned", updatedAt: session.startedAt })
    }
  }
  await tx.store.put(session)
  await tx.done
}

/** Marks a session abandoned (the learner discarded it). Its answered questions stay in History. */
export async function abandonQuickMathSession(id: string, now = Date.now()) {
  const tx = (await db()).transaction("quickMathSessions", "readwrite")
  const existing = await tx.store.get(id)
  if (existing && existing.status === "active") await tx.store.put({ ...existing, status: "abandoned", updatedAt: now })
  await tx.done
}

/**
 * Saves the unsent text and the response time so far for the current question. Ignored if the session has moved
 * on or the question is already answered, so a late autosave can never undo a submission or an advance.
 */
export async function saveQuickMathDraft(id: string, index: number, draft: string, elapsedMs: number, now = Date.now()) {
  const tx = (await db()).transaction("quickMathSessions", "readwrite")
  const existing = await tx.store.get(id)
  const q = existing?.questions[index]
  if (existing && existing.status === "active" && existing.index === index && q && !existing.answers[q.key]) {
    await tx.store.put({ ...existing, draft, elapsedMs, updatedAt: now })
  }
  await tx.done
}

export type QuickMathOutcome = { session: QuickMathSession; duplicate: boolean }

/**
 * Records one answer and its objective result together in one transaction. If the question already has a
 * result (a double click, a repeated key, a second tab) nothing is written and the stored session comes back
 * with `duplicate: true`.
 */
export async function submitQuickMathAnswer(
  sessionId: string,
  index: number,
  entry: { raw: string; entered: number; responseMs: number | null; at: number },
  correct: boolean,
): Promise<QuickMathOutcome | null> {
  const d = await db()
  const tx = d.transaction(["quickMathSessions", "quickMathResults"], "readwrite")
  try {
    const session = await tx.objectStore("quickMathSessions").get(sessionId)
    if (!session) {
      await tx.done
      return null
    }
    const q = session.questions[index]
    if (session.status !== "active" || session.index !== index || !q || session.answers[q.key]) {
      await tx.done
      return { session, duplicate: true }
    }
    await tx.objectStore("quickMathResults").add({
      sessionId,
      questionKey: q.key,
      questionId: q.id,
      source: q.source,
      category: q.category,
      subcategory: q.subcategory,
      difficulty: q.difficulty,
      conceptIds: q.conceptIds,
      mode: session.mode,
      entered: entry.entered,
      answer: q.answer,
      correct,
      responseMs: entry.responseMs,
      at: entry.at,
    })
    const next: QuickMathSession = {
      ...session,
      draft: entry.raw,
      elapsedMs: entry.responseMs ?? 0,
      answers: { ...session.answers, [q.key]: { entered: entry.entered, raw: entry.raw, correct, responseMs: entry.responseMs, at: entry.at } },
      updatedAt: entry.at,
    }
    await tx.objectStore("quickMathSessions").put(next)
    await tx.done
    return { session: next, duplicate: false }
  } catch (err) {
    tx.done.catch(() => {})
    try {
      tx.abort()
    } catch {
      /* already finished */
    }
    if (err instanceof DOMException && err.name === "ConstraintError") {
      const stored = await getQuickMathSession(sessionId)
      if (stored) return { session: stored, duplicate: true }
    }
    throw err
  }
}

/**
 * Moves from an answered question to the next one, or completes the session after the last. Does nothing (and
 * returns the stored session with `duplicate: true`) if the session is not at `index` or it is unanswered, so a
 * repeated click or key press cannot skip a question.
 */
export async function advanceQuickMath(sessionId: string, index: number, now = Date.now()): Promise<QuickMathOutcome | null> {
  const tx = (await db()).transaction("quickMathSessions", "readwrite")
  const session = await tx.store.get(sessionId)
  if (!session) {
    await tx.done
    return null
  }
  const q = session.questions[index]
  if (session.status !== "active" || session.index !== index || !q || !session.answers[q.key]) {
    await tx.done
    return { session, duplicate: true }
  }
  const nextIndex = index + 1
  const done = nextIndex >= session.questions.length
  const next: QuickMathSession = {
    ...session,
    index: nextIndex,
    draft: "",
    elapsedMs: 0,
    updatedAt: now,
    status: done ? "complete" : "active",
    ...(done ? { completedAt: now } : {}),
  }
  await tx.store.put(next)
  await tx.done
  return { session: next, duplicate: false }
}
