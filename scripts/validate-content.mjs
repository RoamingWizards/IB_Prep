// Validate a content pack without opening the app:  npm run validate-content -- path/to/pack.json
// Concept references may point to concepts in the pack or in the bundled content (src/content/concepts.json).
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { parsePack } from "../src/content/validate.ts"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const file = process.argv[2]
if (!file) {
  console.error("Usage: npm run validate-content -- <pack.json>")
  process.exit(2)
}

const bundled = JSON.parse(readFileSync(join(root, "src/content/concepts.json"), "utf8"))
const result = parsePack(readFileSync(file, "utf8"), new Set(bundled.map((c) => c.id)))

if (!result.ok) {
  console.error(`INVALID: ${file}`)
  for (const e of result.errors) console.error(`  - ${e}`)
  process.exit(1)
}
const { pack, warnings } = result
console.log(
  `VALID: ${file}\n  contentVersion ${pack.contentVersion} · ${pack.concepts.length} concepts · ${pack.questions.length} questions · ${pack.scenarios.length} scenarios`,
)
for (const w of warnings) console.log(`  warning: ${w}`)
