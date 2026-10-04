# Packaging for macOS (Apple Silicon)

The web app is unchanged and `npm run dev` / `npm run build` still work in the browser. Electron only wraps the production build in `dist/`.

## Commands

| Command | Result |
| --- | --- |
| `npm run electron:dev` | builds, then runs the app in Electron without packaging (no dev server needed) |
| `npm run electron:pack` | unpacked app only: `release/mac-arm64/IB Prep.app` |
| `npm run electron:dist` | app and DMG: `release/mac-arm64/IB Prep.app` and `release/IB Prep-<version>-arm64.dmg` |

`release/` is git-ignored. Config lives in `package.json` (`build`), the Electron entry in `electron/main.mjs`, the icon in `build/` (`icon.svg` is the source, `icon.icns` is generated from it with `sips` and `iconutil`).

## Installing

Open the DMG and drag IB Prep onto the Applications shortcut. The build is **unsigned** (ad-hoc), so macOS Gatekeeper may block the first launch: right-click the app, choose Open, then Open again (or allow it in System Settings → Privacy & Security). This is expected for a local build.

## How it behaves

- App ID `com.ibprep.app`, name "IB Prep". Data is stored by Chromium under `~/Library/Application Support/IB Prep` (IndexedDB, localStorage) plus `window-state.json` for the window position and size. Replacing the app does not touch that folder, so updating keeps study data. Deleting the app does not remove it either.
- The page is served from the bundled files through a private `app://ibprep/` origin. That origin is fixed, so storage stays attached to it between versions.
- Renderer: `contextIsolation` on, `sandbox` on, `nodeIntegration` off, no preload, no webviews, all permission requests refused.
- Network: every request other than `app://`, `data:` and `blob:` is cancelled in the main process, and a Content-Security-Policy restricts the page to its own origin. The only link that may open outside the app is the React Flow attribution (`https://reactflow.dev`), which goes to the system browser; any other navigation or new window is denied.
- Backups, exports and imports use the web app's own flows. Imports use the standard file chooser; downloads use the standard macOS save dialog.
- Menus: App, File, Edit, View (zoom, full screen), Window. Window can be resized (minimum 900x600), and its bounds are remembered.
- A second launch focuses the existing window.
- For tests only, `IB_PREP_USER_DATA=<folder>` puts storage in a disposable folder.

## Moving data from the browser

In the browser version: Settings → Privacy & Data → Download backup. In the packaged app: Settings → Privacy & Data → Restore from a backup, choose the file, review the preview, confirm. Browser storage and app storage are separate; the browser copy is left as it is.

## Outstanding for a public release

- Apple Developer ID signing and hardened runtime (`mac.identity`, entitlements).
- Notarisation (`notarize` in the electron-builder config, or `xcrun notarytool`) and stapling.
- A version number (currently 0.0.0), release notes and a hosting place for the DMG.
- Auto-update is not set up and nothing in the app checks for updates (it would need the network).
- Intel/universal builds are not produced.
