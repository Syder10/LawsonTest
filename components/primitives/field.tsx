"use client"

import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

// ============================================================================
// Form field primitives.
//
// Replaces ~20 hand-rolled inputs spanning 4 border colours, 3 heights
// (h-9/h-10/h-11) and 3 focus-ring treatments, and fixes two systemic problems:
//
// 1. LABELS WERE NOT ASSOCIATED. Only 5 htmlFor attributes existed in the entire
//    app; every field in the record-entry form was unlabelled for assistive tech.
//    Field generates an id and wires label -> control automatically, so it cannot
//    be forgotten.
//
// 2. iOS ZOOMED ON EVERY FOCUS. Anything under 16px makes Safari zoom the
//    viewport on focus, so a supervisor tapping through ten fields got ten
//    involuntary zoom-and-reflows. The control classes below are text-base on
//    mobile and only shrink from `sm` up.
//
// Controls are h-11 (44px) on mobile, the minimum comfortable touch target.
// ============================================================================

const CONTROL = [
  "w-full rounded-xl border bg-surface-card text-ink-primary",
  "h-11 sm:h-10 px-3",
  // 16px on mobile prevents iOS zoom-on-focus; 14px from sm up for density.
  "text-base sm:text-sm",
  "border-hairline",
  "focus:border-brand focus:ring-2 focus:ring-brand/20 focus:outline-none",
  "disabled:bg-surface-sunken disabled:text-ink-muted disabled:cursor-not-allowed",
  "transition-colors",
].join(" ")

export function Field({
  label,
  children,
  hint,
  error,
  required,
  className,
  id: idOverride,
}: {
  label: ReactNode
  /** Receives the generated id — spread it onto your control. */
  children: (props: { id: string; "aria-describedby"?: string; "aria-invalid"?: true }) => ReactNode
  hint?: ReactNode
  error?: string | null
  required?: boolean
  className?: string
  /**
   * Supply a deterministic id when something outside this component needs to
   * find the control — e.g. scroll-to-and-focus the first invalid field on
   * submit, which cannot look up a useId() value.
   */
  id?: string
}) {
  const generated = useId()
  const id = idOverride ?? generated
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined

  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-xs font-bold uppercase tracking-wide text-ink-secondary">
        {label}
        {required && (
          <span className="text-critical ml-0.5" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {children({ id, "aria-describedby": describedBy, ...(error ? { "aria-invalid": true as const } : {}) })}
      {/* aria-live so a validation message is announced when it appears, not only
          discovered by someone who happens to tab back to the field. */}
      {error && (
        <p id={errorId} role="alert" aria-live="polite" className="text-xs font-semibold text-critical-ink">
          {error}
        </p>
      )}
      {hint && !error && (
        <p id={hintId} className="text-xs text-ink-muted">
          {hint}
        </p>
      )}
    </div>
  )
}

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(CONTROL, className)} />
}

/**
 * Numeric input. `inputMode="decimal"` brings up the number pad without
 * type="number"'s spinners and its tolerance of `e`/`+`/`-`.
 */
export function NumberInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input type="text" inputMode="decimal" autoComplete="off" {...props} className={cn(CONTROL, "tnum", className)} />
}

export function TextArea({ className, rows = 3, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={rows} {...props} className={cn(CONTROL, "h-auto py-2 resize-none", className)} />
}

/** Native select with our own chevron — the platform one can't be styled. */
export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select {...props} className={cn(CONTROL, "appearance-none pr-9", className)}>
        {children}
      </select>
      <ChevronDown
        className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted pointer-events-none"
        aria-hidden="true"
      />
    </div>
  )
}

/**
 * Checkbox or radio with a 44px hit area.
 *
 * The raw controls in the record-entry form were w-3.5 h-3.5 — a 14px target,
 * which is a third of the minimum and genuinely hard to hit on a phone while
 * standing at a machine. The padded label is the target here, not the box.
 */
export function Choice({
  label,
  type = "checkbox",
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; type?: "checkbox" | "radio" }) {
  return (
    <label
      className={cn(
        "flex items-center gap-2.5 min-h-11 px-3 rounded-xl border cursor-pointer select-none transition-colors",
        "border-hairline bg-surface-card hover:border-brand/40",
        "has-[:checked]:border-brand has-[:checked]:bg-brand-subtle",
        "has-[:disabled]:opacity-60 has-[:disabled]:cursor-not-allowed",
        className,
      )}
    >
      <input type={type} {...props} className="w-4 h-4 accent-[var(--brand)] shrink-0" />
      <span className="text-sm font-semibold text-ink-secondary">{label}</span>
    </label>
  )
}
