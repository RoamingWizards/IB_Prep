// Content shipped with the app. Imported content is layered on top of this (see ContentProvider).
import conceptsJson from "./concepts.json"
import questionsJson from "./questions.json"
import scenariosJson from "./scenarios.json"
import ipoPack from "./packs/ipo.json"
import maSellSidePack from "./packs/ma-sell-side.json"
import threeStatementsPack from "./packs/three-statements-depreciation.json"
import valuationPack from "./packs/valuation-dcf.json"
import quickMathPack from "./packs/quick-maths-finance.json"
import behaviouralPack from "./packs/behavioural-sample.json"
import ib400Pack from "../../content-packs/ib400-complete.json"
import { SCHEMA_VERSION } from "./schema.ts"
import { NO_KNOWN, validatePack } from "./validate.ts"
import type { Bank, Concept, ContentPack, Exercise } from "./types.ts"

export const BUNDLED_CONTENT_VERSION = "ib400-complete-2026-10-04-v1"

// The deal-walk, three-statement and valuation packs are ordinary content packs, kept as separate files so they double as format examples.
const dealWalkPacks = [maSellSidePack, ipoPack] as unknown as ContentPack[]
const statementPacks = [threeStatementsPack] as unknown as ContentPack[]
const valuationPacks = [valuationPack] as unknown as ContentPack[]
const quickMathPacks = [quickMathPack] as unknown as ContentPack[]
const behaviouralPacks = [behaviouralPack] as unknown as ContentPack[]
// The full content bank (content-packs/ib400-complete.json) repeats every earlier bundled item, byte for byte. Items are
// joined by stable ID: the first copy keeps its place and a later copy of the same ID replaces it, so nothing is duplicated.
const fullPack = ib400Pack as unknown as ContentPack
const allPacks = [...dealWalkPacks, ...statementPacks, ...valuationPacks, ...quickMathPacks, ...behaviouralPacks, fullPack]

function byId<T extends { id: string }>(...lists: (T[] | undefined)[]): T[] {
  const out = new Map<string, T>()
  for (const list of lists) for (const item of list ?? []) out.set(item.id, item)
  return [...out.values()]
}

export const bundledBank: Bank = {
  concepts: byId(conceptsJson as Concept[], ...allPacks.map((p) => p.concepts)),
  questions: byId(questionsJson as Exercise[], fullPack.questions),
  scenarios: byId(scenariosJson as Exercise[], fullPack.scenarios),
  multipleChoice: byId(...[...dealWalkPacks, fullPack].map((p) => p.multipleChoice)),
  processes: byId(...[...dealWalkPacks, fullPack].map((p) => p.processes)),
  threeStatementExercises: byId(...[...statementPacks, fullPack].map((p) => p.threeStatementExercises)),
  valuationExercises: byId(...[...valuationPacks, fullPack].map((p) => p.valuationExercises)),
  quickMathQuestions: byId(...[...quickMathPacks, fullPack].map((p) => p.quickMathQuestions)),
  behaviouralQuestions: byId(...[...behaviouralPacks, fullPack].map((p) => p.behaviouralQuestions)),
}

// Fail loudly in development if the shipped content breaks the schema the importer enforces.
if (import.meta.env.DEV) {
  const result = validatePack({ schemaVersion: SCHEMA_VERSION, contentVersion: BUNDLED_CONTENT_VERSION, ...bundledBank }, NO_KNOWN)
  if (!result.ok) console.error("Bundled content is invalid:\n" + result.errors.join("\n"))
}
