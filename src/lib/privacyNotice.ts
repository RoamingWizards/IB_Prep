// The text of the Privacy & Data notice, as data, so the screen and the tests read the same words. It describes how
// the app behaves, as checked on 2026-10-04 (see docs/PRIVACY_AND_DATA.md for the checks). Details only the publisher
// can supply are marked as placeholders and listed for them to fill in; nothing here is invented, and nothing claims
// compliance with any law. A reviewer should read it before it is published.
import { CONTENT_STORES, GROUPS, PROGRESS_STORES, THEME_MIRROR_KEY } from "./backup.ts"

/** A detail the publisher must supply. */
export interface Placeholder {
  id: string
  label: string
  why: string
}

export const PLACEHOLDERS: Placeholder[] = [
  { id: "publisher", label: "Publisher name and legal entity", why: "Who is responsible for this distribution of the app." },
  { id: "contact", label: "Contact address for privacy questions", why: "Where people can ask about this notice or their data." },
  { id: "hosting", label: "Where the app is hosted, and who runs that hosting", why: "The host can see ordinary web requests (see Network activity). Only the publisher knows whether and how they are logged and for how long." },
  { id: "jurisdiction", label: "Applicable law and jurisdiction, and any legal basis statements", why: "Legal statements must come from the publisher and their adviser. This draft makes none." },
  { id: "effective", label: "Effective date and version of this notice", why: "So people can tell which version they read." },
]

export type Segment = string | { placeholder: string }
export interface NoticeSection {
  id: string
  heading: string
  paragraphs?: Segment[][]
  items?: Segment[][]
}

const ph = (id: string): Segment => ({ placeholder: id })
const s = (text: string): Segment[] => [text]

export const NOTICE_INTRO: Segment[] = [
  "This is a draft notice that describes what the app does with data, written from what was checked in the code and in a running copy of the app. It is not legal advice and does not claim that the app meets any law or standard. The publisher must review it, supply the marked details, and replace it with their own approved wording before publishing.",
]

export const NOTICE_SECTIONS: NoticeSection[] = [
  {
    id: "who",
    heading: "Who this is from",
    paragraphs: [["Publisher: ", ph("publisher"), ". Contact for privacy questions: ", ph("contact"), ". Notice version and date: ", ph("effective"), "."]],
  },
  {
    id: "local",
    heading: "What is stored on your device",
    paragraphs: [
      s("IB Prep works offline. There are no accounts and no sign-in. Everything you create is stored in your browser's own storage on this device, in two IndexedDB databases and one small local copy of your colours:"),
    ],
    items: [
      s(`Database "ib-prep-progress": ${PROGRESS_STORES.filter((x) => !x.keyValue).length} stores holding your study results, unfinished drafts, Behavioural answers, practice sessions and reflections, your own Behavioural questions, and a key-value store of settings (keybinds, appearance, filters, menu state and which attempt was open).`),
      s(`Database "ib-prep-content": ${CONTENT_STORES.filter((x) => !x.keyValue).length} stores holding content you imported (concepts, questions, exercises) and a log of imports. The content that ships with the app is not stored here.`),
      s(`Local storage item "${THEME_MIRROR_KEY}": a copy of your four chosen colours, so the app can paint them straight away.`),
      s("Nothing else: no cookies, no session storage, no cache storage and no service worker were found."),
    ],
  },
  {
    id: "personal",
    heading: "What counts as personal",
    paragraphs: [
      s("Anything you type into the app is yours and stays on your device: Behavioural answers, practice bullets, reflections and questions you write can describe your own experience. Study results show what you studied and how you did, with timestamps. The app does not ask for your name, email or any identifier and does not generate one."),
    ],
    items: GROUPS.map((g) => s(g.label)),
  },
  {
    id: "network",
    heading: "Network activity",
    paragraphs: [
      s("The app's own code makes no network requests of its own: there is no analytics, telemetry, advertising, crash reporting, account system or server API, and none of the libraries it uses were found to send data. In a checked session through every screen, importing, exporting and copying, the only requests were for the app's own files from the address it was loaded from (the page, its script and stylesheet, the icon and the bundled fonts), all of them plain downloads with no data sent."),
      s("The fonts are shipped inside the app; they are not loaded from a font service."),
      ["Whoever hosts the app can see ordinary information that comes with any web request, such as the time, your network address and your browser type, and may log it. That is outside the app's control. Hosting details: ", ph("hosting"), "."],
      s("The Skill Tree and Valuation Builder show a small \"React Flow\" credit. It is an ordinary link and sends nothing unless you click it, which opens the library's website in your browser."),
    ],
  },
  {
    id: "retention",
    heading: "How long data is kept",
    paragraphs: [
      s("Your data stays on this device until you delete it with the controls below, or until your browser removes it. Browsers can clear site data when you clear browsing data, when storage runs low or in private windows, and this app does not ask the browser to protect its storage, so a backup is the only safe copy. Uninstalling or clearing the site's data removes it for good unless you have a backup."),
    ],
  },
  {
    id: "exports",
    heading: "Exports and backups",
    items: [
      s("Download backup writes everything listed above, including your answers and reflections, into one plain, unencrypted JSON file in the place you choose. Anyone who has the file can read it. Keep it somewhere you trust."),
      s("Export my answers (Behavioural) writes only your answers, bullets, practice sessions, reflections and your own questions to a separate file. It cannot be restored into the app."),
      s("Export content bank (Settings, Content) writes the content in the app (shipped and imported) as a content pack. It contains no study results and none of your Behavioural writing."),
      s("The app never uploads these files. Where they go afterwards is your choice."),
    ],
  },
  {
    id: "deleting",
    heading: "Deleting your data",
    paragraphs: [s("Settings, Privacy & Data has three separate controls, each with a confirmation that lists exactly what will be removed and what will stay:")],
    items: [
      s("Delete study history: flashcard ratings, sessions and review schedule; Deal Walk, Three Statements, Valuation Builder and Quick Maths progress, results and unfinished drafts. Keeps Behavioural data, imported content and settings."),
      s("Delete Behavioural answers: your answers, bullets, your own questions and practice sessions. Keeps everything else."),
      s("Delete all app data: everything above plus imported content and all settings, returning the app to how it first opened. Files you saved earlier are not touched."),
      s("You can also clear the site's data in your browser's settings."),
    ],
  },
  {
    id: "llm",
    heading: "Sharing with an outside LLM (your choice)",
    paragraphs: [
      s("The Import help button can copy instructions for a chat assistant (an LLM). Copying only puts text on your clipboard; the app sends nothing. The instructions contain the content format, an example, and the IDs and names of the concepts currently in your app (which include concept names from any content you imported). They do not contain your answers, results or settings."),
      s("If you paste anything else into an outside service, such as a Behavioural answer, a backup or an export, that is your decision and is handled under that service's own terms and privacy practices, not by this app. Do not paste personal writing you are not willing to share. The app cannot check what an assistant does with what you give it, and it checks only the structure of what comes back, not whether the finance is right."),
    ],
  },
  {
    id: "security",
    heading: "Security of stored data",
    paragraphs: [s("The app does not encrypt the data it keeps. It is protected only by your device and your browser profile, so anyone who can use your browser profile can read it. Backup and export files are not encrypted either.")],
  },
  {
    id: "changes",
    heading: "Changes and questions",
    paragraphs: [["If this notice changes, the publisher should update the version and date above. Questions: ", ph("contact"), ". Applicable law and jurisdiction: ", ph("jurisdiction"), "."]],
  },
]
