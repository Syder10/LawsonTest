"use client"

import Link from "next/link"
import { CheckCircle2, Home, Plus } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Chip } from "@/components/primitives"

export interface SuccessInfo {
  recordType: string
  department: string
  shift: string
  date: string
  count: number
}

// ============================================================================
// Submission confirmation.
//
// Built on the Dialog primitive so focus trapping, Escape, scroll lock and
// aria-modal come for free. The previous version was a hand-rolled `fixed
// inset-0` overlay with none of those — the only way out with a keyboard was a
// 10px "Dismiss" link.
//
// THE CONFETTI IS GONE, deliberately. A supervisor submits several records every
// shift, so this screen is seen tens of times a day — and animation at that
// frequency stops being delight and becomes latency between them and the next
// task. Twenty emoji spans with runtime-injected keyframes was also the one place
// emoji were doing an icon's job. What remains is a single short check-mark pop:
// it confirms the state changed, which is the only job this animation has.
// (Say the word and the celebration comes back — it is a few lines.)
//
// "Add another" and "Dashboard" now go to genuinely different places. Previously
// three affordances led to two outcomes, with "Add More" and the backdrop both
// returning to the same page.
// ============================================================================

export function SuccessToast({
  info,
  onDismiss,
  onAnother,
}: {
  info: SuccessInfo
  onDismiss: () => void
  onAnother: () => void
}) {
  const submittedAt = new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
  const dateLabel = info.date
    ? new Date(info.date + "T00:00:00Z").toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      })
    : ""

  return (
    <Dialog open onOpenChange={(open) => !open && onDismiss()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <div className="mx-auto mb-1 w-14 h-14 rounded-full bg-good-subtle flex items-center justify-center animate-check-pop">
            <CheckCircle2 className="w-8 h-8 text-good" strokeWidth={2.5} aria-hidden="true" />
          </div>
          <DialogTitle className="text-center">
            {info.count > 1 ? `${info.count} records saved` : "Record saved"}
          </DialogTitle>
          <DialogDescription className="text-center">
            Submitted at {submittedAt}.
          </DialogDescription>
        </DialogHeader>

        <dl className="rounded-2xl border border-hairline bg-surface-sunken p-3.5 space-y-2 text-sm">
          <Row label="Record">{info.recordType}</Row>
          {info.department && <Row label="Department">{info.department}</Row>}
          {info.shift && (
            <Row label="Shift">
              <Chip tone="brand">{info.shift}</Chip>
            </Row>
          )}
          {dateLabel && <Row label="Date">{dateLabel}</Row>}
        </dl>

        <div className="grid grid-cols-2 gap-2.5">
          <button
            onClick={onAnother}
            className="h-11 flex items-center justify-center gap-1.5 rounded-xl bg-brand-solid hover:bg-brand-solid-hover text-brand-ink text-sm font-bold transition-colors active:scale-[0.97]"
          >
            <Plus className="w-4 h-4" aria-hidden="true" /> Add another
          </button>
          <Link
            href="/dashboard"
            className="h-11 flex items-center justify-center gap-1.5 rounded-xl border border-hairline bg-surface-card hover:bg-surface-sunken text-ink-secondary text-sm font-bold transition-colors active:scale-[0.97]"
          >
            <Home className="w-4 h-4" aria-hidden="true" /> Dashboard
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** A definition row — the record type wraps rather than truncating, since it is
 *  the single most important line in the confirmation. */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between items-start gap-3">
      <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted shrink-0 pt-0.5">{label}</dt>
      <dd className="font-semibold text-ink-primary text-right">{children}</dd>
    </div>
  )
}
