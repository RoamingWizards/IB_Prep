import { useCallback, useRef, useState, type ReactNode, type RefObject } from "react"
import { cn } from "@/lib/utils"

export type SlidePhase = "idle" | "out" | "in"

/** Resolves when the stage's slide animation ends (or after a safety timeout). */
function animationDone(el: HTMLElement | null, timeout = 900) {
  return new Promise<void>((resolve) => {
    let timer = 0
    const finish = () => {
      el?.removeEventListener("animationend", onEnd)
      window.clearTimeout(timer)
      resolve()
    }
    const onEnd = (e: AnimationEvent) => {
      if ((e.target as HTMLElement).classList.contains("slide-item")) finish()
    }
    el?.addEventListener("animationend", onEnd)
    timer = window.setTimeout(finish, timeout)
  })
}

/**
 * Drives the exit -> swap -> enter sequence. `run(swap)` slides the current
 * item out, calls `swap` to change what is shown, then slides the new item in.
 */
export function useSlideSequence() {
  const stageRef = useRef<HTMLDivElement>(null)
  const [phase, setPhase] = useState<SlidePhase>("idle")

  const run = useCallback(async (swap: () => void) => {
    const exited = animationDone(stageRef.current)
    setPhase("out")
    await exited
    const entered = animationDone(stageRef.current)
    swap()
    setPhase("in")
    await entered
    setPhase("idle")
  }, [])

  return { stageRef, phase, run }
}

interface Props {
  stageRef: RefObject<HTMLDivElement | null>
  phase: SlidePhase
  /** Changing the key mounts a fresh item, which is what resets its state. */
  itemKey: string | number
  className?: string
  children: ReactNode
}

export function SlideStage({ stageRef, phase, itemKey, className, children }: Props) {
  return (
    <div ref={stageRef} className={cn("slide-stage", className)}>
      <div key={itemKey} className="slide-item" data-phase={phase}>
        {children}
      </div>
    </div>
  )
}
