# Content pack schema (schemaVersion 1)

A content pack is one JSON file holding concepts, questions and scenarios. The app imports packs from **Settings → Content** and exports its current content in the same format, so an export can be edited and imported back.

A complete valid example is in [`example-content-pack.json`](./example-content-pack.json). The bundled content in `src/content/` follows the same field rules.

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

A pack must contain at least one item. Unknown fields produce a warning and are ignored; they are not stored.

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

- Lowercase letters, digits and hyphens only, up to 80 characters: `q-dcf-001`, `s-lbo-001`, `c-wacc`.
- The prefix (`q-`, `s-`, `c-`) must match the type.
- IDs are permanent. Saved progress and History refer to an exercise by its ID, so never rename or reuse one.

## How import works

1. The file is parsed and validated completely. Problems are listed with their location (for example `questions[3] (q-dcf-004).conceptIds: unknown concept "c-foo"`).
   - Checked: JSON syntax, `schemaVersion`, `contentVersion`, required fields and types, ID format and prefix, `kind`, duplicate IDs within the pack, concept references, and table shapes.
   - **An invalid file is rejected as a whole and nothing is stored.**
2. A preview lists what would be **added** (new ID), **updated** (existing ID, different content, with the changed fields named) and **unchanged**, plus any topics the pack introduces.
3. Nothing is stored until you confirm. Confirming writes all additions and updates in a single transaction, so either everything is stored or nothing is.

Rules for what an import does:

- **Add or update by ID.** An existing ID is replaced by the pack's version, whether that item was bundled or imported earlier.
- **Never deletes.** Items missing from a pack are kept. There is no removal through import.
- **Progress and History are untouched.** They live in a separate database and refer to exercises by ID. An updated exercise keeps its schedule and history.
- **Stored separately.** Imported content is kept in its own IndexedDB database (`ib-prep-content`), apart from progress (`ib-prep-progress`).
- Imported items are listed after the bundled ones, in the order first imported; updated bundled items keep their place.

## Export

**Export content bank** downloads everything currently available (bundled content with imports applied) as a pack with the current `contentVersion`. Importing that file back shows every item as unchanged.

## Authoring tips

- One pack per batch of related content is easiest to review in the preview.
- Update an exercise by repeating its ID with the corrected fields. Re-importing a pack is safe: identical items show as unchanged.
- Give each pack a new `contentVersion` so the version shown in Settings tells you which import you last applied.
