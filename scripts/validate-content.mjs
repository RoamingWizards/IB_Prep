// Validate a content pack without opening the app:  npm run validate-content -- path/to/pack.json
// References (concepts, multiple-choice questions, stage IDs) may point into the pack itself or into the
// content bundled with the app (src/content/concepts.json and src/content/packs/*.json).
import { readdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { parsePack } from "../src/content/validate.ts"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const file = process.argv[2]
if (!file) {
  console.error("Usage: npm run validate-content -- <pack.json>")
  process.exit(2)
}

const read = (path) => JSON.parse(readFileSync(path, "utf8"))
const baseConcepts = read(join(root, "src/content/concepts.json"))
const conceptIds = new Set(baseConcepts.map((c) => c.id))
const choiceIds = new Set()
const stageOwners = new Map()
const prerequisites = new Map()
for (const c of baseConcepts) prerequisites.set(c.id, c.prerequisiteIds ?? [])
const packsDir = join(root, "src/content/packs")
for (const name of readdirSync(packsDir).filter((n) => n.endsWith(".json"))) {
  const bundled = read(join(packsDir, name))
  for (const c of bundled.concepts ?? []) {
    conceptIds.add(c.id)
    prerequisites.set(c.id, c.prerequisiteIds ?? [])
  }
  for (const c of bundled.multipleChoice ?? []) choiceIds.add(c.id)
  for (const p of bundled.processes ?? []) for (const st of p.stages) stageOwners.set(st.id, p.id)
}

const result = parsePack(readFileSync(file, "utf8"), { conceptIds, choiceIds, stageOwners, prerequisites })

if (!result.ok) {
  console.error(`INVALID: ${file}`)
  for (const e of result.errors) console.error(`  - ${e}`)
  process.exit(1)
}
const { pack, warnings } = result
console.log(
  `VALID: ${file}\n  contentVersion ${pack.contentVersion} · ${pack.concepts.length} concepts · ${pack.questions.length} questions · ${pack.scenarios.length} scenarios · ${pack.multipleChoice.length} multiple-choice · ${pack.processes.length} processes · ${pack.threeStatementExercises.length} three-statement exercises · ${pack.valuationExercises.length} valuation exercises · ${pack.quickMathQuestions.length} quick maths questions · ${pack.behaviouralQuestions.length} behavioural questions`,
)
for (const w of warnings) console.log(`  warning: ${w}`)
