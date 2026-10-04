// The prerequisite chain around one concept, for the Skill Tree's focus view. Pure.
export interface Chain {
  /** Everything the concept builds on, directly or through other concepts. */
  prerequisites: Set<string>
  /** Everything that builds on the concept, directly or through other concepts. */
  dependents: Set<string>
  /** The concept itself plus both sets. */
  all: Set<string>
}

function reach(start: string, next: ReadonlyMap<string, readonly string[]>): Set<string> {
  const seen = new Set<string>()
  const stack = [...(next.get(start) ?? [])]
  while (stack.length > 0) {
    const id = stack.pop()!
    if (seen.has(id) || id === start) continue // `id === start` guards against a cycle in malformed data
    seen.add(id)
    stack.push(...(next.get(id) ?? []))
  }
  return seen
}

/**
 * `needs` maps a concept to its prerequisites and `leadsTo` maps a concept to what builds on it. Relatives of
 * relatives are included; siblings and cousins (concepts that merely share a prerequisite or a dependent) are not.
 */
export function connectedChain(id: string, needs: ReadonlyMap<string, readonly string[]>, leadsTo: ReadonlyMap<string, readonly string[]>): Chain {
  const prerequisites = reach(id, needs)
  const dependents = reach(id, leadsTo)
  return { prerequisites, dependents, all: new Set([id, ...prerequisites, ...dependents]) }
}
