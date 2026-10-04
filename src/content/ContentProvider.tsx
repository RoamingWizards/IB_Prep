import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import { BUNDLED_CONTENT_VERSION, bundledBank } from "./bundled.ts"
import { ContentContext, type ContentApi } from "./contentContext.ts"
import { bankToPack, diffPack, knownIds, mergeBank } from "./merge.ts"
import { applyImport, EMPTY_STORED, loadStored, type StoredBundle } from "./store.ts"
import type { ContentPack } from "./types.ts"

/** Loads imported content once at start-up and serves the merged bank to the app. */
export function ContentProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = useState<StoredBundle | null>(null)

  useEffect(() => {
    let cancelled = false
    // If storage is unavailable the app still works with its bundled content.
    loadStored()
      .catch((err) => {
        console.error("Could not load imported content", err)
        return EMPTY_STORED
      })
      .then((s) => !cancelled && setStored(s))
    return () => {
      cancelled = true
    }
  }, [])

  const bank = useMemo(() => mergeBank(bundledBank, stored ?? EMPTY_STORED), [stored])
  const contentVersion = stored?.contentVersion ?? BUNDLED_CONTENT_VERSION

  const commit = useCallback(
    async (pack: ContentPack) => {
      const preview = diffPack(pack, bank)
      await applyImport(pack, preview)
      setStored(await loadStored())
      return preview
    },
    [bank],
  )

  const api = useMemo<ContentApi>(
    () => ({
      bank,
      contentVersion,
      importedItemCount:
        (stored?.concepts.length ?? 0) +
        (stored?.exercises.length ?? 0) +
        (stored?.choices.length ?? 0) +
        (stored?.processes.length ?? 0) +
        (stored?.statements.length ?? 0) +
        (stored?.valuations.length ?? 0) +
        (stored?.quickMath.length ?? 0),
      imports: stored?.imports ?? [],
      exercisesFor: (kind) => (kind === "question" ? bank.questions : bank.scenarios),
      exercisesById: new Map([...bank.questions, ...bank.scenarios].map((e) => [e.id, e])),
      conceptsById: new Map(bank.concepts.map((c) => [c.id, c])),
      choicesById: new Map(bank.multipleChoice.map((c) => [c.id, c])),
      processesById: new Map(bank.processes.map((p) => [p.id, p])),
      statementExercisesById: new Map(bank.threeStatementExercises.map((e) => [e.id, e])),
      valuationExercisesById: new Map(bank.valuationExercises.map((e) => [e.id, e])),
      known: knownIds(bank),
      preview: (pack) => diffPack(pack, bank),
      commit,
      exportPack: () => bankToPack(bank, contentVersion, new Date().toISOString()),
    }),
    [bank, contentVersion, stored, commit],
  )

  if (!stored) return null
  return <ContentContext.Provider value={api}>{children}</ContentContext.Provider>
}
