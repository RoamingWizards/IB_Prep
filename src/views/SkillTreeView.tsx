import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useReactFlow,
  type Edge,
  type NodeChange,
  type NodeTypes,
} from "@xyflow/react"
import { Maximize, Network } from "lucide-react"
import { EvidenceCounts, LevelBadge, PracticeLinks } from "@/components/MasteryBits"
import { pct } from "@/components/masteryFormat"
import { ConceptNode, type ConceptNodeType } from "@/components/skilltree/ConceptNode"
import { GlowButton, Panel } from "@/components/kit"
import { prefersReducedMotion } from "@/components/kit/motion"
import { useContent } from "@/content/contentContext"
import { conceptTopics, NO_TOPIC, type PracticeTarget } from "@/lib/conceptTargets"
import { connectedChain } from "@/lib/conceptChain"
import { layeredLayout } from "@/lib/graphLayout"
import { LEVEL_LABEL, SOURCE_LABEL, SOURCES, type MasteryLevel } from "@/lib/mastery"
import { useMastery } from "@/lib/useMastery"

const nodeTypes: NodeTypes = { concept: ConceptNode }
const LEVELS: MasteryLevel[] = ["not-studied", "weak", "developing", "strong"]
const selectClass =
  "h-9 rounded-xl border border-white/12 bg-black/20 px-3 text-sm outline-none transition-colors hover:border-white/25 focus-visible:ring-2 focus-visible:ring-ring"
const EDGE_IDLE = "#6f7bb8"
const EDGE_ACTIVE = "#b6a9ff"

function SkillTree({ onOpen }: { onOpen: (target: PracticeTarget) => void }) {
  const { bank } = useContent()
  const { state, targets } = useMastery()
  const { fitView } = useReactFlow()
  const [topic, setTopic] = useState<string>("all")
  const [pickedId, setSelectedId] = useState<string | null>(null)
  const [nodes, setNodes, applyChanges] = useNodesState<ConceptNodeType>([])

  const conceptsById = useMemo(() => new Map(bank.concepts.map((c) => [c.id, c])), [bank.concepts])
  const topics = useMemo(() => conceptTopics(bank), [bank])
  const topicOptions = useMemo(() => {
    const counts = new Map<string, number>()
    for (const list of topics.values()) for (const t of list) counts.set(t, (counts.get(t) ?? 0) + 1)
    return [...counts.entries()].sort(([a], [b]) => (a === NO_TOPIC ? 1 : b === NO_TOPIC ? -1 : a.localeCompare(b)))
  }, [topics])

  // Prerequisites as authored, ignoring references to concepts that no longer exist.
  const needs = useMemo(
    () => new Map(bank.concepts.map((c) => [c.id, (c.prerequisiteIds ?? []).filter((id) => conceptsById.has(id))])),
    [bank.concepts, conceptsById],
  )
  const leadsTo = useMemo(() => {
    const out = new Map<string, string[]>()
    for (const [id, list] of needs) for (const p of list) out.set(p, [...(out.get(p) ?? []), id])
    return out
  }, [needs])

  const selectedId = pickedId && conceptsById.has(pickedId) ? pickedId : null

  // Focus view: with a concept selected, only it and its prerequisite and dependent chain (direct and indirect) are shown.
  const chain = useMemo(() => (selectedId ? connectedChain(selectedId, needs, leadsTo) : null), [selectedId, needs, leadsTo])
  const topicVisible = useMemo(() => bank.concepts.filter((c) => topic === "all" || (topics.get(c.id) ?? []).includes(topic)).map((c) => c.id), [bank.concepts, topic, topics])
  const visible = useMemo(() => (chain ? bank.concepts.filter((c) => chain.all.has(c.id)).map((c) => c.id) : topicVisible), [chain, bank.concepts, topicVisible])
  const visibleSet = useMemo(() => new Set(visible), [visible])
  const pairs = useMemo(() => visible.flatMap((id) => (needs.get(id) ?? []).filter((p) => visibleSet.has(p)).map((p) => [p, id] as const)), [visible, visibleSet, needs])
  const positions = useMemo(() => layeredLayout(visible, pairs, { columnWidth: 198, rowHeight: 74, order: "barycenter" }), [visible, pairs])

  // Nodes keep their measured size between recalculations so the view does not jump.
  useEffect(() => {
    if (!state) return
    setNodes((prev) => {
      const measured = new Map(prev.map((n) => [n.id, n.measured]))
      return visible.map<ConceptNodeType>((id) => {
        const m = state.byId.get(id)!
        return {
          id,
          type: "concept",
          position: positions[id],
          data: { label: conceptsById.get(id)!.name, level: m.level, score: m.score },
          ariaLabel: `${conceptsById.get(id)!.name}: ${LEVEL_LABEL[m.level]}${m.score === null ? "" : `, ${Math.round(m.score * 100)}%`}`,
          measured: measured.get(id),
          selected: id === selectedId,
          draggable: false,
          connectable: false,
        }
      })
    })
  }, [state, visible, positions, conceptsById, selectedId, setNodes])

  const edges = useMemo<Edge[]>(
    () =>
      pairs.map(([from, to]) => {
        const active = selectedId !== null && (from === selectedId || to === selectedId)
        return {
          id: `${from}>${to}`,
          source: from,
          target: to,
          type: "default",
          selectable: false,
          focusable: false,
          markerEnd: { type: MarkerType.ArrowClosed, color: active ? EDGE_ACTIVE : EDGE_IDLE, width: 18, height: 18 },
          style: { stroke: active ? EDGE_ACTIVE : EDGE_IDLE, strokeWidth: active ? 2.4 : 1.4, },
        }
      }),
    [pairs, selectedId],
  )

  // Selection comes from clicks, the keyboard (Enter or Space on a focused node) and the "Go to concept" list.
  // Clicking empty canvas does not deselect: "Show all" is the one way back to the full tree.
  const onNodesChange = useCallback(
    (changes: NodeChange<ConceptNodeType>[]) => {
      const picked = changes.find((c) => c.type === "select" && c.selected)
      if (picked && picked.type === "select") setSelectedId(picked.id)
      applyChanges(changes.filter((c) => !(c.type === "select" && !c.selected)))
    },
    [applyChanges],
  )

  const showAll = useCallback(() => setSelectedId(null), [])

  const fit = useCallback(() => void fitView({ padding: 0.06, duration: prefersReducedMotion() ? 0 : 250 }), [fitView])
  // Fit the visible graph when entering or leaving focus view, changing the focused concept or changing topic
  // (after the new nodes are in place).
  const viewKey = `${selectedId ?? "all"}|${topic}`
  useEffect(() => {
    const t = window.setTimeout(() => void fitView({ padding: 0.06, duration: 0 }), 80)
    return () => window.clearTimeout(t)
  }, [viewKey, fitView])

  const goTo = (id: string) => {
    if (id) setSelectedId(id)
  }

  if (!state) return null
  const selected = selectedId ? conceptsById.get(selectedId) : undefined
  const m = selectedId ? state.byId.get(selectedId) : undefined

  const conceptLink = (id: string) => (
    <li key={id}>
      <button type="button" className="text-left underline decoration-white/25 underline-offset-2 transition-colors hover:text-foreground hover:decoration-white/60" onClick={() => goTo(id)} data-testid="related-concept" data-concept-id={id}>
        {conceptsById.get(id)?.name ?? id}
      </button>
      <span className="ml-2 text-xs text-muted-foreground">{LEVEL_LABEL[state.byId.get(id)?.level ?? "not-studied"]}</span>
    </li>
  )

  return (
    <div className="flex h-full min-h-[34rem] flex-col gap-4" data-testid="skill-tree">
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <h1 className="font-serif text-2xl font-semibold">Skill Tree</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Concepts and what to learn before them. Select one to focus on its chain of prerequisites and dependents. Colours show mastery from your saved results, and every concept is open to practise at any time.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            Topic
            <select className={selectClass} value={topic} disabled={!!chain} title={chain ? "Show all to change the topic" : undefined} onChange={(e) => setTopic(e.target.value)} data-testid="topic-filter">
              <option value="all">All topics ({bank.concepts.length})</option>
              {topicOptions.map(([t, n]) => (
                <option key={t} value={t}>
                  {t} ({n})
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            Go to
            <select className={selectClass} value={selectedId ?? ""} onChange={(e) => goTo(e.target.value)} data-testid="goto-concept">
              <option value="">Choose a concept</option>
              {bank.concepts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          {chain && (
            <GlowButton tone="blue" solid className="h-9 gap-2 px-3 text-sm" onClick={showAll} data-testid="show-all">
              <Network className="size-4" aria-hidden />
              Show all
            </GlowButton>
          )}
          <GlowButton className="h-9 gap-2 px-3 text-sm" onClick={fit} data-testid="fit-view">
            <Maximize className="size-4" aria-hidden />
            Fit view
          </GlowButton>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground" data-testid="legend" aria-label="Legend">
        {LEVELS.map((l) => (
          <span key={l} className="flex items-center gap-2" data-testid="legend-item" data-level={l}>
            <span className="st-swatch" data-level={l} aria-hidden />
            {LEVEL_LABEL[l]}
          </span>
        ))}
        <span>An arrow runs from a prerequisite to the concept that builds on it.</span>
        {chain && selected ? (
          <span data-testid="focus-note">
            Showing {selected.name} and its chain: {chain.prerequisites.size} {chain.prerequisites.size === 1 ? "prerequisite" : "prerequisites"} and {chain.dependents.size}{" "}
            {chain.dependents.size === 1 ? "concept that builds" : "concepts that build"} on it. Other concepts are hidden.
          </span>
        ) : (
          visible.length < bank.concepts.length && (
            <span data-testid="hidden-note">
              Showing {visible.length} of {bank.concepts.length} concepts.
            </span>
          )
        )}
      </div>

      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="min-h-[24rem] min-w-0">
          <div className="vb-canvas" data-testid="skill-canvas">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable
              colorMode="dark"
              fitView
              fitViewOptions={{ padding: 0.06 }}
              minZoom={0.15}
              maxZoom={1.6}
            >
              <Background variant={BackgroundVariant.Dots} gap={22} size={1.4} color="rgb(255 255 255 / 0.12)" />
              <Controls showInteractive={false} fitViewOptions={{ padding: 0.06 }} />
            </ReactFlow>
          </div>
        </div>

        <aside aria-label="Concept details" className="thin-scroll min-h-0 overflow-y-auto" data-testid="concept-panel">
          {selected && m ? (
            <Panel className="space-y-4 p-5" data-testid="concept-details" data-concept-id={selected.id}>
              <div>
                <h2 className="font-serif text-xl font-semibold" data-testid="concept-name">
                  {selected.name}
                </h2>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <LevelBadge level={m.level} />
                  <span className="text-sm tabular-nums" data-testid="concept-score">
                    {m.score === null ? "No score" : `Mastery ${pct(m.score)}`}
                  </span>
                  {m.selfRatedOnly && <span className="text-xs text-muted-foreground">self-rated only</span>}
                </div>
                <button
                  type="button"
                  className="mt-2 text-sm text-muted-foreground underline decoration-white/25 underline-offset-2 hover:text-foreground"
                  onClick={showAll}
                  data-testid="panel-show-all"
                >
                  Show all concepts
                </button>
              </div>
              <p className="text-sm leading-relaxed text-foreground/90" data-testid="concept-summary">
                {selected.summary}
              </p>
              <div className="space-y-1 text-sm">
                <h3 className="font-medium">Evidence</h3>
                <EvidenceCounts m={m} />
                {m.evidenceCount > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {SOURCES.filter((s) => m.bySource[s] > 0).map((s) => `${SOURCE_LABEL[s]} ${m.bySource[s]}`).join(" · ")}
                  </p>
                )}
              </div>
              <div className="text-sm">
                <h3 className="font-medium">Prerequisites</h3>
                {(needs.get(selected.id) ?? []).length === 0 ? (
                  <p className="text-muted-foreground" data-testid="no-prerequisites">
                    None. A good place to start.
                  </p>
                ) : (
                  <ul className="mt-1 space-y-1" data-testid="prerequisite-list">
                    {(needs.get(selected.id) ?? []).map(conceptLink)}
                  </ul>
                )}
              </div>
              {(leadsTo.get(selected.id) ?? []).length > 0 && (
                <div className="text-sm">
                  <h3 className="font-medium">Leads to</h3>
                  <ul className="mt-1 space-y-1" data-testid="leads-to-list">
                    {(leadsTo.get(selected.id) ?? []).map(conceptLink)}
                  </ul>
                </div>
              )}
              <div className="text-sm">
                <h3 className="mb-2 font-medium">Practise</h3>
                <PracticeLinks targets={targets.get(selected.id)} onOpen={onOpen} stack />
              </div>
            </Panel>
          ) : (
            <Panel className="p-5" data-testid="concept-empty">
              <p className="text-sm text-muted-foreground">Select a concept to focus on its prerequisites and dependents and see what it covers, how well you know it and where to practise it.</p>
            </Panel>
          )}
        </aside>
      </div>
    </div>
  )
}

export function SkillTreeView({ onOpen }: { onOpen: (target: PracticeTarget) => void }) {
  return (
    <ReactFlowProvider>
      <SkillTree onOpen={onOpen} />
    </ReactFlowProvider>
  )
}
