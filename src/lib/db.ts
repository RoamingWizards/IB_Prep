// User progress lives in IndexedDB, separate from the read-only JSON content.
// Records reference content only by stable exercise ID.
import { openDB, type DBSchema, type IDBPDatabase } from "idb"
import type { ExerciseKind } from "@/content/types"

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

interface ProgressDB extends DBSchema {
  cardStates: { key: string; value: CardState }
  attempts: {
    key: number
    value: Attempt
    indexes: { by_session: string; by_at: number }
  }
  sessions: { key: string; value: Session; indexes: { by_started: number } }
  meta: { key: string; value: unknown }
}

let dbPromise: Promise<IDBPDatabase<ProgressDB>> | null = null

function db() {
  dbPromise ??= openDB<ProgressDB>("ib-prep-progress", 1, {
    upgrade(d) {
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
