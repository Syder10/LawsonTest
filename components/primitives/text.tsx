import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

// ============================================================================
// Typography primitives.
//
// The audit found 16 distinct text sizes, 6 weights and 10 tracking values, with
// ~20 "eyebrow" labels written six different ways — text-[9px]/[10px]/[11px],
// five tracking values, font-bold vs font-black. Five of those sizes were
// arbitrary sub-12px values, including text-[7px] and text-[8px], which are below
// any legibility floor on a factory-floor phone.
//
// TYPE SCALE FLOOR IS 12px (text-xs). Nothing in the app goes below it.
// ============================================================================

/**
 * Small uppercase label above a value or section. The single spelling for what
 * was previously six variants.
 */
export function Eyebrow({
  children,
  className,
  as: Tag = "p",
}: {
  children: ReactNode
  className?: string
  as?: "p" | "span" | "h2" | "h3" | "div"
}) {
  return (
    <Tag className={cn("text-xs font-bold uppercase tracking-widest text-ink-muted", className)}>{children}</Tag>
  )
}

/** Page title. Replaces five different h1/h2 treatments for the same slot. */
export function PageTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={cn("text-2xl sm:text-3xl font-bold tracking-tight text-ink-primary", className)}>{children}</h2>
}

/** Section heading inside a page or card. */
export function SectionTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h3 className={cn("text-base font-bold text-ink-primary", className)}>{children}</h3>
}

/** Muted supporting copy under a title. */
export function Subtle({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("text-sm font-medium text-ink-secondary", className)}>{children}</p>
}
