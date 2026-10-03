// Content shipped with the app. Imported content is layered on top of this (see ContentProvider).
import conceptsJson from "./concepts.json"
import questionsJson from "./questions.json"
import scenariosJson from "./scenarios.json"
import { SCHEMA_VERSION } from "./schema.ts"
import { validatePack } from "./validate.ts"
import type { Bank, Concept, Exercise } from "./types.ts"

export const BUNDLED_CONTENT_VERSION = "sample-1"

export const bundledBank: Bank = {
  concepts: conceptsJson as Concept[],
  questions: questionsJson as Exercise[],
  scenarios: scenariosJson as Exercise[],
}

// Fail loudly in development if the shipped content breaks the schema the importer enforces.
if (import.meta.env.DEV) {
  const result = validatePack({ schemaVersion: SCHEMA_VERSION, contentVersion: BUNDLED_CONTENT_VERSION, ...bundledBank }, new Set())
  if (!result.ok) console.error("Bundled content is invalid:\n" + result.errors.join("\n"))
}
