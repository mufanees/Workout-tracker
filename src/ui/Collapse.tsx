import type { ComponentChildren } from 'preact'
import { useEffect, useState } from 'preact/hooks'

/**
 * Smooth open/close for accordions: the height eases open with the house curve while the content
 * fades and settles in; closing is quicker and quieter. Content mounts on open and unmounts once
 * closed. `gap` pulls the parent's flex gap in and out with it, so nothing jumps at the end.
 */
export function Collapse({ open, children, gap, class: cls }: { open: boolean; children: ComponentChildren; gap?: boolean; class?: string }) {
  const [mounted, setMounted] = useState(open)
  const [shown, setShown] = useState(open)
  const [settled, setSettled] = useState(open)
  useEffect(() => {
    if (open) {
      setMounted(true)
      setSettled(false)
      // two frames: the closed state paints first, so the opening transitions
      let r = requestAnimationFrame(() => (r = requestAnimationFrame(() => setShown(true))))
      const t = setTimeout(() => setSettled(true), 380)
      return () => (cancelAnimationFrame(r), clearTimeout(t))
    }
    setShown(false)
    setSettled(false)
    const t = setTimeout(() => setMounted(false), 230)
    return () => clearTimeout(t)
  }, [open])
  if (!mounted) return null
  return (
    <div class={'collapse' + (shown ? ' open' : '') + (settled ? ' settled' : '') + (gap ? ' in-gap' : '') + (cls ? ' ' + cls : '')} inert={!open || undefined}>
      <div class="collapse-inner">{children}</div>
    </div>
  )
}
