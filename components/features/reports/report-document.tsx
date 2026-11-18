"use client"

import type { ReactNode } from "react"
import { Download, Loader2, Printer, RefreshCw } from "lucide-react"
import { CHECKED_BY_TITLE, documentHeaderText, preparedByName, type ReportOwner } from "@/lib/domain/report-document"
import { cn } from "@/lib/utils"
import "./report-document.css"

// ============================================================================
// Printed report template.
//
// The building blocks every formal document shares — the grey desk, the A4
// paper, the green house header that repeats on every printed page, the grid
// table and the screen-only toolbar. See report-document.css for the colour and
// print rules.
// ============================================================================

/**
 * Page size, margins and app chrome for printing. Rendered only while a report is
 * mounted, so it cannot change how any other screen prints. Hides the app header,
 * nav and anything marked `.no-print`, the same convention as the monthly stock
 * report.
 */
export function ReportPrintStyles() {
  return (
    <style>{`
@page { size: A4 portrait; margin: 1in; }
@media print {
  header, nav, aside, .no-print { display: none !important; }
  main { padding: 0 !important; margin: 0 !important; max-width: none !important; }
  html, body, main { background: #fff !important; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
`}</style>
  )
}

/** The green house header: "LAWSON LLC – <DEPARTMENT>", with the accent block at its left edge. */
export function ReportHeader({ department }: { department: string }) {
  return (
    <div className="rd-header">
      <span className="rd-header-accent" aria-hidden="true" />
      <p className="rd-header-bar">{documentHeaderText(department)}</p>
    </div>
  )
}

/** The grey background the paper sits on. Holds one or more ReportPaper sheets. */
export function ReportDesk({ children, busy = false }: { children: ReactNode; busy?: boolean }) {
  return (
    <div className="rd-desk" aria-busy={busy || undefined}>
      {children}
    </div>
  )
}

/**
 * One document. Its content sits in the body of a layout table whose header is
 * the house header, which is what makes the header repeat on every printed page.
 */
export function ReportPaper({
  department,
  children,
  label,
}: {
  department: string
  children: ReactNode
  /** Accessible name for the document region. */
  label: string
}) {
  return (
    <article className="rd-paper" aria-label={label}>
      <table className="rd-frame" role="presentation">
        <thead>
          <tr>
            <td>
              <ReportHeader department={department} />
            </td>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{children}</td>
          </tr>
        </tbody>
      </table>
    </article>
  )
}

/**
 * The sign-off at the foot of a document: prepared by the account printing it,
 * checked by the manager who owns that department's report.
 */
export function ReportSignOff({ preparedBy, owner }: { preparedBy: string | null; owner: ReportOwner }) {
  return (
    <div className="rd-signoff">
      <p>
        <span className="rd-signoff-label">Prepared by:</span>
        <span className="rd-signoff-value">{preparedByName(preparedBy)}</span>
      </p>
      <p>
        <span className="rd-signoff-label">Checked by:</span>
        <span className="rd-signoff-value">{CHECKED_BY_TITLE[owner]}</span>
      </p>
    </div>
  )
}

/** A full-width grid table that scrolls sideways on a phone instead of squeezing. */
export function ReportTable({
  children,
  caption,
  compact = false,
  className,
}: {
  children: ReactNode
  caption?: ReactNode
  compact?: boolean
  className?: string
}) {
  return (
    <div className="rd-scroll">
      <table className={cn("rd-table", compact && "rd-compact", className)}>
        {caption && <caption>{caption}</caption>}
        {children}
      </table>
    </div>
  )
}

/** Placeholder lines while a document loads. */
export function ReportSkeleton({ lines = 10 }: { lines?: number }) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} className="rd-skeleton" style={{ width: `${[92, 70, 85, 60, 95, 78][i % 6]}%` }} />
      ))}
    </div>
  )
}

/**
 * Print with a suggested file name. Browsers use the document title as the default
 * name in "Save as PDF", so the title is swapped for the print and put back after.
 */
export function printDocument(fileName?: string) {
  const previous = document.title
  if (fileName) document.title = fileName
  const restore = () => {
    document.title = previous
    window.removeEventListener("afterprint", restore)
  }
  window.addEventListener("afterprint", restore)
  window.print()
}

const toolbarButton =
  "h-11 px-3.5 inline-flex items-center gap-2 rounded-xl border border-hairline bg-surface-card text-sm font-semibold text-ink-primary transition-colors hover:bg-surface-sunken disabled:opacity-60 active:scale-[0.97]"

/**
 * The screen-only toolbar above the paper: whatever controls the report needs on
 * the left (a date, a month, a department), Refresh / Print / Download PDF on the right.
 */
export function ReportToolbar({
  children,
  onRefresh,
  refreshing,
  onPrint,
  onDownload,
  canPrint,
}: {
  children?: ReactNode
  onRefresh: () => void
  refreshing: boolean
  onPrint: () => void
  onDownload: () => void
  canPrint: boolean
}) {
  return (
    <div className="no-print rd-screen-only flex flex-wrap items-end justify-between gap-3">
      <div className="flex flex-wrap items-end gap-3">{children}</div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={toolbarButton} onClick={onRefresh} disabled={refreshing}>
          {refreshing ? (
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
          )}
          Refresh data
        </button>
        <button type="button" className={toolbarButton} onClick={onPrint} disabled={!canPrint}>
          <Printer className="w-4 h-4" aria-hidden="true" />
          Print
        </button>
        <button
          type="button"
          className={cn(toolbarButton, "bg-brand-solid text-brand-ink border-brand-solid hover:bg-brand-solid-hover")}
          onClick={onDownload}
          disabled={!canPrint}
          title="Opens the print dialog — choose “Save as PDF” as the destination"
        >
          <Download className="w-4 h-4" aria-hidden="true" />
          Download PDF
        </button>
      </div>
    </div>
  )
}

/** A labelled control in the toolbar (16px text so iOS does not zoom on focus). */
export function ToolbarField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-wide text-ink-muted">
      {label}
      {children}
    </label>
  )
}

export const toolbarInputClass =
  "h-11 rounded-xl border border-hairline bg-surface-card px-3 text-base font-medium normal-case tracking-normal text-ink-primary"
