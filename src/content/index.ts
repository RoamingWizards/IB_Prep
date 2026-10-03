import conceptsJson from "./concepts.json"
import questionsJson from "./questions.json"
import scenariosJson from "./scenarios.json"
import type { Concept, Exercise, ExerciseKind } from "./types"

export const concepts = conceptsJson as Concept[]
export const questions = questionsJson as Exercise[]
export const scenarios = scenariosJson as Exercise[]

export const conceptsById = new Map(concepts.map((c) => [c.id, c]))
export const exercisesById = new Map(
  [...questions, ...scenarios].map((e) => [e.id, e]),
)

export function exercisesFor(kind: ExerciseKind): Exercise[] {
  return kind === "question" ? questions : scenarios
}

// Fail loudly in development if content breaks ID invariants.
if (import.meta.env.DEV) {
  const all = [...questions, ...scenarios]
  if (exercisesById.size !== all.length) {
    console.error("Duplicate exercise IDs in content")
  }
  for (const e of all) {
    if (!e.category || !e.subcategory) console.error(`Exercise ${e.id} needs a category and subcategory`)
    for (const cid of e.conceptIds) {
      if (!conceptsById.has(cid)) {
        console.error(`Exercise ${e.id} references unknown concept ${cid}`)
      }
    }
  }
}
