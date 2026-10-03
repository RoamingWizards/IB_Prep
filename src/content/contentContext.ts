import { createContext, useContext } from "react"
import type { ImportRecord } from "./store.ts"
import type { Preview } from "./merge.ts"
import type { KnownIds } from "./validate.ts"
import type { Bank, Concept, ContentPack, Exercise, ExerciseKind, MultipleChoice, Process } from "./types.ts"

export interface ContentApi {
  /** Bundled content with imports layered on top. */
  bank: Bank
  contentVersion: string
  /** Number of items that come from imports (added or updated). */
  importedItemCount: number
  imports: ImportRecord[]
  exercisesFor: (kind: ExerciseKind) => Exercise[]
  exercisesById: Map<string, Exercise>
  conceptsById: Map<string, Concept>
  choicesById: Map<string, MultipleChoice>
  processesById: Map<string, Process>
  /** Concept, multiple-choice and stage IDs available for validating a pack's references. */
  known: KnownIds
  /** What a validated pack would add or update. Writes nothing. */
  preview: (pack: ContentPack) => Preview
  /** Stores a validated pack atomically. Rejects (leaving stored content unchanged) if anything fails. */
  commit: (pack: ContentPack) => Promise<Preview>
  /** The current bank as a content pack. */
  exportPack: () => ContentPack
}

export const ContentContext = createContext<ContentApi | null>(null)

export function useContent(): ContentApi {
  const api = useContext(ContentContext)
  if (!api) throw new Error("useContent must be used inside ContentProvider")
  return api
}
