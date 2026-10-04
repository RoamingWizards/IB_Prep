// Left-to-right layered layout for a directed acyclic graph. Pure; shared by the Valuation Builder's solution view
// and the Skill Tree. A node always sits to the right of everything it depends on.
export interface LayoutOptions {
  columnWidth: number
  rowHeight: number
  /** "barycenter" orders each column by the average row of its prerequisites, which reduces crossing lines. */
  order?: "input" | "barycenter"
  /** Centre each column vertically (default). Off, every column starts at the top so rows line up in lanes. */
  center?: boolean
}

/** `pairs` are [from, to]: `from` comes before `to`. Pairs naming unknown nodes are ignored. */
export function layeredLayout(nodes: readonly string[], pairs: readonly (readonly [string, string])[], opts: LayoutOptions): Record<string, { x: number; y: number }> {
  const known = new Set(nodes)
  const into = new Map<string, string[]>(nodes.map((n) => [n, []]))
  for (const [from, to] of pairs) if (known.has(from) && known.has(to)) into.get(to)!.push(from)

  const depth = new Map<string, number>()
  const depthOf = (n: string): number => {
    const seen = depth.get(n)
    if (seen !== undefined) return seen
    depth.set(n, 0) // guards against a cycle in malformed data
    const d = Math.max(-1, ...(into.get(n) ?? []).map(depthOf)) + 1
    depth.set(n, d)
    return d
  }
  nodes.forEach(depthOf)

  const columns = new Map<number, string[]>()
  for (const n of nodes) columns.set(depth.get(n)!, [...(columns.get(depth.get(n)!) ?? []), n])
  const rowOf = new Map<string, number>()
  const ordered = [...columns.keys()].sort((a, b) => a - b)
  for (const d of ordered) {
    let ids = columns.get(d)!
    if (opts.order === "barycenter" && d > 0) {
      const score = (n: string) => {
        const rows = (into.get(n) ?? []).map((p) => rowOf.get(p)).filter((v): v is number => v !== undefined)
        return rows.length ? rows.reduce((a, b) => a + b, 0) / rows.length : Number.POSITIVE_INFINITY
      }
      ids = [...ids].sort((a, b) => score(a) - score(b) || nodes.indexOf(a) - nodes.indexOf(b))
      columns.set(d, ids)
    }
    ids.forEach((id, i) => rowOf.set(id, i))
  }
  const tallest = Math.max(1, ...[...columns.values()].map((c) => c.length))
  const out: Record<string, { x: number; y: number }> = {}
  for (const [d, ids] of columns) {
    const offset = opts.center === false ? 0 : ((tallest - ids.length) * opts.rowHeight) / 2
    ids.forEach((id, i) => (out[id] = { x: d * opts.columnWidth, y: offset + i * opts.rowHeight }))
  }
  return out
}
