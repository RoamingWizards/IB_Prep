// Validates every example pack in src/content/examples (the ones offered by the app's import help) with the same
// validator the app uses, against the concepts and content bundled with the app:  npm run check-examples
import { readdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { parsePack } from "../src/content/validate.ts"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const read = (path) => JSON.parse(readFileSync(path, "utf8"))
const baseConcepts = read(join(root, "src/content/concepts.json"))
const conceptIds = new Set(baseConcepts.map((c) => c.id))
const prerequisites = new Map(baseConcepts.map((c) => [c.id, c.prerequisiteIds ?? []]))
const choiceIds = new Set()
const stageOwners = new Map()
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

let failed = 0
const dir = join(root, "src/content/examples")
for (const name of readdirSync(dir).filter((n) => n.endsWith(".json")).sort()) {
  const result = parsePack(readFileSync(join(dir, name), "utf8"), { conceptIds, choiceIds, stageOwners, prerequisites })
  if (!result.ok) {
    failed++
    console.error(`INVALID: ${name}`)
    for (const e of result.errors) console.error(`  - ${e}`)
  } else if (result.warnings.length > 0) {
    failed++
    console.error(`WARNINGS: ${name}`)
    for (const w of result.warnings) console.error(`  - ${w}`)
  } else console.log(`VALID: ${name}`)
}
process.exit(failed === 0 ? 0 : 1)
