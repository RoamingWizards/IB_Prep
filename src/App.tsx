import { useEffect, useState } from "react"
import { BookOpen, Calculator, FileSpreadsheet, LayoutDashboard, MessageSquareText, Network, History, ListChecks, Menu, Route, Settings, Workflow } from "lucide-react"
import { HelpButton, ImportHelpPanel } from "@/components/ImportHelp"
import { Logo } from "@/components/Logo"
import { Panel } from "@/components/kit"
import { SidebarFocus } from "@/components/SidebarFocus"
import { DealWalksView } from "@/views/DealWalksView"
import { StudyView } from "@/views/StudyView"
import { ThreeStatementsView } from "@/views/ThreeStatementsView"
import { ValuationView } from "@/views/ValuationView"
import { QuickMathView } from "@/views/QuickMathView"
import { BehaviouralView } from "@/views/BehaviouralView"
import { DashboardView } from "@/views/DashboardView"
import type { PracticeTarget } from "@/lib/conceptTargets"
import { presetFor, type Preset } from "@/lib/navigation"
import { SkillTreeView } from "@/views/SkillTreeView"
import { HistoryView } from "@/views/HistoryView"
import { SettingsView } from "@/views/SettingsView"
import { useShortcutHandlers } from "@/lib/keybindsContext"
import { getMeta, setMeta } from "@/lib/db"
import { cn } from "@/lib/utils"

type Tab = "questions" | "scenarios" | "deals" | "statements" | "valuation" | "quickMath" | "behavioural" | "dashboard" | "skillTree" | "history" | "settings"

const NAV: { id: Tab; label: string; icon: typeof BookOpen }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "questions", label: "Questions", icon: BookOpen },
  { id: "scenarios", label: "Scenarios", icon: ListChecks },
  { id: "deals", label: "Deal Walks", icon: Route },
  { id: "statements", label: "Three Statements", icon: FileSpreadsheet },
  { id: "valuation", label: "Valuation Builder", icon: Workflow },
  { id: "quickMath", label: "Quick Maths", icon: Calculator },
  { id: "behavioural", label: "Behavioural", icon: MessageSquareText },
  { id: "skillTree", label: "Skill Tree", icon: Network },
  { id: "history", label: "History", icon: History },
]

export default function App() {
  // The app always opens on the dashboard.
  const [tab, setTab] = useState<Tab>("dashboard")
  const [menuOpen, setMenuOpen] = useState(true)
  const [ready, setReady] = useState(false)

  // Reopen with the menu as the user left it.
  useEffect(() => {
    getMeta<boolean>("menuOpen")
      .then((open) => {
        if (typeof open === "boolean") setMenuOpen(open)
      })
      .finally(() => setReady(true))
  }, [])

  function select(t: Tab) {
    setTab(t)
  }

  // Open a practice target from the dashboard: preselect its topic, switch mode, then highlight the exercise.
  const [focusId, setFocusId] = useState<string | null>(null)
  // The preselected topic is passed to the screen for this visit only and never saved.
  const [preset, setPreset] = useState<Preset | null>(null)
  function openTarget(target: PracticeTarget) {
    setPreset(presetFor(target))
    select(target.mode)
    setFocusId(target.id ?? null)
    // The screen takes the preset on its first render; drop it soon after so a later visit starts from saved choices.
    window.setTimeout(() => setPreset(null), 500)
  }
  useEffect(() => {
    if (!focusId) return
    let frame = 0
    let tries = 0
    let clear = 0
    const find = () => {
      const el = document.querySelector<HTMLElement>(`[data-exercise-id="${focusId}"], [data-process-id="${focusId}"]`)
      if (el) {
        el.scrollIntoView({ block: "center", behavior: "auto" })
        el.dataset.focus = "true"
        clear = window.setTimeout(() => delete el.dataset.focus, 3000)
        setFocusId(null)
      } else if (++tries < 60) frame = requestAnimationFrame(find)
    }
    frame = requestAnimationFrame(find)
    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(clear)
    }
  }, [focusId, tab])

  function toggleMenu(open: boolean) {
    setMenuOpen(open)
    void setMeta("menuOpen", open)
  }

  const [helpOpen, setHelpOpen] = useState(false)
  // Escape closes the help panel first; only with it closed does it collapse the menu.
  useShortcutHandlers({ collapseMenu: () => (helpOpen ? setHelpOpen(false) : toggleMenu(false)) })

  return (
    <div className="h-screen overflow-hidden">
      {/* Floating menu: one small square when collapsed, the options listed when open. */}
      <Panel
        id="mode-menu"
        className={cn(
          "fixed top-4 bottom-auto left-4 z-30 flex max-h-[calc(100vh-6.5rem)] flex-col gap-1 p-1.5 transition-[width] duration-200 motion-reduce:transition-none",
          menuOpen ? "w-52" : "w-[3.25rem]",
        )}
      >
        <div className={cn("flex items-center", menuOpen ? "justify-between" : "justify-center")}>
        {menuOpen && <Logo className="ml-1.5 size-8 shrink-0" />}
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
        </div>
        {menuOpen && (
          <nav id="mode-options" aria-label="Modes" className="thin-scroll flex min-h-0 flex-col gap-1 overflow-y-auto">
            {NAV.map(({ id, label, icon: Icon }) => {
              const active = tab === id
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setPreset(null) // choosing a mode from the menu always uses the saved choices
                    select(id)
                  }}
                  // After a mouse click, hand the keyboard back to the shortcuts (Space flips the card).
                  onMouseUp={(e) => e.currentTarget.blur()}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex h-10 shrink-0 items-center gap-3 rounded-xl px-3 text-sm whitespace-nowrap text-muted-foreground transition-colors outline-none hover:bg-white/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                    active &&
                      "bg-primary/14 font-medium text-[var(--accent-text)] shadow-[inset_0_0_0_1px_rgb(var(--accent-rgb)/0.3),0_0_26px_-8px_rgb(var(--accent-rgb)/0.7)] before:absolute before:top-2 before:bottom-2 before:left-0 before:w-[3px] before:rounded-full before:bg-primary hover:bg-primary/14 hover:text-[var(--accent-text)]",
                  )}
                >
                  <Icon className="size-[18px] shrink-0" aria-hidden />
                  {label}
                </button>
              )
            })}
          </nav>
        )}
        {menuOpen && <SidebarFocus key={tab} onOpen={openTarget} />}
      </Panel>

      {/* Settings sits at the bottom left, in the same gutter as the menu, and stays reachable when the menu is collapsed. */}
      <Panel
        id="settings-corner"
        className={cn(
          "fixed bottom-4 left-4 z-30 p-1.5 transition-[width] duration-200 motion-reduce:transition-none",
          menuOpen ? "w-52" : "w-[3.25rem]",
        )}
      >
        <button
          type="button"
          onClick={() => {
            setPreset(null)
            select("settings")
          }}
          onMouseUp={(e) => e.currentTarget.blur()}
          aria-label="Settings"
          aria-current={tab === "settings" ? "page" : undefined}
          title="Settings"
          data-testid="settings-button"
          className={cn(
            "relative flex h-10 w-full items-center rounded-xl text-sm text-muted-foreground transition-colors outline-none hover:bg-white/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
            menuOpen ? "gap-3 px-3" : "justify-center",
            tab === "settings" &&
              "bg-primary/14 font-medium text-[var(--accent-text)] shadow-[inset_0_0_0_1px_rgb(var(--accent-rgb)/0.3),0_0_26px_-8px_rgb(var(--accent-rgb)/0.7)] hover:bg-primary/14 hover:text-[var(--accent-text)]",
          )}
        >
          <Settings className="size-[18px] shrink-0" aria-hidden />
          {menuOpen && "Settings"}
        </button>
      </Panel>

      <HelpButton open={helpOpen} onToggle={() => setHelpOpen((v) => !v)} />
      {helpOpen && <ImportHelpPanel onClose={() => setHelpOpen(false)} />}

      <main
        className={cn(
          "h-full overflow-x-hidden overflow-y-auto pt-6 pr-[4.25rem] pb-6 transition-[padding] duration-200 motion-reduce:transition-none",
          menuOpen ? "pl-[15rem]" : "pl-[4.75rem]",
        )}
      >
        {/* Study fills the window exactly (the card scrolls long answers itself); other pages scroll. */}
        <div className={cn("flex flex-col", tab === "questions" || tab === "scenarios" || tab === "deals" || tab === "valuation" || tab === "quickMath" || tab === "skillTree" ? "h-full" : "min-h-full")}>
          {ready && tab === "questions" && <StudyView key="question" kind="question" preset={preset?.mode === "questions" ? preset.flashcards : undefined} />}
          {ready && tab === "scenarios" && <StudyView key="scenario" kind="scenario" preset={preset?.mode === "scenarios" ? preset.flashcards : undefined} />}
          {ready && tab === "deals" && <DealWalksView />}
          {ready && tab === "statements" && <ThreeStatementsView />}
          {ready && tab === "valuation" && <ValuationView />}
          {ready && tab === "quickMath" && <QuickMathView presetCategory={preset?.mode === "quickMath" ? preset.quickMathCategory : undefined} />}
          {ready && tab === "dashboard" && <DashboardView onOpen={openTarget} />}
          {ready && tab === "behavioural" && <BehaviouralView />}
          {ready && tab === "skillTree" && <SkillTreeView onOpen={openTarget} />}
          {ready && tab === "history" && <HistoryView />}
          {ready && tab === "settings" && <SettingsView />}
        </div>
      </main>
    </div>
  )
}
