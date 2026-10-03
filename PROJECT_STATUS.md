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

## Desktop design pass (v0.2)
- Dark charcoal theme with panels a step lighter, hairline borders, soft shadows and restrained blue/violet glows. Serif (Source Serif 4) for questions, IBM Plex Sans for controls and answers. References were in `visual references/` (used for mood only; no branding or content copied).
- Mode menu is a floating rounded panel (Questions, Scenarios, History only; no title). A hamburger square at its top collapses it to a small three-line square, and Escape also collapses it. When collapsed the study area widens (860px to 1120px max). Open/closed state and last mode are saved in IndexedDB.
- Content column is centred; compact header with topic, "Card n of N" and a progress bar.
- Study card flips around its vertical axis (about 420 ms, back face hidden so text is never mirrored) on card click or Space. The answer face has its own scroll area and a Show question button. Clicking, selecting or scrolling answer text does not flip it; a drag-selection on the question face does not flip it either.
- Four labelled grade buttons (Again/Hard/Good/Easy) below the card: tinted, glow on hover, press-in and bright flash on activation. Mouse and keyboard share one code path, so feedback is identical.
- After grading the card slides left out of the study area and the next enters from the right; sidebar and header stay still. Rating is saved once before the slide; input is locked during the transition; the next card starts on its question face.
- `prefers-reduced-motion`: flip and slide become a 160 ms fade.
- Reusable components in `src/components/kit/`: `Panel`, `GlowButton`, `ProgressBar`, `FlipCard`, `SlideStage` + `useSlideSequence`. Styles in `src/styles/ui.css`. No animation dependency added (CSS transforms and transitions only).
- Content, IndexedDB schema, scheduler and History logic unchanged; History restyled with the same panels.
- Verified with Playwright: flip by click and Space (angle sampled through the turn), all four ratings saved once each, keyboard feedback timeline (flash and pressed on key press), 8 rapid inputs produced exactly 1 saved rating, text selection did not flip, long answer scrolls to the end at 1000×600, resize to 720×720 and 1280×820, reduced-motion fade, and persistence after reload (queues, Again card first, History). Build passes.
- Not re-run in the browser after the final tidy of the session-update code in `StudyView.tsx` (an immutability lint fix); the build passes.

## Floating menu pass
- Replaced the sidebar with the floating collapsible menu described above and removed the in-window "IB Prep" title (the browser tab title is still "IB Prep").
- Verified with Playwright at 1280×820 and 760×700: collapse/expand, collapsed state restored after reload, switching modes, Escape, Space reveal still works, no overlap with the card in a narrow window. Build passes.

## Keybinds, two-way flip, fill-the-window (v0.3)
- Settings → Keybinds: lists Flip card, Rate Again/Hard/Good/Easy and Collapse menu with their shortcuts. Click a field and press a combination (modifiers supported), clear a binding with the X, or Restore defaults. Bindings persist in IndexedDB and are validated on load.
- One shared handler (`KeybindsProvider`) matches events to the user's bindings (by physical key code, number-pad digits count as digits). Hints on the card, Show question button and grade buttons follow the current bindings and disappear for cleared ones.
- Conflicts are refused with a message naming the action already using the combination. Combinations reserved by the browser or macOS/Windows (for example ⌘Q, ⌘W, ⌘T, ⌘Tab, ⌘Space, F5, F11, F12, Tab) are refused with an explanation. This list is a best effort; some combinations never reach the page at all.
- Shortcuts are ignored while typing in a field and while recording a binding (Esc is recorded rather than collapsing the menu while recording). Plain Tab still moves focus during recording and is not assignable.
- Flip is a toggle: question → answer → question, using the existing animation, with a lock so overlapping presses are ignored. Grading stays disabled on the question face. A focused button or link keeps its own Space/Enter activation (one press, one action); after a mouse click on the menu, focus is released so Space flips the card.
- Study layout has no fixed max width: the card fills the area beside the menu, the header and grade buttons stay visible, long answers scroll inside the card, and the text column stays about 768px wide and centred inside the card. History and Settings keep a readable maximum width.
- Verified with Playwright: Space both ways with overlapping presses ignored, key 3 does nothing on the question face, Space/Enter on focused controls act once, typing guards (input and contenteditable), reassigning to Ctrl+Shift+K and Alt+G, persistence after reload, hints following bindings, duplicate and reserved-combination messages, clearing a binding, Restore defaults, and resizing from 1800×1000 down to 520×420 with no horizontal overflow. Build passes.
- Found and fixed during resize testing: question-face text was clipped at very small heights.

## Next steps
- Generate the full question and scenario content set, validating IDs and concept references.
- Add content versioning so edited content keeps progress.
- Filters by topic; progress and weak-area summary.
- Export/import of progress for backup.
- Component tests for the scheduler and shortcut handling.
- Other study modes (not started, out of scope for v0.1).

## Known limits
- Grade buttons are disabled until the answer is shown (matches the earlier rule that grading follows reveal).
- Bindings are per physical key (layout-independent); a combination that needs a different key on another layout would need re-recording.
- Lint still warns in shadcn-generated files and that `SlideStage.tsx` exports a hook beside a component.
- Scheduler is a simple SM-2 variant with no tuning.
- A session starts at the first grade after opening a deck; reopening starts a new session.
