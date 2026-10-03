import { useEffect, useState } from "react"
import { BookOpen, History, ListChecks } from "lucide-react"
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
  const [ready, setReady] = useState(false)

  // Reopen on the tab the user left.
  useEffect(() => {
    getMeta<Tab>("lastTab")
      .then((t) => t && NAV.some((n) => n.id === t) && setTab(t))
      .finally(() => setReady(true))
  }, [])

  function select(t: Tab) {
    setTab(t)
    void setMeta("lastTab", t)
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="border-b bg-sidebar md:w-56 md:shrink-0 md:border-r md:border-b-0">
        <div className="px-5 py-4 md:py-6">
          <p className="font-serif text-lg font-semibold">IB Prep</p>
        </div>
        <nav aria-label="Main" className="flex gap-1 px-3 pb-3 md:flex-col">
          {NAV.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => select(id)}
              aria-current={tab === id ? "page" : undefined}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm text-sidebar-foreground outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring",
                tab === id && "bg-sidebar-accent font-medium",
              )}
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </button>
          ))}
        </nav>
      </aside>
      <main className="min-w-0 flex-1 px-5 py-8 md:px-10">
        <div className="mx-auto max-w-3xl">
          {ready && tab === "questions" && <StudyView key="question" kind="question" />}
          {ready && tab === "scenarios" && <StudyView key="scenario" kind="scenario" />}
          {ready && tab === "history" && <HistoryView />}
        </div>
      </main>
    </div>
  )
}
