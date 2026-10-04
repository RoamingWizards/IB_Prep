# IB Prep: offline investment-banking study app

## Stack
React + TypeScript + Vite, Tailwind v4, shadcn/ui (base-nova) components, `idb` for IndexedDB. Keep dependencies minimal.

## Constraints
- Fully offline. No backend, accounts, runtime AI, recording or transcription.
- Prepared finance content is JSON: bundled in `src/content/` plus packs imported in Settings → Content, which are stored in their own IndexedDB database (`ib-prep-content`), never mixed with progress. The pack format is documented in `docs/CONTENT_SCHEMA.md`; check a file with `npm run validate-content -- <file>`. Import only adds or updates by stable ID, never deletes, and never touches progress. Content generation happens separately; do not generate content in the app.
- User progress lives in IndexedDB (`src/lib/db.ts`), separate from content. Records reference content only by stable ID.
- Exercise IDs (`q-…`, `s-…`) and concept IDs (`c-…`) are stable. Never rename or reuse them. Every exercise has a `category` and `subcategory`; topic selectors are derived from these, never hardcoded.
- Questions and Scenarios share one `Flashcard` component. Deal Walk stages share one reusable `MultipleChoice` component (`src/components/MultipleChoice.tsx`); answers are checked by stable option ID, locked after submitting, and saved as objective results in `ib-prep-progress`, apart from flashcard ratings. Walks resume after a restart; one saved result per stage per walk is enforced by a unique index.
- Keyboard: one shared shortcut handler (`src/lib/KeybindsProvider.tsx`) with user-customisable bindings (`src/lib/keybinds.ts`, saved in IndexedDB; defaults Space flips the card both ways, 1–4 grade, Esc collapses the menu; in Deal Walks A–E choose an option and Enter submits or continues). Components attach actions with `useShortcutHandlers`; labels and hints read from the current bindings. Shortcuts must not fire while typing in an input, textarea, select or contenteditable, or while recording a binding. A focused button/link keeps its own Space/Enter activation. Browser/OS-reserved combinations are refused, not promised.
- Interface stays clean, restrained and readable. Prefer standard components.
- Scope: only Questions, Scenarios, Deal Walks, Three Statements, Valuation Builder, Quick Maths, Dashboard, Skill Tree, Behavioural, History and Settings (Keybinds, Content) exist. Do not add other study modes until asked. Deal Walks has no flowmaps. Three Statements renders exercises purely from JSON (`threeStatementExercises`): there is no accounting engine and none is planned. Valuation Builder uses React Flow (`@xyflow/react`) and renders purely from JSON (`valuationExercises`). Quick Maths generates arithmetic-style questions locally and deterministically (`src/lib/quickMathGen.ts`, answers and explanations from the same parameters) and takes hand-authored ones from `quickMathQuestions`; generation and grading (`src/lib/quickMath.ts`) stay separate from the screens. Concept mastery is one deterministic calculation over saved results (`src/lib/mastery.ts`, documented in `docs/MASTERY.md`): self-rated flashcard evidence stays distinguishable from objectively graded results, a concept with no evidence is "Not studied", and it only reads records. No result feeds the scheduler. The Skill Tree (React Flow) draws concepts coloured by that mastery with authored `prerequisiteIds` (optional on a concept, never inferred, cycles rejected on import); mastery never locks a concept. Links that open a practice target must not write the saved study filters. Behavioural keeps the learner's own writing (answers, bullets, sessions, own questions) in progress storage keyed by question ID, never inside content, so content updates cannot touch it; its readiness is separate from concept mastery.

## Desktop packaging
- Apple Silicon macOS only, via Electron + electron-builder (`electron/main.mjs`, `build` in `package.json`, `docs/PACKAGING.md`). The shell only loads `dist/` from a private `app://ibprep/` origin, blocks every other network request, and uses context isolation, sandbox and no Node integration. Keep the browser workflow (`npm run dev`) working; do not add study logic to `electron/`. Storage stays under the stable app ID `com.ibprep.app`.

## Data safety
- Never clear or modify my actual study data for testing. Use an isolated browser profile or test origin with disposable data.

## Design
- Dark desktop theme only: deep green-black with an emerald accent (violet and blue as secondary data colours), modelled on `visual references/36455bfb85742f75882f0759d8be8245.jpg`. The app opens on the Dashboard, an analytics front page (KPI cards, trend charts, mastery breakdown, results by mode). Charts are small hand-written SVG components in `src/components/charts/` (no charting dependency). Colours come only from theme tokens (CSS variables such as `--primary`, `--card`, `--accent-rgb`, `--text-rgb`, `--grade-again`), never hard-coded hex or rgb values in components or styles, because Settings → Appearance lets the user change the background, panel, accent and text colours at run time (`src/lib/theme.ts` derives every token; success, error, warning and info colours are fixed so right and wrong stay distinct). Settings sits at the bottom left of the navigation area and the Import help "?" button at the bottom right; neither may cover content (the main area reserves a right gutter for it). Tokens are in `src/index.css`; shared surface, button and motion styles are in `src/styles/ui.css`; reusable pieces are in `src/components/kit/`. Reuse them for new screens.
- Motion is CSS transforms and transitions. Always provide the reduced-motion fade.
- `visual references/` holds mood references only. Do not copy their branding or add features just because they appear there.

## Commands
- `npm run dev`: local dev server
- `npm run build`: typecheck and production build
- `npm run lint`
- `npm run validate-content -- <pack.json>`: validate a content pack
