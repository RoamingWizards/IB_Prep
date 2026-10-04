// Electron shell for IB Prep. It only loads the bundled production files (dist/) through a private app:// scheme,
// refuses every other network request, and adds no features: all study logic stays in the web app.
import { app, BrowserWindow, Menu, protocol, session, shell, screen } from "electron"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const DIST = path.join(here, "..", "dist")
const SCHEME = "app"
const HOST = "ibprep"
const ORIGIN = `${SCHEME}://${HOST}`
/** Links the app may open in the system browser: only the React Flow attribution link. Nothing else leaves the app. */
const EXTERNAL_ALLOWED = new Set(["https://reactflow.dev"])

// A stable name fixes the storage location (~/Library/Application Support/IB Prep), so replacing the app keeps data.
app.setName("IB Prep")
if (process.env.IB_PREP_USER_DATA) app.setPath("userData", process.env.IB_PREP_USER_DATA) // for tests with disposable data only

protocol.registerSchemesAsPrivileged([{ scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } }])

const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff": "font/woff", ".woff2": "font/woff2", ".ico": "image/x-icon", ".txt": "text/plain" }

// Reads the file directly (not through the network stack), so the "only app:// may load" filter below stays absolute.
async function serveDist(request) {
  let rel = decodeURIComponent(new URL(request.url).pathname)
  if (rel === "/" || rel === "") rel = "/index.html"
  const file = path.normalize(path.join(DIST, rel))
  if (!file.startsWith(DIST + path.sep)) return new Response("Not found", { status: 404 })
  try {
    const body = await fs.promises.readFile(file)
    return new Response(body, { headers: { "Content-Type": MIME[path.extname(file)] ?? "application/octet-stream", "Content-Security-Policy": CSP } })
  } catch {
    return new Response("Not found", { status: 404 })
  }
}

// ---- remembered window bounds ----
const stateFile = () => path.join(app.getPath("userData"), "window-state.json")
function loadBounds() {
  try {
    const s = JSON.parse(fs.readFileSync(stateFile(), "utf8"))
    const ok = [s.x, s.y, s.width, s.height].every((n) => Number.isFinite(n))
    if (!ok) return {}
    const visible = screen.getAllDisplays().some((d) => {
      const a = d.workArea
      return s.x < a.x + a.width - 40 && s.x + s.width > a.x + 40 && s.y < a.y + a.height - 40 && s.y + s.height > a.y
    })
    return { ...(visible ? { x: s.x, y: s.y } : {}), width: Math.max(900, s.width), height: Math.max(600, s.height), maximized: !!s.maximized }
  } catch {
    return {}
  }
}
function saveBounds(win) {
  try {
    const b = win.getNormalBounds()
    fs.writeFileSync(stateFile(), JSON.stringify({ ...b, maximized: win.isMaximized() }))
  } catch {
    /* losing window position is harmless */
  }
}

function createWindow() {
  const saved = loadBounds()
  const win = new BrowserWindow({
    width: saved.width ?? 1280,
    height: saved.height ?? 860,
    x: saved.x,
    y: saved.y,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#07100d",
    title: "IB Prep",
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true, spellcheck: false },
  })
  if (saved.maximized) win.maximize()
  win.once("ready-to-show", () => win.show())
  let timer
  const later = () => {
    clearTimeout(timer)
    timer = setTimeout(() => saveBounds(win), 400)
  }
  win.on("resize", later)
  win.on("move", later)
  win.on("close", () => saveBounds(win))

  const wc = win.webContents
  wc.setWindowOpenHandler(({ url }) => {
    if (EXTERNAL_ALLOWED.has(url.replace(/\/$/, ""))) void shell.openExternal(url)
    return { action: "deny" }
  })
  wc.on("will-navigate", (e, url) => {
    if (!url.startsWith(ORIGIN + "/")) {
      e.preventDefault()
      if (EXTERNAL_ALLOWED.has(url.replace(/\/$/, ""))) void shell.openExternal(url)
    }
  })
  wc.on("will-attach-webview", (e) => e.preventDefault())
  void win.loadURL(`${ORIGIN}/`)
  return win
}

function buildMenu() {
  const template = [
    { role: "appMenu" },
    {
      label: "File",
      submenu: [{ role: "close" }],
    },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [{ role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }, { type: "separator" }, { role: "togglefullscreen" }, ...(app.isPackaged ? [] : [{ role: "toggleDevTools" }, { role: "reload" }])],
    },
    { role: "windowMenu" },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on("second-instance", () => {
    const [w] = BrowserWindow.getAllWindows()
    if (w) {
      if (w.isMinimized()) w.restore()
      w.focus()
    }
  })
  void app.whenReady().then(() => {
    protocol.handle(SCHEME, serveDist)
    // Offline guarantee: only the app's own scheme (plus data/blob/devtools) may load. Everything else is cancelled.
    session.defaultSession.webRequest.onBeforeRequest((details, cb) => {
      const u = details.url
      cb({ cancel: !(u.startsWith(ORIGIN + "/") || u.startsWith("data:") || u.startsWith("blob:") || u.startsWith("devtools:") || u.startsWith("chrome-extension:")) })
    })
    session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false))
    buildMenu()
    createWindow()
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
  app.on("window-all-closed", () => app.quit())
}
