import { useEffect, useState } from "react"
import { BookOpen, History, ListChecks, Menu } from "lucide-react"
import { Panel } from "@/components/kit"
import { StudyView } from "@/views/StudyView"
import { HistoryView } from "@/views/HistoryView"
import { getMeta, setMeta } from "@/lib/db"
import { cn } from "@/lib/utils"

type Tab = "questions" | "scenarios" | "history"

const NAV: { id: Tab; label: string; icon: typeof BookOpen }[] = [
  { id: "questions", label: "Questions", icon: BookOpen },
  { id: "scenarios", label: "Scenarios", icon: ListChecks },
  { id: "history", label: "History", icon: History },
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

  useEffect(() => {
    if (!menuOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") toggleMenu(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [menuOpen])

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
          "h-full overflow-y-auto transition-[padding] duration-200 motion-reduce:transition-none",
          menuOpen ? "pl-[12.5rem]" : "pl-[4.75rem]",
        )}
      >
        <div
          className={cn(
            "mx-auto flex min-h-full flex-col px-6 py-7 transition-[max-width] duration-200 motion-reduce:transition-none",
            menuOpen ? "max-w-[860px]" : "max-w-[1120px]",
          )}
        >
          {ready && tab === "questions" && <StudyView key="question" kind="question" />}
          {ready && tab === "scenarios" && <StudyView key="scenario" kind="scenario" />}
          {ready && tab === "history" && <HistoryView />}
        </div>
      </main>
    </div>
  )
}
