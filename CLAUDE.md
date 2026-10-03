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
- Scope: only Questions, Scenarios, Deal Walks, History and Settings (Keybinds, Content) exist. Do not add other study modes until asked. Deal Walks has no flowmaps, and multiple-choice results do not feed mastery or the scheduler.

## Data safety
- Never clear or modify my actual study data for testing. Use an isolated browser profile or test origin with disposable data.

## Design
- Dark desktop theme only. Tokens are in `src/index.css`; shared surface, button and motion styles are in `src/styles/ui.css`; reusable pieces are in `src/components/kit/`. Reuse them for new screens.
- Motion is CSS transforms and transitions. Always provide the reduced-motion fade.
- `visual references/` holds mood references only. Do not copy their branding or add features just because they appear there.

## Commands
- `npm run dev`: local dev server
- `npm run build`: typecheck and production build
- `npm run lint`
- `npm run validate-content -- <pack.json>`: validate a content pack
