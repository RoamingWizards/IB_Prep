import { useId, useMemo, useState } from "react"
import { GlowButton, Panel } from "@/components/kit"
import type { Exercise } from "@/content/types"
import type { CardState } from "@/lib/db"
import {
  buildSelectionQueue,
  DEFAULT_SELECTION,
  masteryCounts,
  MASTERY_FILTERS,
  SIZE_OPTIONS,
  topicTree,
  type MasteryFilter,
  type Selection,
} from "@/lib/selection"

const selectClass =
  "h-10 w-full rounded-xl border border-white/12 bg-black/20 px-3 text-sm outline-none transition-colors hover:border-white/25 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"

interface Props {
  exercises: Exercise[]
  states: Map<string, CardState>
  selection: Selection
  onApply: (selection: Selection) => void
  onClose: () => void
}

/** Topic, mastery and session-size choices for the current deck. Options come from the content. */
export function SessionFilters({ exercises, states, selection, onApply, onClose }: Props) {
  const [draft, setDraft] = useState(selection)
  const id = useId()
  const tree = useMemo(() => topicTree(exercises), [exercises])
  const category = tree.find((n) => n.name === draft.category)
  const counts = masteryCounts(exercises, draft, states)
  const matching = buildSelectionQueue(exercises, draft, states).length

  return (
    <>
      <div className="fixed inset-0 z-10" onClick={onClose} aria-hidden />
      <Panel
        role="dialog"
        aria-label="Session options"
        data-testid="session-filters"
        className="absolute top-full right-0 z-30 mt-2 w-[min(24rem,100%)] space-y-4 p-5 shadow-2xl"
      >
        <div>
          <label htmlFor={`${id}-category`} className="mb-1.5 block text-sm text-muted-foreground">
            Category
          </label>
          <select
            id={`${id}-category`}
            autoFocus
            className={selectClass}
            value={draft.category ?? ""}
            onChange={(e) => setDraft({ ...draft, category: e.target.value || null, subcategory: null })}
          >
            <option value="">All categories ({exercises.length})</option>
            {tree.map((n) => (
              <option key={n.name} value={n.name}>
                {n.name} ({n.count})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor={`${id}-sub`} className="mb-1.5 block text-sm text-muted-foreground">
            Subcategory
          </label>
          <select
            id={`${id}-sub`}
            className={selectClass}
            disabled={!category}
            value={draft.subcategory ?? ""}
            onChange={(e) => setDraft({ ...draft, subcategory: e.target.value || null })}
          >
            <option value="">All subcategories{category ? ` (${category.count})` : ""}</option>
            {category?.subcategories.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name} ({s.count})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor={`${id}-mastery`} className="mb-1.5 block text-sm text-muted-foreground">
            Mastery
          </label>
          <select
            id={`${id}-mastery`}
            className={selectClass}
            value={draft.mastery}
            onChange={(e) => setDraft({ ...draft, mastery: e.target.value as MasteryFilter })}
          >
            {MASTERY_FILTERS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} ({counts[m.id]})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor={`${id}-size`} className="mb-1.5 block text-sm text-muted-foreground">
            Session size
          </label>
          <select
            id={`${id}-size`}
            className={selectClass}
            value={draft.size ?? "all"}
            onChange={(e) => setDraft({ ...draft, size: e.target.value === "all" ? null : Number(e.target.value) })}
          >
            {SIZE_OPTIONS.map((n) => (
              <option key={n ?? "all"} value={n ?? "all"}>
                {n ? `${n} cards` : "All matching cards"}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-white/[0.07] pt-4">
          <p className="text-sm text-muted-foreground tabular-nums" data-testid="filters-match">
            {matching} {matching === 1 ? "card" : "cards"} in this session
          </p>
          <div className="flex gap-2">
            <GlowButton className="h-9 px-3 text-sm" onClick={() => setDraft({ ...DEFAULT_SELECTION })}>
              Reset
            </GlowButton>
            <GlowButton
              tone="blue"
              solid
              className="h-9 px-4 text-sm"
              disabled={matching === 0}
              onClick={() => onApply(draft)}
            >
              Start session
            </GlowButton>
          </div>
        </div>
      </Panel>
    </>
  )
}
