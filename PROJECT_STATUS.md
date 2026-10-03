# Project status

Last updated 2026-10-04. Statuses below were checked against the code, not the plan.

## Scope and fixed constraints
- Offline desktop-style study app: React + TypeScript + Vite, local JSON content, progress in IndexedDB (kept separate from content). No backend, accounts or runtime AI.
- Content is generated separately and shipped as JSON; the app never writes content.
- Three-statement scenarios use prepared JSON values and explanations. There is no live accounting engine and none is planned.
- Transcription, recording and automated verbal grading are removed and stay out of scope. Behavioural answers will be self-graded.
- macOS is the target platform; the app is currently a browser app run with Vite.

## Roadmap (build order)

| # | Feature | Status | What the code shows |
|---|---------|--------|---------------------|
| 1 | Topic selectors | **Implemented** | Questions and Scenarios: category, subcategory, mastery filter and session size, all derived from content. Details below. |
| 2 | Content import | **Implemented** | Settings → Content: import and export JSON packs with validation, preview, add/update by ID and separate storage. Schema in `docs/CONTENT_SCHEMA.md`. Details below. |
| 3 | Shared multiple choice | **Implemented** | `MultipleChoice` component, `multipleChoice` content collection with validation, import/export, and saved objective results. Details below. |
| 4 | Deal Walks | **Partial** | Basic mode works: process selector, one multiple-choice question per ordered stage, stage progress, final score, History and resume. Two sample processes (M&A sell-side, IPO). No flowmaps, no mastery link, and no wider content yet. |
| 5 | Three-statement visualiser | **Partial** | Prepared statement tables (`StatementTable` JSON) render inside answers, and one three-statement scenario uses them. There is no visualiser view, linking between statements or step-through. |
| 6 | Quick Maths | **Pending** | Not started. |
| 7 | Shared concept mastery / dashboard | **Partial** | Stable concept IDs (`concepts.json`), `conceptIds` on every exercise, per-card state and a per-card mastery level (new, weak, learning, mastered) used by the selectors. There is no per-concept mastery roll-up and no dashboard. History lists sessions and attempts only. |
| 8 | Skill tree | **Pending** | Not started; depends on concept mastery. |
| 9 | Valuation Builder | **Pending** | Not started. |
| 10 | Bubble chronology exercises | **Pending** | Not started. |
| 11 | Behavioural | **Pending** | Not started. |
| 12 | macOS packaging | **Pending** | No Electron, Tauri or app bundle config. Fonts are bundled locally and no network is needed, which helps. |

Next up: the remaining roadmap items in order (item 5, the three-statement visualiser, is next).

## Already built (outside the numbered roadmap)
- **Questions and Scenarios:** one shared flashcard (prompt, optional givens, 3D flip to the answer, key concepts, formulas, statement tables) with Again/Hard/Good/Easy grading, a simple SM-2 style scheduler and a review queue that puts due weak cards first, then new cards.
- **History:** flashcard sessions and recent attempts, plus (separately) Deal Walk sessions with scores and a list of multiple-choice results.
- **Progress storage:** IndexedDB (`ib-prep-progress`, version 2): card states, attempts, sessions, walks, objective choice attempts and a meta store for settings. Imported content is kept in a different database.
- **Interface:** dark charcoal theme, floating collapsible mode menu (Questions, Scenarios, Deal Walks, History, Settings), study layout that fills the window with long answers scrolling inside the card, reduced-motion fades. Reusable pieces in `src/components/kit/` and `src/styles/ui.css`.
- **Settings → Keybinds:** customisable shortcuts (Flip card, Rate Again/Hard/Good/Easy, Collapse menu) with click-to-record, modifiers, clear, restore defaults, duplicate and reserved-combination messages, persistence, and one shared handler. Space flips the card both ways with an overlap lock. Shortcuts ignore typing fields and recording.
- **Offline:** fonts bundled via Fontsource; no external requests. Content import reads a file the user picks; nothing is fetched.

## Shared multiple choice and Deal Walks (this change)
- **Content model (schemaVersion 1, new optional collections):** `multipleChoice` items (`mc-` IDs; category and subcategory; prompt; 2 to 5 options with stable IDs; `correctOptionId`; explanation paragraphs; concept IDs) and `processes` (`p-` IDs) with an ordered `stages` list (`ps-` stage IDs, each pointing at a multiple-choice question). Documented in `docs/CONTENT_SCHEMA.md`; `docs/example-content-pack.json` now includes two questions and a two-stage process.
- **Sample content:** two full packs in `src/content/packs/` (`ma-sell-side.json`, `ipo.json`), six stages each, bundled with the app (bundled content version now `sample-2`) and valid as import packs. The wording was written for testing and has not been reviewed by a subject expert.
- **Import/export and validation:** MCQs and processes are previewed, imported and exported like other items (new content database stores, version 2, added without touching existing data). Validation covers option IDs (unique, 2 to 5), `correctOptionId` pointing at an option, non-empty ordered stages, unique stage IDs (also across processes), stage `choiceId` references (in the pack or already in the app) and concept references. A pack that omits the new collections is still valid and removes nothing; a pack containing only processes works.
- **`MultipleChoice` component:** prompt, choose one option, Submit, feedback with the correct answer and explanation, Next. Controlled and presentational so other modes can reuse it. Options are locked after submitting. Correctness is decided by option ID.
- **Deal Walks mode:** sidebar entry with a process selector (Start, Resume, Start over, last score). Options are shuffled once per stage and the order is saved with the walk. Stage progress and a progress bar are shown, then a final score with a per-stage list, Walk again and All processes.
- **Saved results:** each submission writes one objective result (session, process, stage and question IDs, concept IDs, selected option ID, correctness, timestamp) and updates the walk in one transaction. A unique index on session and stage makes a second result for the same stage impossible at the database level. A walk still in progress resumes after a restart with its submitted stages shown and locked; only walks in progress are reopened automatically. Starting over retires the earlier unfinished walk of that process (its saved results stay in History).
- **Shortcuts (existing handler):** new customisable actions Choose option A to E (default A to E) and Submit / next stage (default Enter), listed in Settings → Keybinds with the usual conflict checks. They are active only inside a walk, ignored while typing, and a focused button keeps its own Enter.

## Verification of multiple choice and Deal Walks (Playwright, `npm run build` passes)
All on separate test origins (localhost:5176 and 5177) with disposable data; the real study data was not touched.
- Correct and incorrect submissions (verdict, correct option marked, explanation shown); correctness decided by ID; answers locked after submitting.
- Shuffling: stage 1 showed a different order from the file, and 8 restarts produced 7 distinct orders; the stored order matched the displayed order and survived reloads.
- Duplicate protection: two Enter presses plus two Submit clicks produced exactly one saved result; a direct duplicate write was refused by the database (ConstraintError).
- Reload and resume: mid-stage (answered, Next not pressed), mid-walk (selector Resume) and reload inside a walk all returned to the right stage with submitted stages locked and no duplicate attempts.
- Full walk: 4 of 6 final score with a per-stage list; History showed the walk and 6 results in tables separate from flashcard sessions and ratings.
- Shortcuts: letter keys and Enter work; rebinding option B to Q updated the marker and behaviour; flashcard keys do nothing in a walk; the typing guard held.
- Import/export: invalid packs (unknown stage question, bad `correctOptionId`, duplicate option ID, stage ID owned by another process, unknown concept) were rejected with nothing stored; the v2 example imported with a preview listing the new types and its process ran; a process-only pack and an older version-1 pack imported without removing anything; the export passed the command-line validator and re-imported as 67 unchanged items.
- Upgrade path: version-1 progress and content databases with data were upgraded to version 2 with every record intact and the old imported question still in the selectors.

## Content import and export
- **Schema:** documented in `docs/CONTENT_SCHEMA.md` (schemaVersion 1, `contentVersion`, stable `q-`/`s-`/`c-` IDs, required `category` and `subcategory`, optional givens, formulas and prepared statement tables). A valid example is `docs/example-content-pack.json`. Topics are never inferred from text. `npm run validate-content -- <file>` runs the same validator from the command line (it resolves concept references against the pack and the bundled concepts only).
- **Settings → Content:** shows the current content version and counts; **Import pack…** and **Export content bank**.
- **Validation (all problems listed, with locations):** JSON syntax, schemaVersion, contentVersion, required fields and types, ID format and prefix, `kind` matching its list, duplicate IDs within the pack, concept references (must exist in the pack or the current bank), table shapes (value count must equal column count), size limit (5 MB). Unknown fields only warn. An invalid file is rejected as a whole and nothing is stored.
- **Preview before confirming:** lists additions, updates (naming the changed fields), the unchanged count and the new topics the selectors will show. Cancel stores nothing. Confirm is disabled when nothing would change.
- **Merge rules:** add or update by ID (bundled items can be updated too); items absent from a pack are never deleted; progress and History are untouched (they refer to exercises by ID and live in `ib-prep-progress`).
- **Storage:** imported items, an import log and a sequence counter live in `ib-prep-content` (stores `concepts`, `exercises`, `imports`, `meta`). Writes happen in one transaction, so a failure rolls everything back.
- **Export:** downloads the current bank (bundled plus imports) as a pack. Re-importing it shows every item unchanged.
- **Wiring:** `ContentProvider` merges bundled and imported content and serves it through `useContent()`. Questions, Scenarios, History, the flashcard concept badges and the topic selectors all read from it, so imported categories and subcategories appear in the selectors automatically.

## Verification of content import (Playwright, `npm run build` passes)
All run on a separate origin (localhost:5175) with disposable data; the real study data was not touched.
- Rejected without any change: a file with several problems (missing category, table width mismatch, duplicate ID, unknown concept), malformed JSON, and schemaVersion 2. After each, the content database was still empty.
- Valid pack: preview showed 5 additions and the new topic; Cancel stored nothing; Confirm stored exactly those 5 items and updated the version and counts.
- The imported category and subcategory appeared in the Questions and Scenarios selectors; imported cards studied correctly, with imported concept names (and a mix of imported and bundled concepts) on the answer face.
- Update pack: preview named the changed fields for one imported and one bundled question; Confirm replaced them; the progress and attempt records were byte-identical before and after; items absent from the pack were kept; a repeated identical item counted as unchanged.
- After a reload: content, updates, selector categories and History titles all persisted.
- Export: the downloaded file passed the command-line validator, and re-importing it showed all 36 items unchanged.
- Failure injection: a database write forced to fail part-way rolled the whole import back (a concept written first was undone, the version and import log unchanged) and the app showed "Import failed".
- One unexplained observation: once, the app showed the Settings tab right after starting a session, and I could not reproduce it in three replays of the same steps, so I have no cause or fix for it.

## Topic selectors
- **Schema:** exercises now carry `category` and `subcategory` instead of the single `topic` field (stable IDs unchanged, so saved progress is untouched). All 13 sample exercises were mapped. Content generation must supply both fields.
- **Derived, not hardcoded:** categories and subcategories (with counts) are built from the loaded content in first-appearance order (`topicTree` in `src/lib/selection.ts`). Verified by temporarily adding a new category and a new subcategory: both appeared in the panel without code changes (the content file was then restored).
- **UI:** a Filters button in the study header opens a panel with Category, Subcategory (enabled once a category is chosen), Mastery and Session size, a live "N cards in this session" count, Reset and Start session. The button shows how many filters are active. Choices are held as a draft until Start session. Shortcuts for the card pause while the panel is open.
- **Mastery filter:** Due and new (default, exactly the previous review queue), New, Weak, Learning, Mastered, All cards. Each option shows how many cards it would give within the chosen topic. Weak means last rated Again or Hard; Mastered means a next interval of 21 days or more; everything else reviewed is Learning. Choosing a specific level includes those cards whether or not they are due, weakest and newest first.
- **Session size:** 5, 10, 20 or all matching cards. It limits the cards at session start; a card rated Again still returns at the end of the session.
- **Persistence:** the selection is saved per deck (`selection:question`, `selection:scenario`) and repaired against current content on load, so a removed topic cannot break a session.
- **Empty states:** "Session complete", "Nothing due" and "No cards match", each with Practise all cards, Review due cards (when some are due) and Change filters.
- **Header:** now reads category, then subcategory and deck, for example "Valuation DCF · Questions".
- **Preserved and checked:** scheduler, keybinds, card flip and grading, History and existing saved progress. With default filters the queue matched the old behaviour on a seeded set (weak due card first, then new, then other due).

## Verification of the selectors (Playwright, `npm run build` passes)
- Default queue and counts on a seeded database (new 5, weak 2, learning 2, mastered 1, due and new 7).
- Category and subcategory options and counts follow the content; subcategory options change with the category.
- Valuation → DCF session had exactly the 3 DCF cards; an Again card returned at the end; header and filter count correct; session completion state.
- Selection restored after reload; Scenarios keeps its own selection and its own categories.
- Mastery filter Weak returned the 2 weak cards weakest first; size 5 limited All cards to 5 and was capped by availability for Weak; "No cards match" state after the weak cards were cleared.
- Card shortcuts paused while the panel was open and resumed after it closed.
- Tests ran on a separate origin (localhost:5174) with its own seeded storage so existing saved progress was not touched.

## Known limits
- Multiple-choice results are saved and shown in History but do not feed concept mastery or the scheduler (mastery roll-ups are roadmap item 7).
- Questions have exactly one correct option; a stage cannot offer multiple correct answers or free text.
- Deal Walks has no flowmaps or branching; stages run in the listed order.
- The two sample processes have only the six questions each; they are test content, not a question bank.
- If a tab running an older version of the app is still open, the database upgrade waits until that tab is closed or reloaded.
- Changing an option ID in an updated question does not rewrite results already saved; History shows the chosen option's ID if its text no longer exists.
- Import is merge-only: there is no way to remove an item or a category through the app. An imported update to a bundled item takes priority over any later edit to the bundled JSON.
- `contentVersion` is only a label; the app does not compare versions or block re-importing an older pack.
- Validation checks structure, IDs and references, not whether the finance content is correct.
- Mastery thresholds (for example 21 days) are fixed constants, not settings.
- Category and subcategory names are free text in the content; a spelling difference creates a separate topic.
- Pressing Escape with the Filters panel open also runs "Collapse menu" if Escape is bound to it; the panel closes by clicking outside it, Start session, or the Filters button.
- Reserved-combination detection for keybinds is best effort; some combinations never reach the page.
- Bindings are tied to physical keys, so a different keyboard layout may need re-recording.
- Grade buttons stay disabled until the answer is showing.
- The scheduler is a simple SM-2 variant with no tuning. A session starts at the first grade after opening a deck or applying filters.
- Lint warns in shadcn-generated files and that `SlideStage.tsx` exports a hook beside a component.
