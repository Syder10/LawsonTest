import type { ReportStatus, Attention } from "@/lib/domain/procurement-report"
import { fmtOneDecimal } from "@/lib/domain/report-document"

// Small pieces of the Procurement Stock Analysis Report.
//
// Named ReportStatusBadge (not StatusBadge) so it can never be imported in place
// of the app's own StatusBadge primitive, which pairs status with an icon for the
// dashboards. On paper the WORD carries the status and the colour only reinforces
// it, so this renders text, never colour alone.

const STATUS_CLASS: Record<ReportStatus, string> = {
  Stockout: "rd-status rd-status-stockout",
  Critical: "rd-status rd-status-critical",
  Monitor: "rd-status rd-status-monitor",
  Adequate: "rd-status rd-status-adequate",
}

export function ReportStatusBadge({ status, children }: { status: ReportStatus; children?: React.ReactNode }) {
  return <span className={STATUS_CLASS[status]}>{children ?? status}</span>
}

/**
 * "ATTENTION: <N> days left for <carton> approximately; however, consumption trends
 * should be monitored continuously to maintain production continuity."
 * Rendered only when a carton needs attention — the caller passes null otherwise.
 */
export function AttentionCallout({ attention }: { attention: Attention | null }) {
  if (!attention) return null
  const days = fmtOneDecimal(attention.days)
  return (
    <p className="rd-attention rd-keep" role="note">
      <span className="rd-attention-label">ATTENTION:</span>{" "}
      <span className="rd-attention-alert">
        {days} day{attention.days === 1 ? "" : "s"} left for {attention.label} approximately;
      </span>{" "}
      however, consumption trends should be monitored continuously to maintain production continuity.
    </p>
  )
}
