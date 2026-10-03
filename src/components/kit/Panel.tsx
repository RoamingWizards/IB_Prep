import type { HTMLAttributes } from "react"
import { cn } from "@/lib/utils"

interface Props extends HTMLAttributes<HTMLDivElement> {
  glow?: "blue" | "violet"
  inset?: boolean
}

/** Standard dark surface. `inset` is a recessed well inside another panel. */
export function Panel({ glow, inset, className, ...props }: Props) {
  return (
    <div
      data-glow={glow}
      className={cn(inset ? "panel-inset" : "panel", className)}
      {...props}
    />
  )
}
