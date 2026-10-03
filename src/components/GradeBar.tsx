import { GlowButton } from "@/components/kit"
import { RATINGS, type Rating } from "@/lib/db"

const LABEL: Record<Rating, string> = {
  again: "Again",
  hard: "Hard",
  good: "Good",
  easy: "Easy",
}

export interface GradeFeedback {
  rating: Rating
  flash: boolean
  pressed: boolean
}

interface Props {
  disabled: boolean
  feedback: GradeFeedback | null
  onGrade: (rating: Rating) => void
}

/** Four labelled grading buttons. Mouse and keyboard both arrive through `onGrade`. */
export function GradeBar({ disabled, feedback, onGrade }: Props) {
  return (
    <div className="grid grid-cols-4 gap-3" role="group" aria-label="Rate your answer">
      {RATINGS.map((r, i) => {
        const active = feedback?.rating === r
        return (
          <GlowButton
            key={r}
            tone={r}
            disabled={disabled}
            flash={active && feedback.flash}
            pressed={active && feedback.pressed}
            className="h-12 text-[0.9375rem]"
            onClick={() => onGrade(r)}
            // Keep focus off the button so Space always means "reveal" on the next card.
            onMouseUp={(e) => e.currentTarget.blur()}
          >
            {LABEL[r]}
            <kbd>{i + 1}</kbd>
          </GlowButton>
        )
      })}
    </div>
  )
}
