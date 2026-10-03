import { GlowButton } from "@/components/kit"
import { RATINGS, type Rating } from "@/lib/db"
import { RATING_ACTION } from "@/lib/keybinds"
import { useKeybinds } from "@/lib/keybindsContext"

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
  const { label } = useKeybinds()
  return (
    <div className="grid shrink-0 grid-cols-4 gap-2 sm:gap-3" role="group" aria-label="Rate your answer">
      {RATINGS.map((r) => {
        const active = feedback?.rating === r
        const hint = label(RATING_ACTION[r])
        return (
          <GlowButton
            key={r}
            tone={r}
            disabled={disabled}
            flash={active && feedback.flash}
            pressed={active && feedback.pressed}
            className="h-12 min-w-0 px-2 text-[0.9375rem]"
            onClick={() => onGrade(r)}
            // Keep focus off the button so Space always means "reveal" on the next card.
            onMouseUp={(e) => e.currentTarget.blur()}
          >
            {LABEL[r]}
            {hint && <kbd>{hint}</kbd>}
          </GlowButton>
        )
      })}
    </div>
  )
}
