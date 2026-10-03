import type { ButtonHTMLAttributes } from "react"
import { cn } from "@/lib/utils"

export type Tone = "neutral" | "blue" | "violet" | "again" | "hard" | "good" | "easy"

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: Tone
  /** Brief bright glow after activation. */
  flash?: boolean
  /** Pressed-in movement; set for keyboard activation so it matches a mouse click. */
  pressed?: boolean
  solid?: boolean
}

export function GlowButton({
  tone = "neutral",
  flash,
  pressed,
  solid,
  type = "button",
  className,
  ...props
}: Props) {
  return (
    <button
      type={type}
      data-flash={flash || undefined}
      data-pressed={pressed || undefined}
      data-solid={solid || undefined}
      className={cn("glow-btn tone-" + tone, className)}
      {...props}
    />
  )
}
