# IB Prep: offline investment-banking study app

## Stack
React + TypeScript + Vite, Tailwind v4, shadcn/ui (base-nova) components, `idb` for IndexedDB. Keep dependencies minimal.

## Constraints
- Fully offline. No backend, accounts, runtime AI, recording or transcription.
- Prepared finance content is local JSON in `src/content/` (read-only at runtime). Content generation happens separately; do not generate content in the app.
- User progress lives in IndexedDB (`src/lib/db.ts`), separate from content. Records reference content only by stable ID.
- Exercise IDs (`q-…`, `s-…`) and concept IDs (`c-…`) are stable. Never rename or reuse them.
- Questions and Scenarios share one `Flashcard` component.
- Keyboard: Space reveals, 1–4 grade (Again/Hard/Good/Easy). Shortcuts must not fire while typing in an input, textarea, select or contenteditable.
- Interface stays clean, restrained and readable. Prefer standard components.
- Scope: only Questions, Scenarios and History exist. Do not add other study modes until asked.

## Design
- Dark desktop theme only. Tokens are in `src/index.css`; shared surface, button and motion styles are in `src/styles/ui.css`; reusable pieces are in `src/components/kit/`. Reuse them for new screens.
- Motion is CSS transforms and transitions. Always provide the reduced-motion fade.
- `visual references/` holds mood references only. Do not copy their branding or add features just because they appear there.

## Commands
- `npm run dev`: local dev server
- `npm run build`: typecheck and production build
- `npm run lint`
