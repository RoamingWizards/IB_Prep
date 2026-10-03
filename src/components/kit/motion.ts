/** Duration of the card flip; keep in sync with `--flip-ms` default in styles/ui.css. */
export const FLIP_MS = 420

export function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
}
