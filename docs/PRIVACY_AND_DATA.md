# Privacy & Data: verified behaviour

This records what the app was checked to do. It is not legal advice and makes no claim of compliance with any law or standard. The in-app notice (Settings → Privacy notice, source `src/lib/privacyNotice.ts`) is a draft built from this; the publisher must supply the marked details and have it reviewed.

## What was inspected

- Source: no `fetch`, XHR, WebSocket, `sendBeacon`, EventSource, cookies, sessionStorage, Cache API or service worker (a Node test, `backup-test`, re-checks this).
- Production bundle: no network primitives; dependencies (React, React Flow, idb, shadcn/Radix, Tailwind) make no requests. Fonts are bundled. React Flow shows an attribution link that only leaves the app if the user clicks it.
- Runtime (isolated browser profile): 8 same-origin GET requests to load the app; no external hosts, no POST requests; no cookies; storage is not marked persistent.

## Stored (on the device, in the browser)

| Where | What |
| --- | --- |
| IndexedDB `ib-prep-progress` | flashcard ratings/sessions/schedule, Deal Walk results, Three Statements and Valuation attempts and drafts, Quick Maths results, Behavioural answers/bullets/own questions/sessions, settings (keybinds, filters, menu, theme) and in-progress pointers |
| IndexedDB `ib-prep-content` | imported content packs and the import log |
| localStorage `ib-prep-theme` | a copy of the four theme colours, so the theme applies before first paint |

## Transmitted

Nothing by the app. The host serving the static files can see ordinary web requests (IP address, time, URL, browser); whether they are logged is the publisher's hosting detail to supply.

## Retained

Until the user deletes it (Settings → Privacy & Data) or the browser clears site data or evicts storage. Backups and exports are files the user saves; the app keeps no copy.

## Backup and restore

One JSON file (`kind: "ib-prep-backup"`, version 1) containing both databases and the theme copy, with declared counts and a SHA-256 integrity digest. Not encrypted: Behavioural answers are readable text. Restore validates the whole file first (size, JSON, kind, version, store/record shapes, duplicates, counts, content through the pack validator, digest), shows what will be replaced, and requires confirmation. Restore replaces content, then progress; if progress fails, content is rolled back from a snapshot, and if rollback also fails an emergency download of the previous data is offered. The app reloads afterwards.

## Deletion scopes

- Study history: flashcard, Deal Walk, Three Statements, Valuation, Quick Maths data and drafts. Keeps Behavioural data, content, settings.
- Behavioural answers: answers, own questions, practice sessions. Keeps everything else.
- All app data: everything above plus imported content and settings (bundled content stays). Requires typing DELETE.

## Sharing with external LLMs

The app never contacts an LLM. If the user copies content (for example a Behavioural answer, or an export) into an external LLM service themselves, that service's own terms apply; the app cannot see or control it.

## Packaged macOS app (Electron)

Re-checked on the packaged arm64 app, run with a disposable storage folder:

- It loads `app://ibprep/` from the bundled files; no server and no Terminal. A page `fetch` to an external host and an external image both failed (blocked in the main process), and the only external request the page attempted was that deliberate test image. Normal use produced no other non-`app://` requests.
- Data lives in the app's storage folder (`~/Library/Application Support/IB Prep`, plus `window-state.json` with window size and position). It is not encrypted and not synced. Quitting and reopening kept every store.
- The renderer has no Node access. The one external link (React Flow attribution) opens in the system browser only when clicked, and the page itself did not navigate. Electron itself does not send usage data from this app: no crash reporter, auto-updater or telemetry is started. This was checked in the app's own code, not by capturing all operating-system traffic.
- Browser data is not read by the app. Moving data is a user-initiated backup file restored in the app; browser and app storage stay separate.
- Everything in the sections above about backups, deletion and external LLMs applies unchanged. The notice's "Where the app is hosted" item is now also about how the DMG is distributed (publisher to supply).

## Details the publisher must supply

Publisher name and legal entity; privacy contact address; hosting provider/location and log practices; applicable law and jurisdiction statements; effective date and version.
