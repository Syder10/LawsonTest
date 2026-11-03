"use client"

import { Fragment, useCallback, useEffect, useRef, useState } from "react"
import { AlertCircle, Calendar, Check, Download, Edit2, Loader2, Printer, RefreshCw, X } from "lucide-react"
import type { Product } from "@/lib/db/types"
import {
  PRODUCT_REPORT_NAMES,
  buildBranchStatement,
  buildReportCsvRows,
  formatPeriodTitle,
  formatQty,
  summarizeReturnsLog,
  type MonthlyStockReport,
} from "@/lib/domain/monthly-stock-report"
import { Card, EmptyState, PageHeader } from "@/components/primitives"

// ============================================================================
// Monthly stock report.
//
// Laid out like the printed "Stock Report" the business files every month:
//   Page 1  the statement (opening stock -> closing stock) with Notes / Table 1
//   Page 2  Table 2, the returns list
//   Page 3  the branch-by-branch matrix (landscape)
// Every figure comes from /api/stock/monthly-report; nothing is recalculated here.
// ============================================================================

const PRODUCTS: { key: Product; label: string }[] = [
  { key: "Bitters", label: "De-Ray Man Abitters" },
  { key: "Ginger", label: "De-Ray Man Ginger Liquor" },
]

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

const FIRST_YEAR = 2024

// Opening stock is derived from the ledger unless someone confirms a baseline by
// hand. The July 2026 baselines were confirmed by the business and are kept for
// that month only. They used to be applied to EVERY month, which made each month's
// opening (and so its closing) stock wrong.
const CONFIRMED_OPENING: Record<string, number> = {
  "Bitters-2026-7": 8127,
  "Ginger-2026-7": 3768,
}
const openingKey = (product: Product, year: number, month: number) => `${product}-${year}-${month}`

// Rules for printing: only the report pages come out, one per sheet of paper, and
// the branch matrix on a landscape page. The app header and tab bar are hidden.
const PRINT_CSS = `
@page { size: A4 portrait; margin: 14mm; }
@page branch-sheet { size: A4 landscape; margin: 12mm; }
@media print {
  header, nav, .no-print { display: none !important; }
  main { padding: 0 !important; max-width: none !important; }
  body, main { background: #fff !important; }
  .sheet { background: #fff !important; border: 0 !important; border-radius: 0 !important; box-shadow: none !important; padding: 0 !important; break-after: page; }
  .sheet:last-of-type { break-after: auto; }
  .sheet-landscape { page: branch-sheet; }
  .sheet, .sheet * { color: #000 !important; border-color: #000 !important; background-color: transparent !important; }
  .sheet .green-cell { background-color: #70ad47 !important; color: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .sheet-scroll { overflow: visible !important; }
}
`

const nowYearMonth = () => {
  const n = new Date()
  return { year: n.getUTCFullYear(), month: n.getUTCMonth() + 1 }
}

function SheetHeading({ product, year, month }: { product: Product; year: number; month: number }) {
  return (
    <div className="text-center text-sm font-bold uppercase leading-snug text-ink-primary">
      <p>Lawson Limited Company</p>
      <p>{PRODUCT_REPORT_NAMES[product]}</p>
      <p>{formatPeriodTitle(year, month)}</p>
    </div>
  )
}

const NUM = "px-2 py-0.5 text-right tabular-nums text-ink-primary"
const LINE = "border-b border-ink-primary"

export function MonthlyReportClient() {
  const initial = nowYearMonth()
  const [selectedProduct, setSelectedProduct] = useState<Product>("Bitters")
  const [selectedYear, setSelectedYear] = useState<number>(initial.year)
  const [selectedMonth, setSelectedMonth] = useState<number>(initial.month)
  const [report, setReport] = useState<MonthlyStockReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  // Hand-confirmed opening balances, per product and month, for this visit only.
  const [openingOverrides, setOpeningOverrides] = useState<Record<string, number>>(CONFIRMED_OPENING)
  const [isEditingOpening, setIsEditingOpening] = useState(false)
  const [tempOpening, setTempOpening] = useState("")
  // A slow response for an earlier month must not land after a newer one.
  const requestRef = useRef(0)

  const overrideKey = openingKey(selectedProduct, selectedYear, selectedMonth)
  const override = openingOverrides[overrideKey]

  const load = useCallback(async () => {
    const seq = ++requestRef.current
    setLoading(true)
    setError(false)
    try {
      const params = new URLSearchParams({
        year: String(selectedYear),
        month: String(selectedMonth),
        product: selectedProduct,
      })
      if (override !== undefined) params.set("openingStock", String(override))
      const res = await fetch(`/api/stock/monthly-report?${params}`)
      if (!res.ok) throw new Error("Failed to load report")
      const data = (await res.json()) as MonthlyStockReport
      if (seq === requestRef.current) setReport(data)
    } catch {
      if (seq === requestRef.current) {
        setReport(null)
        setError(true)
      }
    } finally {
      if (seq === requestRef.current) setLoading(false)
    }
  }, [selectedYear, selectedMonth, selectedProduct, override])

  useEffect(() => {
    // Inner async keeps the setState calls off the effect's synchronous path.
    const run = async () => { await load() }
    void run()
  }, [load])

  const years: number[] = []
  for (let y = FIRST_YEAR; y <= Math.max(initial.year, selectedYear); y++) years.push(y)

  const exportCsv = () => {
    if (!report) return
    const csv = buildReportCsvRows(report)
      .map((row) =>
        row
          .map((c) => {
            const s = c === null || c === undefined ? "" : String(c)
            return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
          })
          .join(","),
      )
      .join("\n")

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `stock_report_${report.product.toLowerCase()}_${report.period.year}_${String(report.period.month).padStart(2, "0")}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const applyOpening = () => {
    const val = Number(tempOpening)
    if (tempOpening.trim() !== "" && Number.isFinite(val) && val >= 0) {
      setOpeningOverrides((prev) => ({ ...prev, [overrideKey]: val }))
      setIsEditingOpening(false)
    }
  }

  const resetOpening = () => {
    setOpeningOverrides((prev) => {
      const next = { ...prev }
      delete next[overrideKey]
      return next
    })
    setIsEditingOpening(false)
  }

  const returnsTotals = report ? summarizeReturnsLog(report.returnsLog) : null
  const branchStatement = report ? buildBranchStatement(report) : null

  return (
    <div className="space-y-5 animate-fade-in-up pb-12">
      <style>{PRINT_CSS}</style>

      <div className="no-print space-y-5">
        <PageHeader
          title="Monthly stock report"
          description="Opening to closing stock, production by group, returns and branch distribution"
          actions={
            <div className="flex items-center gap-2">
              <button
                onClick={exportCsv}
                disabled={!report || loading}
                className="h-9 px-3 flex items-center gap-1.5 rounded-lg border border-hairline bg-surface-card text-xs font-bold text-ink-secondary hover:border-brand transition-colors disabled:opacity-60"
              >
                <Download className="w-3.5 h-3.5" aria-hidden="true" /> Export CSV
              </button>
              <button
                onClick={() => window.print()}
                disabled={!report || loading}
                className="h-9 px-3 flex items-center gap-1.5 rounded-lg border border-hairline bg-surface-card text-xs font-bold text-ink-secondary hover:border-brand transition-colors disabled:opacity-60"
              >
                <Printer className="w-3.5 h-3.5" aria-hidden="true" /> Print
              </button>
              <button
                onClick={load}
                disabled={loading}
                className="h-9 px-3 flex items-center gap-1.5 rounded-lg border border-hairline bg-surface-card text-xs font-bold text-ink-secondary hover:border-brand transition-colors disabled:opacity-60"
              >
                {loading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                )}
                Refresh
              </button>
            </div>
          }
        />

        {/* Product, period and the opening-stock baseline. */}
        <div className="bg-surface-card rounded-2xl border border-hairline p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center p-1 bg-surface-sunken rounded-xl border border-hairline self-start">
            {PRODUCTS.map((p) => (
              <button
                key={p.key}
                onClick={() => { setSelectedProduct(p.key); setIsEditingOpening(false) }}
                aria-pressed={selectedProduct === p.key}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                  selectedProduct === p.key
                    ? "bg-surface-card text-ink-primary shadow-sm"
                    : "text-ink-secondary hover:text-ink-primary"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5 bg-surface-sunken px-3 py-1.5 rounded-xl border border-hairline">
              <Calendar className="w-4 h-4 text-ink-secondary" aria-hidden="true" />
              <select
                value={selectedMonth}
                onChange={(e) => { setSelectedMonth(Number(e.target.value)); setIsEditingOpening(false) }}
                aria-label="Select month"
                className="bg-transparent text-xs font-bold text-ink-primary outline-none cursor-pointer"
              >
                {MONTHS.map((name, i) => (
                  <option key={name} value={i + 1}>{name}</option>
                ))}
              </select>
              <select
                value={selectedYear}
                onChange={(e) => { setSelectedYear(Number(e.target.value)); setIsEditingOpening(false) }}
                aria-label="Select year"
                className="bg-transparent text-xs font-bold text-ink-primary outline-none cursor-pointer border-l border-hairline pl-2"
              >
                {years.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            {report && (
              <div className="flex items-center gap-2 text-xs">
                <span className="font-semibold text-ink-secondary">Opening stock</span>
                {isEditingOpening ? (
                  <>
                    <input
                      type="number"
                      min={0}
                      value={tempOpening}
                      onChange={(e) => setTempOpening(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") applyOpening() }}
                      aria-label="Opening stock in cartons"
                      className="h-8 w-28 px-2 text-xs font-bold rounded-lg border border-brand bg-surface-card text-ink-primary"
                      autoFocus
                    />
                    <button onClick={applyOpening} aria-label="Apply opening stock" className="h-8 w-8 flex items-center justify-center rounded-lg bg-brand-solid text-brand-ink">
                      <Check className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                    <button onClick={() => setIsEditingOpening(false)} aria-label="Cancel" className="h-8 w-8 flex items-center justify-center rounded-lg border border-hairline text-ink-secondary">
                      <X className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </>
                ) : (
                  <>
                    <span className="font-bold text-ink-primary tabular-nums">{formatQty(report.openingStock)}</span>
                    <span className="text-ink-muted">{override !== undefined ? "confirmed by hand" : "from the ledger"}</span>
                    <button
                      onClick={() => { setTempOpening(String(report.openingStock)); setIsEditingOpening(true) }}
                      aria-label="Adjust opening stock"
                      className="h-8 w-8 flex items-center justify-center rounded-lg border border-hairline text-ink-secondary hover:border-brand"
                    >
                      <Edit2 className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                    {override !== undefined && (
                      <button onClick={resetOpening} className="h-8 px-2 text-xs font-semibold text-ink-muted hover:text-ink-primary">
                        Use ledger
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {loading && !report && (
          <Card padded className="py-16 flex flex-col items-center justify-center space-y-3">
            <Loader2 className="w-8 h-8 animate-spin text-brand-solid" aria-hidden="true" />
            <p className="text-sm font-semibold text-ink-secondary">Preparing the stock report…</p>
          </Card>
        )}

        {error && (
          <Card padded>
            <EmptyState
              icon={<AlertCircle className="w-6 h-6 text-critical" />}
              title="Couldn’t load the stock report"
              description="The figures could not be compiled. Check your connection and try again."
              action={
                <button onClick={load} className="h-10 px-4 rounded-xl bg-brand-solid text-brand-ink text-sm font-bold">
                  Retry
                </button>
              }
            />
          </Card>
        )}
      </div>

      {report && returnsTotals && branchStatement && (
        <div className={loading ? "space-y-5 opacity-60 transition-opacity" : "space-y-5 transition-opacity"}>
          {/* ───────────── Page 1: the statement, with Notes / Table 1 ───────────── */}
          <section className="sheet bg-surface-card rounded-2xl border border-hairline p-5 sm:p-8 space-y-8" aria-label="Stock report statement">
            <SheetHeading product={report.product} year={report.period.year} month={report.period.month} />

            <div className="sheet-scroll overflow-x-auto">
              <table className="w-full min-w-[34rem] text-sm text-ink-primary">
                <thead>
                  <tr>
                    <th className="w-full" />
                    <th className="px-2 pb-2 text-right text-xs font-bold whitespace-nowrap">Quantity(Units)</th>
                    <th className="px-2 pb-2 text-right text-xs font-bold whitespace-nowrap">Quantity(Units)</th>
                    <th className="px-2 pb-2 text-right text-xs font-bold whitespace-nowrap">Quantity(Units)</th>
                    <th className="px-2 pb-2" />
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="py-0.5">Opening Stock</td>
                    <td />
                    <td className={NUM}>{formatQty(report.openingStock)}</td>
                    <td />
                    <td />
                  </tr>
                  <tr>
                    <td className="py-0.5">Total Production(Table 1)</td>
                    <td />
                    <td />
                    <td className={`${NUM} ${LINE}`}>{formatQty(report.totalProduced)}</td>
                    <td />
                  </tr>
                  <tr>
                    <td className="py-0.5">Goods Available for Distribution</td>
                    <td />
                    <td />
                    <td />
                    <td className={NUM}>{formatQty(report.goodsAvailable)}</td>
                  </tr>

                  <tr><td colSpan={5} className="py-2" /></tr>
                  <tr>
                    <td colSpan={5} className="py-1 text-center font-bold">DISTRIBUTION DETAILS</td>
                  </tr>
                  {report.branchMatrix.map((b, i) => {
                    const last = i === report.branchMatrix.length - 1 && report.unassignedSales <= 0
                    return (
                      <tr key={b.branch}>
                        <td className="py-0.5">{b.branch}</td>
                        <td className={`${NUM} ${last ? LINE : ""}`}>{formatQty(b.totalSales)}</td>
                        <td /><td /><td />
                      </tr>
                    )
                  })}
                  {report.unassignedSales > 0 && (
                    <tr>
                      <td className="py-0.5">Other destinations</td>
                      <td className={`${NUM} ${LINE}`}>{formatQty(report.unassignedSales)}</td>
                      <td /><td /><td />
                    </tr>
                  )}
                  <tr className="font-bold">
                    <td className="py-0.5">TOTAL SALES</td>
                    <td />
                    <td className={NUM}>{formatQty(report.totalSales)}</td>
                    <td /><td />
                  </tr>
                  <tr><td className="py-0.5" colSpan={5}>Less Returns:</td></tr>
                  <tr>
                    <td className="py-0.5">Total Spoilage Returns</td>
                    <td className={NUM}>{formatQty(report.spoilageReturns)}</td>
                    <td /><td /><td />
                  </tr>
                  <tr>
                    <td className="py-0.5">Total Repackage Returns</td>
                    <td />
                    <td className={`${NUM} ${LINE}`}>{formatQty(report.repackReturns)}</td>
                    <td /><td />
                  </tr>
                  <tr className="font-bold">
                    <td className="py-0.5">TOTAL RETURNS</td>
                    <td />
                    <td className={`${NUM} ${LINE}`}>{formatQty(report.totalReturns > 0 ? -report.totalReturns : 0)}</td>
                    <td /><td />
                  </tr>
                  <tr>
                    <td className="py-0.5">ACTUAL SALES</td>
                    <td />
                    <td className={NUM}>{formatQty(report.actualSales)}</td>
                    <td /><td />
                  </tr>
                  <tr><td className="py-0.5" colSpan={5}>Add:</td></tr>
                  <tr>
                    <td className="py-0.5">Donations</td>
                    <td />
                    <td className={NUM}>{formatQty(report.donations)}</td>
                    <td /><td />
                  </tr>
                  <tr>
                    <td className="py-0.5">Spoilage</td>
                    <td />
                    <td className={NUM}>{formatQty(report.spoilageReturns)}</td>
                    <td /><td />
                  </tr>
                  <tr className="font-bold">
                    <td className="py-0.5">TOTAL DISTRIBUTION</td>
                    <td /><td />
                    <td className={`${NUM} border-t border-ink-primary`}>{formatQty(report.totalDistribution)}</td>
                    <td />
                  </tr>
                  <tr>
                    <td className="py-0.5">CLOSING STOCK</td>
                    <td /><td />
                    <td className={`${NUM} border-b-4 border-double border-ink-primary`}>{formatQty(report.closingStock)}</td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="space-y-2">
              <p className="text-center text-sm font-bold">NOTES</p>
              <p className="text-xs font-bold">TABLE 1 .</p>
              <div className="sheet-scroll overflow-x-auto">
                <table className="w-full min-w-[30rem] max-w-3xl border-collapse text-xs text-ink-primary">
                  <thead>
                    <tr className="font-bold">
                      {["WEEKLY", "GROUP 1", "GROUP 2", "GROUP 3", "PART TIME", "TOTAL"].map((h) => (
                        <th key={h} className="border border-ink-primary px-2 py-1 text-center">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.weeklyProduction.rows.map((w) => (
                      <tr key={w.week}>
                        <td className="border border-ink-primary px-2 py-1 text-center">{w.week}</td>
                        <td className="border border-ink-primary px-2 py-1 text-center tabular-nums">{w.group1 ? formatQty(w.group1) : ""}</td>
                        <td className="border border-ink-primary px-2 py-1 text-center tabular-nums">{w.group2 ? formatQty(w.group2) : ""}</td>
                        <td className="border border-ink-primary px-2 py-1 text-center tabular-nums">{w.group3 ? formatQty(w.group3) : ""}</td>
                        <td className="border border-ink-primary px-2 py-1 text-center tabular-nums">{w.partTime ? formatQty(w.partTime) : ""}</td>
                        <td className="border border-ink-primary px-2 py-1 text-center tabular-nums">{formatQty(w.total)}</td>
                      </tr>
                    ))}
                    <tr className="font-bold">
                      <td className="border border-ink-primary px-2 py-1 text-center">TOTAL</td>
                      <td className="border border-ink-primary px-2 py-1 text-center tabular-nums">{formatQty(report.weeklyProduction.totalGroup1)}</td>
                      <td className="border border-ink-primary px-2 py-1 text-center tabular-nums">{formatQty(report.weeklyProduction.totalGroup2)}</td>
                      <td className="border border-ink-primary px-2 py-1 text-center tabular-nums">{formatQty(report.weeklyProduction.totalGroup3)}</td>
                      <td className="border border-ink-primary px-2 py-1 text-center tabular-nums">{formatQty(report.weeklyProduction.totalPartTime)}</td>
                      <td className="border border-ink-primary px-2 py-1 text-center tabular-nums">{formatQty(report.weeklyProduction.grandTotal)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-ink-muted">
                Weeks: 1 = 1st–7th, 2 = 8th–14th, 3 = 15th–21st, 4 = 22nd–28th, 5 = 29th to month end.
              </p>
            </div>
          </section>

          {/* ───────────── Page 2: Table 2, returns ───────────── */}
          <section className="sheet bg-surface-card rounded-2xl border border-hairline p-5 sm:p-8 space-y-3" aria-label="Table 2, returns">
            <div className="flex items-baseline gap-12 text-xs font-bold">
              <span>TABLE 2.</span>
              <span>RETURNS</span>
            </div>
            <div className="sheet-scroll overflow-x-auto">
              <table className="w-full min-w-[34rem] border-collapse text-xs text-ink-primary">
                <thead>
                  <tr className="font-bold">
                    <th className="border border-ink-primary px-2 py-1 text-left whitespace-nowrap">DATES: {report.period.monthName.toUpperCase()}</th>
                    <th className="border border-ink-primary px-2 py-1 text-center">REPACKED</th>
                    <th className="border border-ink-primary px-2 py-1 text-center">SPOILAGE</th>
                    <th className="border border-ink-primary px-2 py-1 text-center">SALES OR DRIVERS NAME</th>
                    <th className="border border-ink-primary px-2 py-1 text-center">SOURCE</th>
                  </tr>
                </thead>
                <tbody>
                  {report.returnsLog.length === 0 && (
                    <tr>
                      <td colSpan={5} className="border border-ink-primary px-2 py-4 text-center text-ink-muted">
                        No returns were logged in this period.
                      </td>
                    </tr>
                  )}
                  {report.returnsLog.map((r) => (
                    <tr key={r.id}>
                      <td className="border border-ink-primary px-2 py-1 text-center">{r.formattedDate}</td>
                      <td className="border border-ink-primary px-2 py-1 text-center tabular-nums">{r.repackCartons > 0 ? formatQty(r.repackCartons) : ""}</td>
                      <td className="border border-ink-primary px-2 py-1 text-center tabular-nums">{r.spoilageCartons > 0 ? formatQty(r.spoilageCartons) : ""}</td>
                      <td className="border border-ink-primary px-2 py-1">{r.driverName}</td>
                      <td className="border border-ink-primary px-2 py-1">{r.sourceBranch}</td>
                    </tr>
                  ))}
                  <tr className="font-bold">
                    <td className="green-cell border border-ink-primary bg-[#70ad47] px-2 py-1.5 text-center text-white">TOTAL</td>
                    <td className="green-cell border border-ink-primary bg-[#70ad47] px-2 py-1.5 text-center tabular-nums text-white">{formatQty(returnsTotals.repacked)}</td>
                    <td className="green-cell border border-ink-primary bg-[#70ad47] px-2 py-1.5 text-center tabular-nums text-white">{formatQty(returnsTotals.spoilage)}</td>
                    <td className="green-cell border border-ink-primary bg-[#70ad47] px-2 py-1.5 text-center tabular-nums text-white">{formatQty(returnsTotals.total)}</td>
                    <td className="border border-ink-primary" />
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* ───────────── Page 3: the branch matrix (landscape) ───────────── */}
          <section className="sheet sheet-landscape bg-surface-card rounded-2xl border border-hairline p-5 sm:p-8 space-y-6" aria-label="Branch distribution">
            <SheetHeading product={report.product} year={report.period.year} month={report.period.month} />
            <div className="sheet-scroll overflow-x-auto">
              <table className="w-full min-w-[56rem] border-collapse text-xs text-ink-primary">
                <thead>
                  <tr>
                    <th className="border border-ink-primary px-2 py-1 text-left align-bottom" rowSpan={2}>OPERATIONAL OFFICE</th>
                    {branchStatement.columns.map((c) => (
                      <th key={c.key} className="border border-ink-primary px-1.5 pt-1 pb-0 text-center font-normal whitespace-nowrap">{c.line1}</th>
                    ))}
                    <th className="border border-ink-primary px-1.5 pt-1 pb-0 text-center font-normal">TOTAL</th>
                  </tr>
                  <tr>
                    {branchStatement.columns.map((c) => (
                      <th key={c.key} className="border border-ink-primary px-1.5 pt-0 pb-1 text-center font-normal whitespace-nowrap">{c.line2}</th>
                    ))}
                    <th className="border border-ink-primary px-1.5 pt-0 pb-1 text-center font-normal">CARTONS</th>
                  </tr>
                </thead>
                <tbody>
                  {branchStatement.rows.map((row) => (
                    <Fragment key={row.key}>
                      <tr className={row.kind === "total" || row.kind === "section" ? "font-bold" : undefined}>
                        <td className="border border-ink-primary px-2 py-1">{row.label}</td>
                        {row.cells.map((cell, i) => (
                          <td key={branchStatement.columns[i].key} className="border border-ink-primary px-1.5 py-1 text-center tabular-nums">
                            {cell === null ? "" : formatQty(cell)}
                          </td>
                        ))}
                        <td className="border border-ink-primary px-1.5 py-1 text-center tabular-nums">
                          {row.total === null ? "" : formatQty(row.total)}
                        </td>
                      </tr>
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            {report.unassignedSales > 0 && (
              <p className="text-[11px] text-ink-muted">
                Other destinations: {formatQty(report.unassignedSales)} cartons were dispatched to places that are not on the current branch list, so they have their own column.
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
