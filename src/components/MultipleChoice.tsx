import { Check, X } from "lucide-react"
import { GlowButton, Panel } from "@/components/kit"
import type { ChoiceOption } from "@/content/types"
import { CHOICE_ACTIONS } from "@/lib/keybinds"
import { useKeybinds } from "@/lib/keybindsContext"

interface Props {
  /** Small context line above the prompt, for example "Stage 2 of 6 · Marketing and NDAs". */
  context?: string
  prompt: string
  /** Options in the order to display. The caller shuffles once and keeps that order. */
  options: ChoiceOption[]
  selectedId: string | null
  onSelect: (optionId: string) => void
  submitted: boolean
  /** Only used once `submitted` is true; correctness is decided by this stable ID. */
  correctOptionId: string
  explanation: string[]
  onSubmit: () => void
  onNext: () => void
  nextLabel: string
}

/**
 * One multiple-choice question: prompt, choose one option, Submit, feedback with explanation, Next.
 * Presentational and controlled, so any mode can use it. After submitting, the options are locked.
 */
export function MultipleChoice({
  context,
  prompt,
  options,
  selectedId,
  onSelect,
  submitted,
  correctOptionId,
  explanation,
  onSubmit,
  onNext,
  nextLabel,
}: Props) {
  const { label } = useKeybinds()
  const correctOption = options.find((o) => o.id === correctOptionId)
  const wasCorrect = submitted && selectedId === correctOptionId
  const continueHint = label("choiceContinue")

  return (
    <div className="study-card flex h-full flex-col" data-testid="choice-card">
      <div className="thin-scroll min-h-0 flex-1 overflow-y-auto px-6 py-6 sm:px-10 sm:py-8">
        <div className="mx-auto w-full max-w-3xl">
          {context && <p className="text-sm text-muted-foreground">{context}</p>}
          <p className="mt-2 font-serif text-[clamp(1.375rem,2.1vw,2rem)] leading-[1.3] font-semibold" data-testid="choice-prompt">
            {prompt}
          </p>

          <div role="radiogroup" aria-label="Answer options" className="mt-6 space-y-2.5" data-testid="choice-options">
            {options.map((option, i) => {
              const isSelected = selectedId === option.id
              const state = !submitted
                ? isSelected
                  ? "selected"
                  : "idle"
                : option.id === correctOptionId
                  ? "correct"
                  : isSelected
                    ? "wrong"
                    : "dim"
              const letter = String.fromCharCode(65 + i)
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  aria-disabled={submitted}
                  data-state={state}
                  data-option-id={option.id}
                  className="choice-option"
                  onClick={() => !submitted && onSelect(option.id)}
                  // Hand the keyboard back to the shortcuts after a mouse click, so Enter submits.
                  onMouseUp={(e) => e.currentTarget.blur()}
                >
                  <span className="choice-marker">{label(CHOICE_ACTIONS[i]) ?? letter}</span>
                  <span className="min-w-0 flex-1">{option.text}</span>
                  {submitted && state === "correct" && <Check className="mt-0.5 size-5 shrink-0 text-grade-easy" aria-label="Correct answer" />}
                  {submitted && state === "wrong" && <X className="mt-0.5 size-5 shrink-0 text-grade-again" aria-label="Your answer" />}
                </button>
              )
            })}
          </div>

          {submitted && (
            <Panel inset className="mt-6 p-5" role="status" data-testid="choice-feedback">
              <p className={wasCorrect ? "font-medium text-grade-easy" : "font-medium text-grade-again"} data-testid="choice-verdict">
                {wasCorrect ? "Correct" : "Not quite"}
              </p>
              {!wasCorrect && correctOption && (
                <p className="mt-1 text-sm">
                  The correct answer is <span className="font-medium">{correctOption.text}</span>
                </p>
              )}
              <div className="mt-3 max-w-[66ch] space-y-3 text-[0.9375rem] leading-[1.65] text-foreground/90">
                {explanation.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
            </Panel>
          )}
        </div>
      </div>

      <div className="flex shrink-0 justify-end border-t border-white/[0.07] px-6 py-4 sm:px-10">
        {submitted ? (
          <GlowButton tone="blue" solid className="h-11 px-6" onClick={onNext} onMouseUp={(e) => e.currentTarget.blur()} data-testid="choice-next">
            {nextLabel}
            {continueHint && <kbd>{continueHint}</kbd>}
          </GlowButton>
        ) : (
          <GlowButton
            tone="blue"
            solid
            className="h-11 px-6"
            disabled={selectedId === null}
            onClick={onSubmit}
            onMouseUp={(e) => e.currentTarget.blur()}
            data-testid="choice-submit"
          >
            Submit
            {continueHint && <kbd>{continueHint}</kbd>}
          </GlowButton>
        )}
      </div>
    </div>
  )
}
