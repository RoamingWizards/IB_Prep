// Instructions a learner can paste into an LLM to prepare a content pack, one per mode. The wording follows the
// current schema and validator (src/content/schema.ts, src/content/validate.ts, docs/CONTENT_SCHEMA.md): limits are
// read from the schema constants, and the example for each mode is a real file in src/content/examples that is
// validated with the same validator. Pure functions with no browser APIs.
import {
  DIFFICULTIES,
  ID_PREFIX,
  MAX_CHECKLIST_ITEMS,
  MAX_DECIMALS,
  MAX_FRAMEWORK_STEPS,
  MAX_GRAPH_EDGES,
  MAX_GUIDANCE_PARAGRAPHS,
  MAX_ID_LENGTH,
  MAX_OPTIONS,
  MAX_PREREQUISITES,
  MAX_QUICK_MATH_ASSUMPTIONS,
  MAX_STAGES,
  MAX_STATEMENT_ROWS,
  MAX_STATEMENTS,
  MAX_STEPS,
  MAX_VALUATION_GRAPHS,
  MAX_VALUATION_STEPS,
  MIN_FRAMEWORK_STEPS,
  MIN_OPTIONS,
  SCHEMA_VERSION,
} from "../content/schema.ts"

export type HelpMode = "questions" | "scenarios" | "deal-walks" | "three-statements" | "valuation" | "quick-maths" | "behavioural" | "concepts"

export interface HelpModeInfo {
  id: HelpMode
  label: string
  /** The collection(s) the example pack fills. */
  collections: string
  /** The file name of the example download. */
  file: string
}

export const HELP_MODES: HelpModeInfo[] = [
  { id: "questions", label: "Questions (flashcards)", collections: "questions", file: "ib-prep-example-questions.json" },
  { id: "scenarios", label: "Scenarios (flashcards)", collections: "scenarios", file: "ib-prep-example-scenarios.json" },
  { id: "deal-walks", label: "Deal Walks", collections: "multipleChoice and processes", file: "ib-prep-example-deal-walks.json" },
  { id: "three-statements", label: "Three Statements", collections: "threeStatementExercises", file: "ib-prep-example-three-statements.json" },
  { id: "valuation", label: "Valuation Builder", collections: "valuationExercises", file: "ib-prep-example-valuation.json" },
  { id: "quick-maths", label: "Quick Maths", collections: "quickMathQuestions", file: "ib-prep-example-quick-maths.json" },
  { id: "behavioural", label: "Behavioural", collections: "behaviouralQuestions", file: "ib-prep-example-behavioural.json" },
  { id: "concepts", label: "Concepts and Skill Tree", collections: "concepts", file: "ib-prep-example-concepts.json" },
]

export interface ConceptRef {
  id: string
  name: string
}

const list = (items: string[]) => items.map((i) => `- ${i}`).join("\n")

// ---- Shared sections ----

function general(conceptLines: string, collections: string): string {
  return `You are helping me prepare a content pack for IB Prep, an offline investment-banking study app. Produce ONE JSON file that the app can import.

OUTPUT RULES
${list([
  "Reply with the JSON only. Do not wrap it in Markdown code fences and do not add any text before or after it.",
  "Use valid JSON: double quotes, no comments, no trailing commas. Where a field is described as a number, write a JSON number, not text.",
  "Use only the fields described below. Unknown fields are ignored with a warning, so do not add any.",
  "Do not invent references. Every concept ID, question ID, step ID and row ID you refer to must be defined in your own file or, for concepts, be one of the existing concept IDs listed below. If none of the listed concepts fits, define a new concept in a \"concepts\" list in the same file instead of guessing an ID.",
  "Do not invent finance facts. Keep every figure and statement accurate; the app does not check the finance.",
])}

PACK FORMAT
The file is one JSON object:
{
  "schemaVersion": ${SCHEMA_VERSION},
  "contentVersion": "<a short label for this pack, up to 64 characters, for example 2026.10.1>",
  "title": "<optional name shown in the import preview>",
  "description": "<optional>",
  "<collection>": [ ... ]
}
${list([
  `"schemaVersion" must be the number ${SCHEMA_VERSION}. "contentVersion" is required text.`,
  `This pack fills: ${collections}. Leave out any collection you are not writing. A pack must contain at least one item.`,
])}

IDS
${list([
  `Every item has a stable "id": lowercase letters, digits and hyphens only, at most ${MAX_ID_LENGTH} characters, starting with the prefix for its type (given below), for example "q-ev-bridge-001".`,
  "IDs must be unique within the file. Choose them once and never change them later: the app saves progress against them.",
  "When the file is imported, items are MERGED BY ID. A new ID adds an item. An ID that already exists in the app REPLACES that item with your version, so reuse an existing ID only when you mean to update that item. Nothing is ever deleted.",
])}

EXISTING CONCEPT IDS (you may reference these; each line is "id: name")
${conceptLines || "(no concepts are defined yet; define any you need in a \"concepts\" list)"}
Concept references go in "conceptIds" lists. Each list needs at least one ID, and every ID must be on this list or defined in your pack.`
}

const AFTER = `AFTER YOU REPLY (instructions for me, the person using the app)
${list([
  "Save the reply as a file ending in .json (plain text, UTF-8).",
  "In the app open Settings, then Content, then Import pack, and choose the file.",
  "Read the preview. It lists what will be added and what will update existing items by ID. Nothing is stored until I confirm.",
  "If the app shows validation errors, I will paste the full error list back to you. Reply again with the complete corrected JSON, with no code fences, fixing every error listed.",
])}`

function wrap(mode: HelpModeInfo, conceptLines: string, spec: string, example: string): string {
  return `${general(conceptLines, mode.collections)}

${spec.trim()}

EXAMPLE OF A VALID PACK (it passes the app's validator; follow its structure, not its topic)
${example.trim()}

BEFORE YOU REPLY, CHECK
${list([
  "The reply is a single JSON object with no code fences and no extra text.",
  "Every ID has the right prefix, is lowercase kebab-case and is unique.",
  "Every reference points at something defined in the file or in the concept list above.",
  "Every required field is present, with the right type and within the stated limits.",
])}

${AFTER}

NOW CREATE THE PACK ABOUT: [DESCRIBE THE TOPIC AND HOW MANY ITEMS YOU WANT HERE]`
}

// ---- Mode specifications ----

const EXERCISE_FIELDS = (prefix: string, kind: "question" | "scenario") => `FORMAT FOR ${kind === "question" ? "QUESTIONS" : "SCENARIOS"} (flashcards; collection "${kind === "question" ? "questions" : "scenarios"}")
Each item:
${list([
  `"id": starts with "${prefix}".`,
  `"kind": the text "${kind}" (required, and it must match the collection).`,
  `"category": broad area, for example "Valuation" (up to 80 characters). "subcategory": narrower topic, for example "DCF" (up to 80 characters). You supply both; the app never infers them. The topic selectors are built from them, so spell and capitalise them consistently ("DCF" and "Dcf" would be different topics).`,
  `"title": short label shown on the card and in History.`,
  `"prompt": the ${kind === "question" ? "question as an interviewer would ask it" : "situation and what to work out"}.`,
  `"answer": a non-empty list of text paragraphs, shown after the card is flipped. Put the answer in the paragraphs; do not use Markdown.`,
  `"conceptIds": a non-empty list of concept IDs (see above).`,
  `"givens": optional list of { "label": text, "value": text } facts shown under the prompt${kind === "scenario" ? " (normally used for scenarios: figures, assumptions)" : ""}.`,
  `"formulas": optional list of { "label": text, "expression": text }.`,
  `"tables": optional prepared tables; leave them out unless needed.`,
])}
MODE RULES
${list([
  kind === "question" ? "A question is a concept to explain; keep the answer to a few clear paragraphs." : "A scenario gives numbers or facts in \"givens\" and the answer works through them step by step, showing the arithmetic.",
  "Each card is graded by the learner against the answer themselves; there is nothing to calculate in the file.",
])}`

const SPECS: Record<HelpMode, string> = {
  questions: EXERCISE_FIELDS(ID_PREFIX.question, "question"),
  scenarios: EXERCISE_FIELDS(ID_PREFIX.scenario, "scenario"),
  "deal-walks": `FORMAT FOR DEAL WALKS (collections "multipleChoice" and "processes")
A Deal Walk is a process: an ordered list of stages, each asking one multiple-choice question. Write the multiple-choice questions first, then the process that uses them.

multipleChoice item:
${list([
  `"id": starts with "${ID_PREFIX.choice}".`,
  `"category", "subcategory", "title", "prompt": text (category and subcategory up to 80 characters).`,
  `"options": ${MIN_OPTIONS} to ${MAX_OPTIONS} items, each { "id": lowercase letters, digits and hyphens, for example "a", "text": text }. Option IDs are unique within the question. Options are shuffled when shown, so their order carries no meaning.`,
  `"correctOptionId": the "id" of exactly one option. There is one correct answer only.`,
  `"explanation": a non-empty list of paragraphs shown after the learner answers (say why the right answer is right and why the others are not).`,
  `"conceptIds": a non-empty list of concept IDs.`,
])}

processes item:
${list([
  `"id": starts with "${ID_PREFIX.process}". "title": shown in the process list. "description": optional.`,
  `"stages": 1 to ${MAX_STAGES} stages in the order they should be asked. Each stage is { "id": starts with "${ID_PREFIX.stage}", "title": text, "choiceId": the "id" of a multipleChoice item defined in your file }.`,
  `Stage IDs must be unique across every process, not only within this one.`,
])}
MODE RULES
${list([
  "Make the stages follow the real order of the process (for example NDA before CIM before first-round bids).",
  "Wrong options should be plausible but clearly wrong to someone who knows the process.",
  "Every \"choiceId\" must match a multipleChoice \"id\" in the same file or one already in the app; never invent one.",
])}`,
  "three-statements": `FORMAT FOR THREE STATEMENTS (collection "threeStatementExercises")
The learner updates statements for a change, then the app checks their figures against yours. You supply every figure; the app calculates nothing and does not check that the statements balance, so check your own arithmetic: both the starting and corrected figures should balance and ending cash on the cash flow statement should equal cash on the balance sheet.
Each item:
${list([
  `"id": starts with "${ID_PREFIX.statementExercise}". "category", "subcategory", "title": text.`,
  `"instructions": a non-empty list of paragraphs. "assumptions": optional list of { "label", "value" } text pairs (tax rate, treatment, what stays unchanged).`,
  `"units": text such as "$m" (required). "decimals": optional whole number 0 to ${MAX_DECIMALS}. "tolerance": a number greater than 0: how close an entered figure must be to count as correct, for example 0.05.`,
  `"conceptIds": non-empty list of concept IDs.`,
  `"statements": 1 to ${MAX_STATEMENTS} statements, each { "id": starts with "${ID_PREFIX.statement}" (unique in the exercise), "title": text, "rows": 1 to ${MAX_STATEMENT_ROWS} rows }.`,
  `row: { "id": starts with "${ID_PREFIX.row}" and UNIQUE ACROSS THE WHOLE EXERCISE, "label": text, "style": optional "header", "subtotal" or "total", "indent": optional whole number 0 to 3, "original": number (figure shown at the start), "correct": number (figure after the change), "tolerance": optional number overriding the exercise tolerance }.`,
  `A "header" row has NO "original" and NO "correct" (giving them is an error). Every other row, including subtotals and totals, must have both as numbers. Negatives are ordinary negative numbers.`,
  `"steps": 1 to ${MAX_STEPS} worked-solution steps, each { "id": starts with "${ID_PREFIX.step}" (unique in the exercise), "title": text, "text": up to 2000 characters, "rows": optional list of row IDs to highlight, "connections": optional list of { "from": row ID, "to": row ID, "label": optional short text } }. Connection rows must be rows that have figures, and every row ID must exist in the exercise.`,
])}
MODE RULES
${list([
  "Include the subtotals and totals as rows: the learner enters them too.",
  "Rows that do not change should have identical original and correct values.",
  "Steps explain the change in order and may draw arrows between the rows that feed each other.",
])}`,
  valuation: `FORMAT FOR VALUATION BUILDER (collection "valuationExercises")
The learner picks steps from a bank (including steps that do not belong), arranges them and draws directed arrows from each step to the step that depends on it. The app grades the relationships against your accepted solution(s), not positions.
Each item:
${list([
  `"id": starts with "${ID_PREFIX.valuationExercise}". "category", "subcategory", "title": text.`,
  `"task": one sentence saying exactly what to build. "instructions": non-empty list of paragraphs. "assumptions": list of { "label", "value" } pairs (may be empty).`,
  `"conceptIds": non-empty list of concept IDs.`,
  `"steps": 2 to ${MAX_VALUATION_STEPS} steps in the bank, each { "id": starts with "${ID_PREFIX.valuationStep}" (unique in the exercise), "label": the text on the bubble, "detail": optional extra line, "explanation": why it belongs or why it is a distractor }.`,
  `"distractors": list of step IDs that belong in no accepted solution (may be empty). Each must be a step in "steps".`,
  `"solutions": 1 to ${MAX_VALUATION_GRAPHS} accepted solutions, each { "id": starts with "${ID_PREFIX.valuationGraph}", "title": text, "steps": the step IDs this solution uses (never a distractor), "edges": up to ${MAX_GRAPH_EDGES} edges }.`,
  `edge: { "id": starts with "${ID_PREFIX.valuationEdge}" (unique in the exercise), "from": step ID, "to": step ID (both in that solution's steps; "from" must be done before "to"), "explanation": text, "optional": optional true (accepted if drawn, not required), "alternatives": optional list of { "from", "to" } connections that also satisfy this requirement }.`,
])}
MODE RULES
${list([
  "Each solution must be a directed graph with NO CYCLES.",
  "Every step in the bank must be used by at least one solution or be listed as a distractor.",
  "Represent parallel dependencies accurately: steps that do not depend on each other must NOT be chained one after another; draw them as parallel branches that join where both are needed.",
  "Give plausible distractors (real finance steps that do not belong in this process).",
  "Use several solutions only when there are genuinely different accepted methods (for example two terminal value methods).",
])}`,
  "quick-maths": `FORMAT FOR QUICK MATHS (collection "quickMathQuestions")
Hand-authored numeric questions. (The app generates plain arithmetic itself; write finance questions here.)
Each item:
${list([
  `"id": starts with "${ID_PREFIX.quickMath}". "category", "subcategory": text (up to 80 characters; reuse "Arithmetic", "Percentages", "Fractions and decimals", "Multiples" or "EV bridges" to join those categories, or choose your own).`,
  `"difficulty": one of ${DIFFICULTIES.map((d) => `"${d}"`).join(", ")}.`,
  `"conceptIds": non-empty list of concept IDs.`,
  `"prompt": the question (up to 2000 characters). "assumptions": optional list of up to ${MAX_QUICK_MATH_ASSUMPTIONS} { "label", "value" } pairs: state every assumption the answer depends on. "rounding": optional instruction such as "Round to one decimal place."`,
  `"answer": a JSON NUMBER (for example 400 or 0.375), never text.`,
  `"units": optional short text shown beside the answer box, such as "$m", "%", "x", "bps" or "$".`,
  `"tolerance": a number of 0 or more: the learner is correct if within this of the answer. Use 0 when no rounding is involved; otherwise half the last place (0.05 for one decimal place, 0.005 for two).`,
  `"explanation": a short worked solution.`,
])}
MODE RULES
${list([
  "Percentages: with units \"%\" the answer is the percentage figure, so write 25 for 25%, not 0.25. The screen tells the learner to enter 25, not 0.25.",
  "For a decimal or ratio answer such as 0.375, leave units out and say so in the assumptions.",
  "The learner may type 1,234.5, -7.5 or (7.5); your answer is still a plain number.",
  "State units and rounding in the question; keep numbers sensible for mental calculation.",
])}`,
  behavioural: `FORMAT FOR BEHAVIOURAL QUESTIONS (collection "behaviouralQuestions")
Questions and coaching only. Never write a personal answer into the file: the learner writes their own, and it is stored separately and never changed by imports.
Each item:
${list([
  `"id": starts with "${ID_PREFIX.behavioural}". "category": for example "Motivation" or "Experience" (up to 80 characters; the category selector is built from it). "title": short name (up to 200). "prompt": the question as an interviewer would ask it (up to 1000).`,
  `"firm": optional text (up to 80 characters) for a firm-specific prompt.`,
  `"guidance": optional list of 1 to ${MAX_GUIDANCE_PARAGRAPHS} paragraphs of advice.`,
  `"framework": optional { "name": text (up to 40), "steps": ${MIN_FRAMEWORK_STEPS} to ${MAX_FRAMEWORK_STEPS} items each { "label": text, "hint": text } }.`,
  `"checklist": optional list of 1 to ${MAX_CHECKLIST_ITEMS} short self-review items.`,
])}
MODE RULES
${list([
  "Use the STAR framework for questions about past experience (leadership, teamwork, conflict, failure): name \"STAR\" with steps Situation, Task, Action, Result, each with a hint.",
  "Checklist items are statements the learner can tick after practising, for example \"Says what I personally did\".",
  "Do not include model answers or personal details.",
])}`,
  concepts: `FORMAT FOR CONCEPTS AND THE SKILL TREE (collection "concepts")
Concepts are the topics other content refers to. They also draw the Skill Tree.
Each item:
${list([
  `"id": starts with "${ID_PREFIX.concept}". "name": short display name (up to 200 characters). "summary": one or two sentences.`,
  `"prerequisiteIds": optional list of up to ${MAX_PREREQUISITES} concept IDs to learn first. You choose them by hand; do not infer them from text.`,
])}
MODE RULES
${list([
  "Each prerequisite must be a concept defined in your file or in the existing list above. A concept cannot be its own prerequisite.",
  "Prerequisites must not form a cycle, even through concepts that already exist. A pack that creates a cycle is rejected in full.",
  "Importing a concept REPLACES it as a whole: to add a prerequisite to an existing concept, repeat its id, name, summary and its full prerequisiteIds list. Leaving prerequisiteIds out removes the prerequisites it had.",
  "Leave prerequisiteIds out for concepts that need nothing first.",
])}`,
}

/**
 * The complete instructions for one mode: general rules, the mode's format and rules, a real valid example,
 * a final checklist, how the file will be used, and a line for the learner to describe the content they want.
 * `exampleJson` is the text of the mode's example pack; `concepts` is every concept currently in the app.
 */
export function buildInstructions(mode: HelpMode, concepts: readonly ConceptRef[], exampleJson: string): string {
  const info = HELP_MODES.find((m) => m.id === mode)!
  const lines = concepts.map((c) => `${c.id}: ${c.name}`).join("\n")
  return wrap(info, lines, SPECS[mode], exampleJson)
}
