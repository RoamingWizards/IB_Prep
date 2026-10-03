# Content pack schema (schemaVersion 1)

A content pack is one JSON file holding concepts, questions, scenarios, multiple-choice questions and deal processes. The app imports packs from **Settings → Content** and exports its current content in the same format, so an export can be edited and imported back.

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

Every collection is optional and a collection left out is simply empty. Because import only adds and updates, **leaving a collection out never removes anything**: a pack with only `processes` leaves all questions, scenarios and concepts as they are. Packs written before multiple-choice questions and processes existed are still valid `schemaVersion` 1 packs. A pack must contain at least one item. Unknown fields produce a warning and are ignored; they are not stored.

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

### Statement table

Tables hold prepared numbers and layout. The app does not calculate anything from them.

| Field | Required | Notes |
|-------|----------|-------|
| `title` | yes | |
| `unit` | no | For example `"$m"`. |
| `columns` | yes | Non-empty list of column headings. |
| `rows` | yes | Non-empty list of rows. |

Row fields: `label` (required text), `values` (required; one number or `null` per column, so its length must equal the number of columns), `style` (optional: `"subtotal"` or `"total"`), `format` (optional: `"number"`, `"percent"` where `0.246` shows as 24.6%, or `"multiple"` where `3` shows as 3.0x).

## IDs

- Lowercase letters, digits and hyphens only, up to 80 characters: `q-dcf-001`, `s-lbo-001`, `c-wacc`, `mc-ipo-001`, `p-ipo`, `ps-ipo-01`.
- The prefix must match the type: `q-` questions, `s-` scenarios, `c-` concepts, `mc-` multiple-choice questions, `p-` processes, `ps-` stages.
- IDs are permanent. Saved progress and History refer to an exercise, question, process or stage by its ID, so never rename or reuse one. Option IDs are permanent too: saved results store the option that was chosen.

## How import works

1. The file is parsed and validated completely. Problems are listed with their location (for example `questions[3] (q-dcf-004).conceptIds: unknown concept "c-foo"`).
   - Checked: JSON syntax, `schemaVersion`, `contentVersion`, required fields and types, ID format and prefix, `kind`, duplicate IDs within the pack (stage IDs included), concept references, table shapes, and for multiple choice: 2 to 5 options, unique option IDs, and a `correctOptionId` that is one of them. For processes: a non-empty stage list, unique stage IDs, a `choiceId` that points at a known question, and stage IDs that don't already belong to a different process.
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
