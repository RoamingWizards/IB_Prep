import { useEffect, useState } from "react"
import { BookOpen, FileSpreadsheet, History, ListChecks, Menu, Route, Settings, Workflow } from "lucide-react"
import { Panel } from "@/components/kit"
import { DealWalksView } from "@/views/DealWalksView"
import { StudyView } from "@/views/StudyView"
import { ThreeStatementsView } from "@/views/ThreeStatementsView"
import { ValuationView } from "@/views/ValuationView"
import { HistoryView } from "@/views/HistoryView"
import { SettingsView } from "@/views/SettingsView"
import { useShortcutHandlers } from "@/lib/keybindsContext"
import { getMeta, setMeta } from "@/lib/db"
import { cn } from "@/lib/utils"

type Tab = "questions" | "scenarios" | "deals" | "statements" | "valuation" | "history" | "settings"

const NAV: { id: Tab; label: string; icon: typeof BookOpen }[] = [
  { id: "questions", label: "Questions", icon: BookOpen },
  { id: "scenarios", label: "Scenarios", icon: ListChecks },
  { id: "deals", label: "Deal Walks", icon: Route },
  { id: "statements", label: "Three Statements", icon: FileSpreadsheet },
  { id: "valuation", label: "Valuation Builder", icon: Workflow },
  { id: "history", label: "History", icon: History },
  { id: "settings", label: "Settings", icon: Settings },
]

export default function App() {
  const [tab, setTab] = useState<Tab>("questions")
  const [menuOpen, setMenuOpen] = useState(true)
  const [ready, setReady] = useState(false)

  // Reopen on the tab and menu state the user left.
  useEffect(() => {
    Promise.all([getMeta<Tab>("lastTab"), getMeta<boolean>("menuOpen")])
      .then(([t, open]) => {
        if (t && NAV.some((n) => n.id === t)) setTab(t)
        if (typeof open === "boolean") setMenuOpen(open)
      })
      .finally(() => setReady(true))
  }, [])

  function select(t: Tab) {
    setTab(t)
    void setMeta("lastTab", t)
  }

  function toggleMenu(open: boolean) {
    setMenuOpen(open)
    void setMeta("menuOpen", open)
  }

  useShortcutHandlers({ collapseMenu: () => toggleMenu(false) })

  return (
    <div className="h-screen overflow-hidden">
      {/* Floating menu: one small square when collapsed, the options listed when open. */}
      <Panel
        id="mode-menu"
        className={cn(
          "fixed top-4 left-4 z-30 flex flex-col gap-1 p-1.5 transition-[width] duration-200 motion-reduce:transition-none",
          menuOpen ? "w-44" : "w-[3.25rem]",
        )}
      >
        <button
          type="button"
          onClick={() => toggleMenu(!menuOpen)}
          onMouseUp={(e) => e.currentTarget.blur()}
          aria-label={menuOpen ? "Collapse menu" : "Expand menu"}
          aria-expanded={menuOpen}
          aria-controls="mode-options"
          className="flex size-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors outline-none hover:bg-white/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Menu className="size-5" aria-hidden />
        </button>
        {menuOpen && (
          <nav id="mode-options" aria-label="Modes" className="flex flex-col gap-1 overflow-hidden">
            {NAV.map(({ id, label, icon: Icon }) => {
              const active = tab === id
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => select(id)}
                  // After a mouse click, hand the keyboard back to the shortcuts (Space flips the card).
                  onMouseUp={(e) => e.currentTarget.blur()}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-10 items-center gap-3 rounded-xl px-3 text-sm whitespace-nowrap text-muted-foreground transition-colors outline-none hover:bg-white/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                    active &&
                      "bg-primary/12 font-medium text-[#cfe0ff] shadow-[inset_0_0_0_1px_rgb(91_155_255/0.25),0_0_24px_-10px_rgb(91_155_255/0.6)] hover:bg-primary/12 hover:text-[#cfe0ff]",
                  )}
                >
                  <Icon className="size-[18px] shrink-0" aria-hidden />
                  {label}
                </button>
              )
            })}
          </nav>
        )}
      </Panel>

      <main
        className={cn(
          "h-full overflow-x-hidden overflow-y-auto pt-6 pr-6 pb-6 transition-[padding] duration-200 motion-reduce:transition-none",
          menuOpen ? "pl-[12.5rem]" : "pl-[4.75rem]",
        )}
      >
        {/* Study fills the window exactly (the card scrolls long answers itself); other pages scroll. */}
        <div className={cn("flex flex-col", tab === "questions" || tab === "scenarios" || tab === "deals" || tab === "valuation" ? "h-full" : "min-h-full")}>
          {ready && tab === "questions" && <StudyView key="question" kind="question" />}
          {ready && tab === "scenarios" && <StudyView key="scenario" kind="scenario" />}
          {ready && tab === "deals" && <DealWalksView />}
          {ready && tab === "statements" && <ThreeStatementsView />}
          {ready && tab === "valuation" && <ValuationView />}
          {ready && tab === "history" && <HistoryView />}
          {ready && tab === "settings" && <SettingsView />}
        </div>
      </main>
    </div>
  )
}
