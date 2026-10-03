# Project status

## Completed (v0.1)
- Vite + React + TypeScript app with Tailwind and shadcn/ui; IBM Plex Sans UI with Source Serif 4 for study text.
- Sidebar: Questions, Scenarios, History. Last-open tab is restored.
- Content from local JSON: 10 sample questions, 3 prepared scenarios, 18 concepts, all with stable IDs (`src/content/`).
- Shared `Flashcard`: prompt, optional givens, Reveal answer, full answer, key concepts, optional formulas and statement tables, Again/Hard/Good/Easy.
- Review queue (`src/lib/scheduler.ts`): due weak cards first, then new cards, then other due cards. Again cards return at the end of the session. When nothing is due, "Practise all cards" runs weakest first.
- IndexedDB progress (`src/lib/db.ts`): card states, attempts, sessions. Progress survives reload.
- History: session results (counts by rating) and recent attempts.
- Keyboard shortcuts: Space reveals, 1–4 grade, ignored while typing.
- Verified in a browser with Playwright: reveal, grading by key, advance, no shortcut firing in an input, and persistence after reload. `npm run build` passes.
- Hard rating verified: saves card state (ease 2.5 → 2.35, 12-hour interval), an attempt and the session tally; after reload the card leaves the queue and History shows it.
- Fonts are bundled locally via Fontsource (IBM Plex Sans 400/500/600, Source Serif 4 variable). Verified: no external requests, all faces load, no remote font URLs in the built CSS.
- Committed to local Git as the working foundation.

## Next steps
- Generate the full question and scenario content set, validating IDs and concept references.
- Add content versioning so edited content keeps progress.
- Filters by topic; progress and weak-area summary.
- Export/import of progress for backup.
- Component tests for the scheduler and shortcut handling.
- Other study modes (not started, out of scope for v0.1).

## Known limits
- Scheduler is a simple SM-2 variant with no tuning.
- A session starts at the first grade after opening a deck; reopening starts a new session.
