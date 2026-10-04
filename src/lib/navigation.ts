// Opening a practice target from elsewhere in the app (the dashboard, the skill tree). The topic is preselected
// for that visit only: nothing is written to storage, so the learner's saved filters are never overwritten.
import type { PracticeTarget, TargetMode } from "./conceptTargets"
import type { Selection as FlashcardSelection } from "./selection"

export interface Preset {
  mode: TargetMode
  /** A flashcard deck's topic: every card of it, weakest first. */
  flashcards?: FlashcardSelection
  /** A Quick Maths category. */
  quickMathCategory?: string
}

/** What to preselect on arrival. Pure; the destination screen applies it without saving it. */
export function presetFor(target: PracticeTarget): Preset {
  if ((target.mode === "questions" || target.mode === "scenarios") && target.category) {
    return { mode: target.mode, flashcards: { category: target.category, subcategory: target.subcategory ?? null, mastery: "all", size: null } }
  }
  if (target.mode === "quickMath" && target.category) return { mode: target.mode, quickMathCategory: target.category }
  return { mode: target.mode }
}
