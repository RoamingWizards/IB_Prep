// Display helpers shared by the Dashboard and the Skill Tree.
import type { MasteryLevel } from "@/lib/mastery"

export const LEVEL_CLASS: Record<MasteryLevel, string> = {
  strong: "text-grade-easy",
  developing: "text-grade-good",
  weak: "text-grade-again",
  "not-studied": "text-muted-foreground",
}

export const pct = (n: number | null) => (n === null ? "–" : `${Math.round(n * 100)}%`)
