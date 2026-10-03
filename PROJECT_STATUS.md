# Project status

Last updated 2026-10-03. Statuses below were checked against the code, not the plan.

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
| 2 | Content import | **Pending** | Content is bundled JSON in `src/content/` read at build time. There is no import flow, schema validation beyond a dev-only console check, or content versioning. |
| 3 | Shared multiple choice | **Pending** | No multiple-choice type, component or content schema exists. |
| 4 | Deal Walks | **Pending** | Not started. The existing Scenarios mode is flashcard-style (prompt with givens, then answer) and is not a Deal Walk. |
| 5 | Three-statement visualiser | **Partial** | Prepared statement tables (`StatementTable` JSON) render inside answers, and one three-statement scenario uses them. There is no visualiser view, linking between statements or step-through. |
| 6 | Quick Maths | **Pending** | Not started. |
| 7 | Shared concept mastery / dashboard | **Partial** | Stable concept IDs (`concepts.json`), `conceptIds` on every exercise, per-card state and a per-card mastery level (new, weak, learning, mastered) used by the selectors. There is no per-concept mastery roll-up and no dashboard. History lists sessions and attempts only. |
| 8 | Skill tree | **Pending** | Not started; depends on concept mastery. |
| 9 | Valuation Builder | **Pending** | Not started. |
| 10 | Bubble chronology exercises | **Pending** | Not started. |
| 11 | Behavioural | **Pending** | Not started. |
| 12 | macOS packaging | **Pending** | No Electron, Tauri or app bundle config. Fonts are bundled locally and no network is needed, which helps. |

Next up: content import (item 2), then shared multiple choice.

## Already built (outside the numbered roadmap)
- **Questions and Scenarios:** one shared flashcard (prompt, optional givens, 3D flip to the answer, key concepts, formulas, statement tables) with Again/Hard/Good/Easy grading, a simple SM-2 style scheduler and a review queue that puts due weak cards first, then new cards.
- **History:** session results and recent attempts.
- **Progress storage:** IndexedDB (`ib-prep-progress`): card states, attempts, sessions and a meta store for settings.
- **Interface:** dark charcoal theme, floating collapsible mode menu (Questions, Scenarios, History, Settings), study layout that fills the window with long answers scrolling inside the card, reduced-motion fades. Reusable pieces in `src/components/kit/` and `src/styles/ui.css`.
- **Settings → Keybinds:** customisable shortcuts (Flip card, Rate Again/Hard/Good/Easy, Collapse menu) with click-to-record, modifiers, clear, restore defaults, duplicate and reserved-combination messages, persistence, and one shared handler. Space flips the card both ways with an overlap lock. Shortcuts ignore typing fields and recording.
- **Offline:** fonts bundled via Fontsource; no external requests.

## Topic selectors (this change)
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
- Mastery thresholds (for example 21 days) are fixed constants, not settings.
- Category and subcategory names are free text in the content; a spelling difference creates a separate topic.
- Pressing Escape with the Filters panel open also runs "Collapse menu" if Escape is bound to it; the panel closes by clicking outside it, Start session, or the Filters button.
- Reserved-combination detection for keybinds is best effort; some combinations never reach the page.
- Bindings are tied to physical keys, so a different keyboard layout may need re-recording.
- Grade buttons stay disabled until the answer is showing.
- The scheduler is a simple SM-2 variant with no tuning. A session starts at the first grade after opening a deck or applying filters.
- Lint warns in shadcn-generated files and that `SlideStage.tsx` exports a hook beside a component.
