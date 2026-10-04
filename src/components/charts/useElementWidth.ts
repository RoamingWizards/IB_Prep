import { useEffect, useRef, useState } from "react"

/** The rendered width of an element, kept up to date as the window or layout resizes. */
export function useElementWidth<T extends HTMLElement>(initial = 480) {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(initial)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setWidth(Math.max(120, Math.round(el.getBoundingClientRect().width)))
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return [ref, width] as const
}
