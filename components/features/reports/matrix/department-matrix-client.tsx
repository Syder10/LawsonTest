"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import {
  DEPARTMENT_MATRICES,
  cellShift,
  matrixGroupColumns,
  matrixMeasures,
  measureValue,
  monthBounds,
  noWorkCellKey,
  placeNoWork,
  type NoWorkRow,
  type DepartmentKey,
  type DepartmentMatrixDef,
  type MatrixMeasure,
  type MatrixRecord,
} from "@/lib/domain/department-matrix"
import { buildProductionPivotMatrix, type ProductionPivotMatrix } from "@/lib/domain/production-pivot"
import { fmtInt, fmtOneDecimal, fmtQty, formatDayDate, formatReportMonth, todayISO } from "@/lib/domain/report-document"
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

// ============================================================================
// Department production matrices — the manager's printable monthly reports.
//
// One sheet per department and measure: every day of the month down the side,
// the rotation groups across, totals at the foot, no-work reasons in Remarks.
// The rows are read by the same readers the on-screen pivot tables use and the
// matrix is built by the same builder (lib/domain/department-matrix,
// production-pivot), so the paper and the screen show the same numbers.
//
// Deliberately plain: black on white, a grey header row and grey Sundays (the
// plant is closed Sundays), the green house bar at the top and nothing else.
// ============================================================================

type Phase = "loading" | "error" | "ready"

interface Sheet {
  def: DepartmentMatrixDef
  measure: MatrixMeasure
  matrix: ProductionPivotMatrix
  remarks: Map<string, string>
  /** "date|column" → the shift(s) that did not run (see placeNoWork). */
  noWorkCells: Map<string, string[]>
}

const ALL = "all"

const [thisYear, thisMonth] = todayISO().split("-").map(Number)
const monthValue = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}`

const cell = (n: number) => (n === 0 ? "–" : fmtQty(n))

/**
 * A group cell, shaded by the shift that produced it (see cellShift). A group whose
 * shift did not run reads "No work" in its own cell, shaded for that shift, with the
 * reason in Remarks. Should output also have been filed for it, both are shown.
 */
function GroupCell({
  value,
  shifts,
  noWorkShifts = [],
}: {
  value: number
  shifts: { shift: string; value: number }[]
  noWorkShifts?: string[]
}) {
  const produced = cellShift(shifts)
  const idle = noWorkShifts.length > 0 ? cellShift(noWorkShifts.map((shift) => ({ shift, value: 1 }))) : null
  const tone = produced.tone !== "none" || !idle ? produced.tone : idle.tone
  const shiftClass = tone === "afternoon" || tone === "night" ? ` rd-shift-${tone}` : ""
  if (idle && value === 0) {
    return (
      <td className={`rd-num${shiftClass}`}>
        <span className="rd-no-work">No work</span>
        {idle.initials && <span className="rd-shift-initials">({idle.initials})</span>}
      </td>
    )
  }
  return (
    <td className={`rd-num${shiftClass}`}>
      {cell(value)}
      {produced.initials && <span className="rd-shift-initials">({produced.initials})</span>}
      {idle && <span className="rd-no-work rd-no-work-note">no work filed</span>}
    </td>
  )
}

const GROUP_CELL = { 1: "group1", 2: "group2", 3: "group3" } as const
const GROUP_TOTAL = { 1: "group1Total", 2: "group2Total", 3: "group3Total" } as const
const GROUP_SHARE = { 1: "group1Share", 2: "group2Share", 3: "group3Share" } as const

function MatrixSheet({ sheet, preparedBy }: { sheet: Sheet; preparedBy: string | null }) {
  const { def, measure, matrix, remarks, noWorkCells } = sheet
  const s = matrix.summary
  // Only the groups this department rosters (plus any that actually filed output).
  const groups = matrixGroupColumns(
    def.department,
    s,
    [...noWorkCells.keys()].map((k) => Number(k.split("|")[1])).filter((g) => g > 0),
  )
  const label = `${def.department} — ${measure.label}`
  return (
    <ReportPaper department={`${def.department} Department`} label={`${label}, ${matrix.monthName} ${matrix.year}`}>
      <h1 className="rd-title">Monthly Production Matrix</h1>
      <p className="rd-dateline">
        {def.department} · {measure.label} ({measure.unit}) · {formatReportMonth(matrix.year, matrix.month)}
      </p>

      <section className="rd-section rd-section-tight" aria-label="Month summary">
        <dl className="rd-summary">
          <div>
            <dt>Month total</dt>
            <dd>
              {fmtQty(s.totalValue)} {measure.unit}
            </dd>
          </div>
          <div>
            <dt>Days with output</dt>
            <dd>{fmtInt(s.operatingDays)}</dd>
          </div>
          <div>
            <dt>Daily average</dt>
            <dd>{s.operatingDays > 0 ? `${fmtOneDecimal(s.dailyAverage)} ${measure.unit}` : "–"}</dd>
          </div>
          <div>
            <dt>Peak day</dt>
            <dd>{s.peakDate ? `${formatDayDate(s.peakDate)} (${fmtQty(s.peakValue)})` : "–"}</dd>
          </div>
        </dl>
      </section>

      <section className="rd-section rd-section-tight" aria-label={`${label} by day`}>
        <ReportTable
          compact
          caption={
            <>
              Figures in {measure.unit}. Shift: <span className="rd-legend">Morning</span>
              <span className="rd-legend rd-legend-afternoon">Afternoon</span>
              <span className="rd-legend rd-legend-night">Night</span>. (M+N): two shifts in one cell. &ldquo;No work&rdquo;: shown under the
              group that recorded it, reason in Remarks. Part Time includes records without a group.
            </>
          }
        >
          <thead>
            <tr>
              <th scope="col">Date</th>
              {groups.map((g) => (
                <th key={g} scope="col" className="rd-num">
                  Group {g}
                </th>
              ))}
              <th scope="col" className="rd-num">Part Time</th>
              <th scope="col" className="rd-num">Total</th>
              <th scope="col">Remarks</th>
            </tr>
          </thead>
          <tbody>
            {matrix.rows.map((r) => (
              <tr key={r.date}>
                <th scope="row" className={r.isWeekend ? "rd-nowrap rd-sunday" : "rd-nowrap"}>
                  {formatDayDate(r.date)}
                </th>
                {groups.map((g) => (
                  <GroupCell
                    key={g}
                    value={r[GROUP_CELL[g]].value}
                    shifts={r[GROUP_CELL[g]].shifts}
                    noWorkShifts={noWorkCells.get(noWorkCellKey(r.date, g))}
                  />
                ))}
                <GroupCell
                  value={r.partTime.value}
                  shifts={r.partTime.shifts}
                  noWorkShifts={noWorkCells.get(noWorkCellKey(r.date, "pt"))}
                />
                <td className="rd-num">
                  <strong>{cell(r.total)}</strong>
                </td>
                <td>{remarks.get(r.date) ?? ""}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">
                Total
              </th>
              {groups.map((g) => (
                <td key={g} className="rd-num">
                  {fmtQty(s[GROUP_TOTAL[g]])}
                </td>
              ))}
              <td className="rd-num">{fmtQty(s.partTimeTotal)}</td>
              <td className="rd-num">{fmtQty(s.totalValue)}</td>
              <td />
            </tr>
            <tr>
              <th scope="row">
                Share
              </th>
              {groups.map((g) => (
                <td key={g} className="rd-num">
                  {s.totalValue > 0 ? `${fmtOneDecimal(s[GROUP_SHARE[g]])}%` : "–"}
                </td>
              ))}
              <td className="rd-num">{s.totalValue > 0 ? `${fmtOneDecimal(s.partTimeShare)}%` : "–"}</td>
              <td className="rd-num">{s.totalValue > 0 ? "100%" : "–"}</td>
              <td />
            </tr>
          </tfoot>
        </ReportTable>
      </section>

      <ReportSignOff preparedBy={preparedBy} owner="production" />
    </ReportPaper>
  )
}

export function DepartmentMatrixClient({ preparedBy }: { preparedBy: string | null }) {
  const supabase = getSupabaseBrowserClient()
  const [month, setMonth] = useState(() => monthValue(thisYear, thisMonth))
  const [department, setDepartment] = useState<DepartmentKey | typeof ALL>(ALL)
  const [measureKey, setMeasureKey] = useState<string>(ALL)
  const [records, setRecords] = useState<Map<DepartmentKey, MatrixRecord[]>>(new Map())
  const [noWork, setNoWork] = useState<(NoWorkRow & { department: unknown })[]>([])
  const [phase, setPhase] = useState<Phase>("loading")
  const requestRef = useRef(0)

  const [year, monthNumber] = month.split("-").map(Number)
  const selectedDefs = useMemo(
    () => DEPARTMENT_MATRICES.filter((d) => department === ALL || d.key === department),
    [department],
  )

  const load = useCallback(async () => {
    const seq = ++requestRef.current
    setPhase("loading")
    const { from, to } = monthBounds(year, monthNumber)
    try {
      const [nwRes, ...results] = await Promise.all([
        supabase.from("no_work_records").select("date, shift, group_number, department, reason").gte("date", from).lte("date", to),
        ...selectedDefs.map((def) =>
          supabase.from(def.table).select(def.select).gte("date", from).lte("date", to).order("date", { ascending: true }),
        ),
      ])
      if (seq !== requestRef.current) return
      if (results.some((r) => r.error)) {
        setPhase("error")
        return
      }
      const next = new Map<DepartmentKey, MatrixRecord[]>()
      selectedDefs.forEach((def, i) => {
        // The selected columns vary by department, so the typed client cannot name one
        // row type for all four; every reader takes a plain record and coerces each field.
        next.set(def.key, def.read((results[i].data ?? []) as unknown as Record<string, unknown>[]))
      })
      setRecords(next)
      setNoWork(nwRes.data ?? [])
      setPhase("ready")
    } catch {
      if (seq === requestRef.current) setPhase("error")
    }
  }, [supabase, selectedDefs, year, monthNumber])

  useEffect(() => {
    load()
  }, [load])

  const singleDef = department === ALL ? null : selectedDefs[0]
  const singleMeasures = singleDef ? matrixMeasures(singleDef) : []

  const sheets: Sheet[] = useMemo(() => {
    if (phase === "error") return []
    return selectedDefs.flatMap((def) => {
      const recs = records.get(def.key)
      if (!recs) return []
      const { cells: noWorkCells, remarks } = placeNoWork(noWork.filter((n) => n.department === def.department))
      return matrixMeasures(def)
        .filter((m) => measureKey === ALL || department === ALL || m.key === measureKey)
        .map((measure) => ({
          def,
          measure,
          remarks,
          noWorkCells,
          matrix: buildProductionPivotMatrix({
            year,
            month: monthNumber,
            records: recs,
            valueExtractor: (r) => measureValue(r, measure),
            unit: measure.unit,
          }),
        }))
    })
  }, [phase, selectedDefs, records, noWork, measureKey, department, year, monthNumber])

  const canPrint = phase === "ready" && sheets.length > 0
  const fileName = `Production Matrix ${singleDef ? singleDef.department : "All Departments"} ${month}`

  return (
    <div className="space-y-4">
      <ReportPrintStyles />

      <ReportToolbar
        onRefresh={load}
        refreshing={phase === "loading"}
        onPrint={() => printDocument()}
        onDownload={() => printDocument(fileName)}
        canPrint={canPrint}
      >
        <ToolbarField label="Month">
          <input
            type="month"
            className={toolbarInputClass}
            value={month}
            max={monthValue(thisYear, thisMonth)}
            onChange={(e) => {
              if (/^\d{4}-\d{2}$/.test(e.target.value)) setMonth(e.target.value)
            }}
          />
        </ToolbarField>
        <ToolbarField label="Department">
          <select
            className={toolbarInputClass}
            value={department}
            onChange={(e) => {
              setDepartment(e.target.value as DepartmentKey | typeof ALL)
              setMeasureKey(ALL)
            }}
          >
            <option value={ALL}>All departments</option>
            {DEPARTMENT_MATRICES.map((d) => (
              <option key={d.key} value={d.key}>
                {d.department}
              </option>
            ))}
          </select>
        </ToolbarField>
        {singleMeasures.length > 1 && (
          <ToolbarField label="Measure">
            <select className={toolbarInputClass} value={measureKey} onChange={(e) => setMeasureKey(e.target.value)}>
              <option value={ALL}>All measures</option>
              {singleMeasures.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label} ({m.unit})
                </option>
              ))}
            </select>
          </ToolbarField>
        )}
      </ReportToolbar>

      <p className="no-print text-sm text-ink-secondary">
        {phase === "ready" && sheets.length > 0
          ? `${sheets.length} sheet${sheets.length === 1 ? "" : "s"} · each prints on its own pages with the department header repeated.`
          : " "}
      </p>

      <ReportDesk busy={phase === "loading"}>
        {phase === "loading" && sheets.length === 0 && (
          <ReportPaper department="Production Department" label="Loading production matrix">
            <h1 className="rd-title">Monthly Production Matrix</h1>
            <span className="sr-only" role="status">
              Loading production records
            </span>
            <div className="rd-section">
              <ReportSkeleton lines={18} />
            </div>
          </ReportPaper>
        )}

        {phase === "error" && (
          <ReportPaper department="Production Department" label="Production matrix unavailable">
            <h1 className="rd-title">Monthly Production Matrix</h1>
            <div className="rd-section" role="alert">
              <p>The production records could not be loaded. Check your connection and try again.</p>
              <button
                type="button"
                className="no-print mt-3 h-11 px-4 rounded-xl bg-brand-solid text-brand-ink text-sm font-bold"
                onClick={load}
              >
                Retry
              </button>
            </div>
          </ReportPaper>
        )}

        <div style={{ opacity: phase === "loading" ? 0.6 : 1, transition: "opacity 160ms" }}>
          {sheets.map((sheet) => (
            <MatrixSheet key={`${sheet.def.key}-${sheet.measure.key}`} sheet={sheet} preparedBy={preparedBy} />
          ))}
        </div>
      </ReportDesk>
    </div>
  )
}
