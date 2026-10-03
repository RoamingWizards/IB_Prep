// Pure helpers for Deal Walks: option shuffling, order repair and scoring.
import type { Process } from "@/content/types"
import type { Walk } from "./db"

/** Fisher-Yates shuffle with a cryptographic random source. Returns a new array. */
export function shuffled<T>(items: readonly T[]): T[] {
  const out = [...items]
  const rand = new Uint32Array(out.length)
  crypto.getRandomValues(rand)
  for (let i = out.length - 1; i > 0; i--) {
    const j = rand[i] % (i + 1)
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * Keeps a stored option order usable if the question was edited since: options that no longer exist are
 * dropped and new ones are appended, so a resumed stage never shows a missing option.
 */
export function reconcileOrder(stored: readonly string[] | undefined, optionIds: readonly string[]): string[] {
  if (!stored) return shuffled(optionIds)
  const present = new Set(optionIds)
  const kept = stored.filter((id) => present.has(id))
  const keptSet = new Set(kept)
  return [...kept, ...optionIds.filter((id) => !keptSet.has(id))]
}

export function walkScore(walk: Walk, process: Process) {
  const correct = process.stages.filter((s) => walk.results[s.id]?.correct).length
  const answered = process.stages.filter((s) => walk.results[s.id]).length
  return { correct, answered, total: process.stages.length }
}

export function newWalk(process: Process, firstOrder: string[], now = Date.now()): Walk {
  return {
    sessionId: crypto.randomUUID(),
    processId: process.id,
    startedAt: now,
    updatedAt: now,
    stageIndex: 0,
    order: { [process.stages[0].id]: firstOrder },
    results: {},
    status: "active",
  }
}
