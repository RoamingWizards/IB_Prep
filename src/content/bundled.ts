// Content shipped with the app. Imported content is layered on top of this (see ContentProvider).
import conceptsJson from "./concepts.json"
import questionsJson from "./questions.json"
import scenariosJson from "./scenarios.json"
import ipoPack from "./packs/ipo.json"
import maSellSidePack from "./packs/ma-sell-side.json"
import threeStatementsPack from "./packs/three-statements-depreciation.json"
import valuationPack from "./packs/valuation-dcf.json"
import quickMathPack from "./packs/quick-maths-finance.json"
import { SCHEMA_VERSION } from "./schema.ts"
import { NO_KNOWN, validatePack } from "./validate.ts"
import type { Bank, Concept, ContentPack, Exercise } from "./types.ts"

export const BUNDLED_CONTENT_VERSION = "sample-5"

// The deal-walk, three-statement and valuation packs are ordinary content packs, kept as separate files so they double as format examples.
const dealWalkPacks = [maSellSidePack, ipoPack] as unknown as ContentPack[]
const statementPacks = [threeStatementsPack] as unknown as ContentPack[]
const valuationPacks = [valuationPack] as unknown as ContentPack[]
const quickMathPacks = [quickMathPack] as unknown as ContentPack[]
const allPacks = [...dealWalkPacks, ...statementPacks, ...valuationPacks, ...quickMathPacks]

export const bundledBank: Bank = {
  concepts: [...(conceptsJson as Concept[]), ...allPacks.flatMap((p) => p.concepts ?? [])],
  questions: questionsJson as Exercise[],
  scenarios: scenariosJson as Exercise[],
  multipleChoice: dealWalkPacks.flatMap((p) => p.multipleChoice ?? []),
  processes: dealWalkPacks.flatMap((p) => p.processes ?? []),
  threeStatementExercises: statementPacks.flatMap((p) => p.threeStatementExercises ?? []),
  valuationExercises: valuationPacks.flatMap((p) => p.valuationExercises ?? []),
  quickMathQuestions: quickMathPacks.flatMap((p) => p.quickMathQuestions ?? []),
}

// Fail loudly in development if the shipped content breaks the schema the importer enforces.
if (import.meta.env.DEV) {
  const result = validatePack({ schemaVersion: SCHEMA_VERSION, contentVersion: BUNDLED_CONTENT_VERSION, ...bundledBank }, NO_KNOWN)
  if (!result.ok) console.error("Bundled content is invalid:\n" + result.errors.join("\n"))
}
