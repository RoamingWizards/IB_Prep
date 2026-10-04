# Content pack schema (schemaVersion 1)

A content pack is one JSON file holding concepts, questions, scenarios, multiple-choice questions, deal processes and three-statement exercises. The app imports packs from **Settings → Content** and exports its current content in the same format, so an export can be edited and imported back.

A complete valid example is in [`example-content-pack.json`](./example-content-pack.json). The bundled content in `src/content/` follows the same field rules. Two complete multiple-choice examples with processes are in `src/content/packs/`: `ma-sell-side.json` (M&A sell-side) and `ipo.json` (IPO), six stages each.

Check a pack without opening the app:

```
npm run validate-content -- path/to/pack.json
```

The command uses the same validator as the app. It resolves concept references against the pack and the bundled concepts only. The app also resolves them against anything you have already imported.

## Pack

| Field | Required | Type | Notes |
|-------|----------|------|-------|
| `schemaVersion` | yes | number | Must be `1`. Other values are rejected. |
| `contentVersion` | yes | text, up to 64 characters | Your label for this pack, such as `"2026.10.1"`. The app shows the most recently imported one. It is not compared against earlier versions. |
| `title` | no | text | Shown in the import preview. |
| `description` | no | text | |
| `exportedAt` | no | text | Written by export. Ignored on import. |
| `concepts` | no | list | See Concept. |
| `questions` | no | list | See Exercise. Every item must have `"kind": "question"`. |
| `scenarios` | no | list | See Exercise. Every item must have `"kind": "scenario"`. |
| `multipleChoice` | no | list | See Multiple-choice question. |
| `processes` | no | list | See Process. |
| `threeStatementExercises` | no | list | See Three-statement exercise. |

Every collection is optional and a collection left out is simply empty. Because import only adds and updates, **leaving a collection out never removes anything**: a pack with only `processes`, or only `threeStatementExercises`, leaves everything else as it is, and a pack without `threeStatementExercises` leaves existing three-statement exercises untouched. Packs written before multiple-choice questions, processes and three-statement exercises existed are still valid `schemaVersion` 1 packs. A pack must contain at least one item. Unknown fields produce a warning and are ignored; they are not stored.

## Concept

| Field | Required | Notes |
|-------|----------|-------|
| `id` | yes | Starts with `c-`. |
| `name` | yes | Short display name, up to 200 characters. |
| `summary` | yes | One or two sentences. |

## Exercise (question or scenario)

| Field | Required | Notes |
|-------|----------|-------|
| `id` | yes | Starts with `q-` for questions and `s-` for scenarios. |
| `kind` | yes | `"question"` or `"scenario"`, matching the list it is in. |
| `category` | yes | Broad area, for example `"Valuation"`. Up to 80 characters. |
| `subcategory` | yes | Narrower topic within the category, for example `"DCF"`. Up to 80 characters. |
| `title` | yes | Short label shown on the card and in History. |
| `prompt` | yes | The question or situation. |
| `answer` | yes | Non-empty list of text paragraphs. |
| `conceptIds` | yes | Non-empty list of concept IDs. Each must exist in the pack or already in the app. |
| `givens` | no | List of `{ "label", "value" }` text pairs shown under the prompt (typically scenarios). |
| `formulas` | no | List of `{ "label", "expression" }` text pairs shown on the answer. |
| `tables` | no | List of prepared statement tables (below). |

**Category and subcategory are metadata you supply.** The app never infers topics from the title, prompt or answer. The topic selectors (category, subcategory, counts) are built from these two fields, so an imported category appears in Questions or Scenarios automatically. Spelling and capitalisation must match exactly: `"DCF"` and `"Dcf"` are different subcategories.

## Multiple-choice question

One question with a single correct answer. It is used by Deal Walk stages, and any future mode can reuse it.

| Field | Required | Notes |
|-------|----------|-------|
| `id` | yes | Starts with `mc-`. |
| `category`, `subcategory` | yes | Same metadata as exercises. Never inferred. |
| `title` | yes | Short label. |
| `prompt` | yes | The question. |
| `options` | yes | 2 to 5 options, each `{ "id", "text" }`. Option IDs are lowercase letters, digits and hyphens (for example `"a"`), unique within the question. Options are shuffled when shown, so their order in the file carries no meaning. |
| `correctOptionId` | yes | Must be the `id` of one of the options. Answers are checked by this ID, never by position or text. |
| `explanation` | yes | Non-empty list of paragraphs shown after the answer is submitted. |
| `conceptIds` | yes | Non-empty list of concept IDs, resolved like an exercise's. |

## Process and stages

A process is an ordered list of stages; each stage asks one multiple-choice question.

| Field | Required | Notes |
|-------|----------|-------|
| `id` | yes | Starts with `p-`. |
| `title` | yes | Shown in the process selector. |
| `description` | no | One or two sentences. |
| `stages` | yes | Ordered list of 1 to 50 stages. The array order is the order shown. |

Stage fields: `id` (starts with `ps-`; unique across **all** processes, because saved results refer to it), `title` (shown in stage progress and the final score) and `choiceId` (the `mc-` ID of the question asked at this stage; it must be defined in the pack or already in the app).

## Statement table in a flashcard answer

This is the small prepared table that an ordinary question or scenario can show with its answer. It is separate from the three-statement exercises below.

Tables hold prepared numbers and layout. The app does not calculate anything from them.

| Field | Required | Notes |
|-------|----------|-------|
| `title` | yes | |
| `unit` | no | For example `"$m"`. |
| `columns` | yes | Non-empty list of column headings. |
| `rows` | yes | Non-empty list of rows. |

Row fields: `label` (required text), `values` (required; one number or `null` per column, so its length must equal the number of columns), `style` (optional: `"subtotal"` or `"total"`), `format` (optional: `"number"`, `"percent"` where `0.246` shows as 24.6%, or `"multiple"` where `3` shows as 3.0x).

## Three-statement exercise

An exercise in which the learner updates an income statement, a cash flow statement and a balance sheet for a change, then checks their figures. Everything the screen shows comes from this data, so a new exercise needs no code. The complete depreciation exercise in `src/content/packs/three-statements-depreciation.json` is both the importable example and the reference for the format.

The figures are prepared by the author. The app does not calculate statements or check that they balance, so **verify your own exercise**: both the starting and the corrected figures should balance, and ending cash on the cash flow statement should equal cash on the balance sheet.

| Field | Required | Notes |
|-------|----------|-------|
| `id` | yes | Starts with `ts-`. |
| `category`, `subcategory` | yes | Same metadata as exercises. Never inferred. |
| `title` | yes | Shown in the selector, History and the exercise. |
| `instructions` | yes | Non-empty list of paragraphs shown above the statements. |
| `assumptions` | no | List of `{ "label", "value" }` pairs, for example the tax rate and its treatment. |
| `units` | yes | For example `"$m"`. Shown as "All figures are in $m." |
| `decimals` | no | Whole number 0 to 4. Figures are shown to this many places. Default 1. |
| `tolerance` | yes | Number greater than 0. A figure is correct if it is within this of the correct value. |
| `conceptIds` | yes | Non-empty list of concept IDs, resolved like an exercise's. |
| `statements` | yes | Ordered list of 1 to 6 statements, shown side by side where they fit. |
| `steps` | yes | Ordered list of 1 to 40 explanation steps for the worked solution. |

**Statement:** `id` (starts with `st-`, unique within the exercise), `title` and `rows` (ordered list of 1 to 80 rows).

**Row:** `id` (starts with `r-`, **unique across the whole exercise**, because steps refer to rows by ID), `label`, optional `style`, optional `indent` (0 to 3) and the figures.

| Row field | Notes |
|-----------|-------|
| `style` | `"header"` for a section heading, `"subtotal"` or `"total"` for rule lines. Leave out for a normal line. |
| `original` | The figure shown at the start. Required on every row except headers. |
| `correct` | The figure after the change. Required on every row except headers. Totals and subtotals are rows like any other, and the learner enters them too. |
| `tolerance` | Optional. Overrides the exercise tolerance for this row. |

A header row has no figures and no input; giving it `original` or `correct` is an error. Negatives are ordinary negative numbers (`-7.5`); the screen shows them in brackets.

**Step:** `id` (starts with `step-`, unique within the exercise), `title`, `text` (up to 2000 characters), optional `rows` (row IDs to highlight) and optional `connections` (arrows). A connection is `{ "from", "to", "label" }`, where `from` and `to` are IDs of rows that have figures and `label` is optional short text. Only the current step's rows and connections are shown. Wide layouts draw numbered curved arrows; narrow layouts show the same numbers as markers on the rows.

### How an attempt is graded

- Each figure is **correct** if it is within tolerance of its `correct` value.
- A figure is a **required change** if its `correct` value differs from its `original` by more than the tolerance. Entering it correctly is a **completed** required change; anything else (left unchanged, wrong, blank or not a number) is a **missed** change.
- A figure that needed no change but was altered, and so is wrong, is an **unnecessary change**.
- Blank and non-numeric entries are accepted at submission and marked incorrect. Entries such as `1,234.5`, `-7.5` and `(7.5)` are read as numbers.
- All wrong figures are marked in red, including required figures the learner left unchanged.

### Three Statements attempts

An attempt is progress, not content, so it is never part of a pack. Each attempt keeps **its own copy of the exercise** as it was when the attempt began. Updating an exercise by import never changes an attempt already started or submitted; **Try again** starts a new attempt from the current content. Unfinished entries are saved as you type and come back after a restart. A submitted attempt is saved once, with its figures, grade and time, and appears in History apart from flashcard ratings.

## Valuation exercise

A "build the process" exercise: the learner picks steps from a bank (distractors included), arranges them as bubbles on a canvas, draws directed connections and submits. The complete DCF exercise in `src/content/packs/valuation-dcf.json` is both the importable example and the reference. Put exercises in the optional `valuationExercises` collection; a pack that omits it leaves existing valuation exercises untouched.

| Field | Required | Notes |
|-------|----------|-------|
| `id` | yes | Starts with `vx-`. |
| `category`, `subcategory`, `title` | yes | Same metadata as exercises. |
| `task` | yes | One sentence saying exactly what to build. |
| `instructions` | yes | Non-empty list of paragraphs shown above the canvas. |
| `assumptions` | no | List of `{ "label", "value" }` pairs. |
| `conceptIds` | yes | Non-empty, resolved like an exercise's. |
| `steps` | yes | The whole bank, 2 to 40 steps: `id` (`vs-`, unique in the exercise), `label` (text on the bubble), optional `detail`, and `explanation`. |
| `distractors` | yes | Step IDs that belong in no accepted solution (may be empty). Each must exist in `steps`. |
| `solutions` | yes | 1 to 5 accepted graphs. |

**Solution graph:** `id` (`vg-`), `title`, `steps` (IDs the solution uses, none of them distractors) and `edges` (up to 120). **Edge:** `id` (`ve-`, unique in the exercise), `from`, `to` (both in the graph's `steps`; `from` is done before `to`), `explanation`, optional `optional: true` (accepted if drawn, not required) and optional `alternatives` (a list of `{ "from", "to" }` that also satisfy this requirement). A graph must be acyclic. Parallel branches are simply steps with no path between them; do not force them into a line.

Every step and connection reference is validated; each step in the bank must be used by a solution or listed as a distractor.

### How an attempt is graded

- The submission is compared with each accepted graph and the closest one is used.
- **Missing steps:** required steps not placed. **Distractors:** distractor steps placed. **Extra steps:** placed steps in neither group.
- A required connection is **correct** if the learner drew it (or one of its `alternatives`) in the right direction. Otherwise it is **missing**.
- A drawn connection that satisfies nothing is **incorrect**, marked as reversed, unsupported, or involving a step not in the solution. Optional connections are never penalised.
- Positions are never graded. The attempt is perfect when nothing is missing, extra or incorrect.

### Valuation attempts

Each attempt keeps its own copy of the exercise; importing an update never changes an attempt already started. Placements and connections are saved as drafts and restored after a restart. A submission is saved once, with the diagram, grade and time, and appears in History apart from flashcard ratings.

## IDs

- Lowercase letters, digits and hyphens only, up to 80 characters: `q-dcf-001`, `s-lbo-001`, `c-wacc`, `mc-ipo-001`, `p-ipo`, `ps-ipo-01`, `ts-depreciation-001`, `st-income`, `r-is-dep`, `step-01`.
- The prefix must match the type: `q-` questions, `s-` scenarios, `c-` concepts, `mc-` multiple-choice questions, `p-` processes, `ps-` stages, `ts-` three-statement exercises, `st-` statements, `r-` rows and `step-` explanation steps.
- IDs are permanent. Saved progress and History refer to an exercise, question, process or stage by its ID, so never rename or reuse one. Option IDs are permanent too: saved results store the option that was chosen.

## How import works

1. The file is parsed and validated completely. Problems are listed with their location (for example `questions[3] (q-dcf-004).conceptIds: unknown concept "c-foo"`).
   - Checked: JSON syntax, `schemaVersion`, `contentVersion`, required fields and types, ID format and prefix, `kind`, duplicate IDs within the pack (stage IDs included), concept references, table shapes, and for multiple choice: 2 to 5 options, unique option IDs, and a `correctOptionId` that is one of them. For processes: a non-empty stage list, unique stage IDs, a `choiceId` that points at a known question, and stage IDs that don't already belong to a different process. For three-statement exercises: finite numeric `original` and `correct` figures, a tolerance above 0, unique statement, row and step IDs, and explanation steps whose rows and connections all point at rows that exist (connections only at rows with figures).
   - **An invalid file is rejected as a whole and nothing is stored.**
2. A preview lists what would be **added** (new ID), **updated** (existing ID, different content, with the changed fields named) and **unchanged**, plus any topics the pack introduces.
3. Nothing is stored until you confirm. Confirming writes all additions and updates in a single transaction, so either everything is stored or nothing is.

Rules for what an import does:

- **Add or update by ID.** An existing ID is replaced by the pack's version, whether that item was bundled or imported earlier.
- **Never deletes.** Items missing from a pack are kept. There is no removal through import.
- **Progress and History are untouched.** They live in a separate database and refer to content by ID. An updated exercise keeps its schedule and history. Deal Walk results already saved (process, stage and option IDs, correctness) are never rewritten by an import; if an updated question changes its options, older results still show the option that was chosen at the time.
- **Stored separately.** Imported content is kept in its own IndexedDB database (`ib-prep-content`), apart from progress (`ib-prep-progress`).
- Imported items are listed after the bundled ones, in the order first imported; updated bundled items keep their place.

## Deal Walk results

Results are progress, not content, so they are never part of a pack. Each submitted stage is saved in History with the walk's session ID, the process, stage and question IDs, the question's concept IDs, the selected option ID, whether it was correct and a timestamp. A walk that is still in progress is saved too and resumes after a restart.

## Export

**Export content bank** downloads everything currently available (bundled content with imports applied) as a pack with the current `contentVersion`. Importing that file back shows every item as unchanged.

## Authoring tips

- One pack per batch of related content is easiest to review in the preview.
- Update an exercise by repeating its ID with the corrected fields. Re-importing a pack is safe: identical items show as unchanged.
- Give each pack a new `contentVersion` so the version shown in Settings tells you which import you last applied.
