import type { ReactNode } from "react"

interface Props {
  flipped: boolean
  front: ReactNode
  back: ReactNode
}

/**
 * Two-faced card that turns around its vertical axis. The hidden face is
 * `inert` so it can't take focus or clicks, and backface-visibility keeps
 * text from ever showing mirrored. Reduced motion swaps the turn for a fade
 * (see styles/ui.css).
 */
export function FlipCard({ flipped, front, back }: Props) {
  return (
    <div className="flip" data-flipped={flipped}>
      <div className="flip-inner">
        <div className="flip-face flip-front" inert={flipped} aria-hidden={flipped}>
          {front}
        </div>
        <div className="flip-face flip-back" inert={!flipped} aria-hidden={!flipped}>
          {back}
        </div>
      </div>
    </div>
  )
}
