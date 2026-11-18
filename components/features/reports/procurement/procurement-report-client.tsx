"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  cartonAttention,
  reportDaysLeft,
  reportStatus,
  splitReportSections,
  statusWithDays,
  suggestActions,
  type ProcurementStockSnapshot,
  type ReportAction,
} from "@/lib/domain/procurement-report"
import { windowStart } from "@/lib/domain/date-window"
import {
  fmtInt,
  fmtOneDecimal,
  fmtQty,
  formatReportDate,
  isIsoDate,
  todayISO,
  unitCaption,
} from "@/lib/domain/report-document"
import {
  ReportDesk,
  ReportPaper,
  ReportPrintStyles,
  ReportSignOff,
  ReportSkeleton,
  ReportTable,
  ReportToolbar,
  ToolbarField,
  printDocument,
  toolbarInputClass,
} from "@/components/features/reports/report-document"
import { AttentionCallout, ReportStatusBadge } from "./report-parts"
import { ActionList } from "./action-list"

// ============================================================================
// Procurement Stock Analysis Report — the printable document.
//
// Every figure comes from /api/procurement/report, the same response the Stock
// dashboard reads; every status, days-left value, ATTENTION line and suggested
// action is derived from it in lib/domain/procurement-report. Nothing is typed by
// hand except the two things the spec makes editable: the summary paragraph and
// the action list. Those edits live in this page only (agreed: no saving); print
// or save a PDF before leaving.
//
// No 60-second poll here, unlike the dashboards: a document should not change
// under the person preparing it. Refresh data is explicit.
// ============================================================================

const DEPARTMENT = "Procurement and Stock Department"

export const DEFAULT_SUMMARY =
  "A review of the procurement stock level was conducted using the latest dashboard update. The following observations and procurement priorities are recommended."

type Phase = "loading" | "error" | "ready"

// The plant runs on Ghana time; state the update time there, whatever the viewer's device says.
const timeOf = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleString("en-GB", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Accra" })
}

export function ProcurementReportClient({ preparedBy }: { preparedBy: string | null }) {
  const [today] = useState(todayISO)
  const [date, setDate] = useState(today)
  const [data, setData] = useState<ProcurementStockSnapshot | null>(null)
  const [phase, setPhase] = useState<Phase>("loading")
  const [summary, setSummary] = useState(DEFAULT_SUMMARY)
  const [actions, setActions] = useState<ReportAction[]>([])
  const [actionsEdited, setActionsEdited] = useState(false)
  const requestRef = useRef(0)
  const editedRef = useRef(false)

  const load = useCallback(async (reportDate: string) => {
    const seq = ++requestRef.current
    setPhase("loading")
    try {
      const res = await fetch(`/api/procurement/report?from=${windowStart(reportDate)}&to=${reportDate}`)
      const json = res.ok ? ((await res.json()) as ProcurementStockSnapshot) : null
      if (seq !== requestRef.current) return
      if (!json || !Array.isArray(json.materials)) {
        setPhase("error")
        return
      }
      setData(json)
      // New figures bring new suggestions — unless the office has already edited the
      // list, in which case their wording is kept and "Restore suggestions" is offered.
      if (!editedRef.current) setActions(suggestActions(splitReportSections(json.materials)))
      setPhase("ready")
    } catch {
      if (seq === requestRef.current) setPhase("error")
    }
  }, [])

  useEffect(() => {
    load(date)
  }, [load, date])

  const sections = useMemo(() => (data ? splitReportSections(data.materials) : null), [data])
  const attention = useMemo(() => (sections ? cartonAttention(sections.cartons) : null), [sections])
  const suggestions = useMemo(() => (sections ? suggestActions(sections) : []), [sections])

  const changeActions = (next: ReportAction[]) => {
    editedRef.current = true
    setActionsEdited(true)
    setActions(next)
  }
  const restoreActions = () => {
    editedRef.current = false
    setActionsEdited(false)
    setActions(suggestions)
  }

  const isEmpty = phase === "ready" && data !== null && data.materials.length === 0
  const canPrint = phase === "ready" && !isEmpty
  const fileName = `Procurement Stock Analysis Report ${date}`

  return (
    <div className="space-y-4">
      <ReportPrintStyles />

      <ReportToolbar
        onRefresh={() => load(date)}
        refreshing={phase === "loading"}
        onPrint={() => printDocument()}
        onDownload={() => printDocument(fileName)}
        canPrint={canPrint}
      >
        <ToolbarField label="Report date">
          <input
            type="date"
            className={toolbarInputClass}
            value={date}
            max={today}
            onChange={(e) => {
              if (isIsoDate(e.target.value)) setDate(e.target.value)
            }}
          />
        </ToolbarField>
      </ReportToolbar>

      <ReportDesk busy={phase === "loading"}>
        <ReportPaper department={DEPARTMENT} label="Procurement Stock Analysis Report">
          <h1 className="rd-title">Procurement Stock Analysis Report</h1>
          <p className="rd-dateline">Date: {formatReportDate(date)}</p>

          {phase === "loading" && !data && (
            <div className="rd-section">
              <span className="sr-only" role="status">
                Loading report
              </span>
              <ReportSkeleton lines={14} />
            </div>
          )}

          {phase === "error" && (
            <div className="rd-section" role="alert">
              <p>The report data could not be loaded. Check your connection and try again.</p>
              <button
                type="button"
                className="no-print mt-3 h-11 px-4 rounded-xl bg-brand-solid text-brand-ink text-sm font-bold"
                onClick={() => load(date)}
              >
                Retry
              </button>
            </div>
          )}

          {isEmpty && (
            <div className="rd-section">
              <p>No data available for this date.</p>
            </div>
          )}

          {data && sections && !isEmpty && phase !== "error" && (
            <div style={{ opacity: phase === "loading" ? 0.6 : 1, transition: "opacity 160ms" }}>
              {/* 3. Executive Summary */}
              <section className="rd-section" aria-labelledby="psr-summary">
                <h2 id="psr-summary">Executive Summary</h2>
                <label htmlFor="psr-summary-text" className="sr-only">
                  Executive summary text
                </label>
                <textarea
                  id="psr-summary-text"
                  className="rd-edit-area no-print rd-screen-only"
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  rows={3}
                />
                <p className="rd-body rd-print-only">{summary}</p>
              </section>

              {/* 4. Carton Stock Assessment */}
              <section className="rd-section" aria-labelledby="psr-cartons">
                <h2 id="psr-cartons">Carton Stock Assessment</h2>
                {sections.cartons.length === 0 ? (
                  <p>No carton stock is recorded.</p>
                ) : (
                  <ReportTable
                    caption={`Used stock over ${formatReportDate(data.filters.from)} – ${formatReportDate(data.filters.to)}. Remaining stock as at ${timeOf(data.last_updated)}.`}
                  >
                    <thead>
                      <tr>
                        <th scope="col">Carton Type</th>
                        <th scope="col" className="rd-num">Remaining Stock</th>
                        <th scope="col" className="rd-num">Used Stock</th>
                        <th scope="col">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sections.cartons.map((c) => (
                        <tr key={c.key}>
                          <th scope="row">{c.label}</th>
                          <td className="rd-num">{fmtInt(c.remaining)} {c.unit}</td>
                          <td className="rd-num">{fmtInt(c.usedInWindow)} {c.unit}</td>
                          <td>
                            <ReportStatusBadge status={reportStatus(c)}>{statusWithDays(c)}</ReportStatusBadge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </ReportTable>
                )}
                <AttentionCallout attention={attention} />
              </section>

              {/* 5. Other Production Materials Assessment */}
              <section className="rd-section" aria-labelledby="psr-materials">
                <h2 id="psr-materials" className="rd-h2-green">
                  Other Production Materials Assessment
                </h2>
                {sections.materials.length === 0 ? (
                  <p>No production materials are recorded.</p>
                ) : (
                  <ReportTable
                    caption={`Days left are operating days (Monday–Saturday). Critical at ${data.thresholds.redDays} days or fewer; Monitor at ${data.thresholds.amberDays} or fewer; Stockout when nothing remains.`}
                  >
                    <thead>
                      <tr>
                        <th scope="col">Material</th>
                        <th scope="col" className="rd-num">Stock Remaining</th>
                        <th scope="col" className="rd-num">Days Left</th>
                        <th scope="col">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sections.materials.map((m, i) => {
                        const status = reportStatus(m)
                        const days = reportDaysLeft(m)
                        const red = status === "Critical" || status === "Stockout"
                        return (
                          <tr key={m.key}>
                            <th scope="row">
                              {i + 1}. {m.label}
                            </th>
                            <td className="rd-num">
                              {fmtQty(m.remaining)} {unitCaption(m.unit)}
                            </td>
                            <td className={`rd-num${red ? " rd-red rd-status" : ""}`}>
                              {days === null ? "No usage" : fmtOneDecimal(days)}
                            </td>
                            <td>
                              <ReportStatusBadge status={status} />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </ReportTable>
                )}
              </section>

              {/* 6. Tax Stamps Assessment */}
              <section className="rd-section rd-gap rd-keep" aria-labelledby="psr-stamps">
                <h2 id="psr-stamps" className="rd-h2-underline">
                  Tax Stamps Assessment
                </h2>
                <p>
                  Remaining Tax Stamps: {fmtInt(data.taxStamps.boxes)} box{data.taxStamps.boxes === 1 ? "" : "es"},{" "}
                  {fmtInt(data.taxStamps.pieces)} piece{data.taxStamps.pieces === 1 ? "" : "s"}
                </p>
              </section>

              {/* 7. Priority Procurement Actions */}
              <section className="rd-section" aria-labelledby="psr-actions">
                <h2 id="psr-actions" className="rd-h2-underline rd-h2-large">
                  Priority Procurement Actions
                </h2>
                <ActionList actions={actions} onChange={changeActions} onRestore={restoreActions} canRestore={actionsEdited} />
              </section>

              <ReportSignOff preparedBy={preparedBy} owner="procurement" />
            </div>
          )}
        </ReportPaper>
      </ReportDesk>
    </div>
  )
}
