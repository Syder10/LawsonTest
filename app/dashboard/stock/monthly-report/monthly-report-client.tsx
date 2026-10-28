"use client"

import { useCallback, useEffect, useState } from "react"
import Image from "next/image"
import {
  AlertCircle,
  ArrowRight,
  Boxes,
  Calendar,
  Check,
  ChevronRight,
  Download,
  Edit2,
  Factory,
  Gift,
  HelpCircle,
  Loader2,
  Minus,
  PackageCheck,
  Plus,
  Printer,
  RefreshCw,
  RotateCcw,
  Truck,
  Warehouse,
} from "lucide-react"
import type { Product } from "@/lib/db/types"
import type {
  BranchDistributionRow,
  MonthlyReturnEvent,
  MonthlyStockReport,
  WeeklyProductionRow,
} from "@/lib/domain/monthly-stock-report"
import { Card, Chip, DataTable, EmptyState, PageHeader, type Column } from "@/components/primitives"

const PRODUCTS: { key: Product; label: string; tone: "bitters" | "ginger" }[] = [
  { key: "Bitters", label: "De-Ray Man Abitters", tone: "bitters" },
  { key: "Ginger", label: "De-Ray Man Ginger Liquor", tone: "ginger" },
]

const MONTHS = [
  { num: 1, name: "January" },
  { num: 2, name: "February" },
  { num: 3, name: "March" },
  { num: 4, name: "April" },
  { num: 5, name: "May" },
  { num: 6, name: "June" },
  { num: 7, name: "July" },
  { num: 8, name: "August" },
  { num: 9, name: "September" },
  { num: 10, name: "October" },
  { num: 11, name: "November" },
  { num: 12, name: "December" },
]

const YEARS = [2024, 2025, 2026, 2027]

const fmt = (n: number | undefined) => (n !== undefined ? n.toLocaleString() : "0")

export function MonthlyReportClient() {
  const [selectedProduct, setSelectedProduct] = useState<Product>("Bitters")
  const [selectedYear, setSelectedYear] = useState<number>(2026)
  const [selectedMonth, setSelectedMonth] = useState<number>(7) // July by default for De-Ray template review
  const [activeTab, setActiveTab] = useState<"branches" | "production" | "returns">("branches")
  const [report, setReport] = useState<MonthlyStockReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  // Baseline Opening Stock confirmation & adjustment (Instruction 3)
  const [openingOverrides, setOpeningOverrides] = useState<Record<Product, number | null>>({
    Bitters: 8127,
    Ginger: 3768,
  })
  const [isEditingOpening, setIsEditingOpening] = useState(false)
  const [tempOpening, setTempOpening] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const override = openingOverrides[selectedProduct]
      const url = `/api/stock/monthly-report?year=${selectedYear}&month=${selectedMonth}&product=${selectedProduct}${
        override !== null && !isNaN(override) ? `&openingStock=${override}` : ""
      }`
      const res = await fetch(url)
      if (!res.ok) throw new Error("Failed to load report")
      const data = await res.json()
      setReport(data)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [selectedYear, selectedMonth, selectedProduct, openingOverrides])

  useEffect(() => {
    load()
  }, [load])

  const exportCsv = () => {
    if (!report) return
    const rows = [
      ["MONTHLY STOCK RECONCILIATION REPORT"],
      [`Product: ${report.product}`, `Period: ${report.period.monthName} ${report.period.year}`],
      [],
      ["RECONCILIATION FLOW", "CARTONS"],
      ["Opening Stock", report.openingStock],
      ["+ Total Production Completed", report.totalProduced],
      ["= Goods Available for Distribution", report.goodsAvailable],
      ["Gross Sales (Dispatched)", report.totalSales],
      ["- Repackage Returns", report.repackReturns],
      ["- Spoilage Returns", report.spoilageReturns],
      ["= Actual Sales", report.actualSales],
      ["+ Donations Disbursed", report.donations],
      ["+ Spoilage Write-off", report.spoilageReturns],
      ["= Total Distribution", report.totalDistribution],
      ["CLOSING STOCK BALANCE", report.closingStock],
      [],
      ["BRANCH DISTRIBUTION MATRIX"],
      ["Branch", "Total Sales", "Repack Returns", "Spoilage Returns", "Total Returns", "Actual Sales", "Donations", "Total Distribution", "% Share"],
      ...report.branchMatrix.map((b) => [
        b.branch,
        b.totalSales,
        b.repackReturns,
        b.spoilageReturns,
        b.totalReturns,
        b.actualSales,
        b.donations,
        b.totalDistribution,
        `${b.percentageOfSales}%`,
      ]),
      [],
      ["TABLE 1: WEEKLY PRODUCTION PER GROUP"],
      ["Week", "Group 1", "Group 2", "Group 3", "Part Time", "Total"],
      ...report.weeklyProduction.rows.map((w) => [
        `${w.label} (${w.dateRange})`,
        w.group1,
        w.group2,
        w.group3,
        w.partTime,
        w.total,
      ]),
      [
        "MONTHLY TOTAL",
        report.weeklyProduction.totalGroup1,
        report.weeklyProduction.totalGroup2,
        report.weeklyProduction.totalGroup3,
        report.weeklyProduction.totalPartTime,
        report.weeklyProduction.grandTotal,
      ],
      [],
      ["TABLE 2: RETURNS AUDIT LOG"],
      ["Date", "Driver", "Source / Branch", "Repacked Cartons", "Spoilage Cartons", "Total Cartons", "Remarks"],
      ...report.returnsLog.map((r) => [
        r.formattedDate,
        r.driverName,
        r.sourceBranch,
        r.repackCartons,
        r.spoilageCartons,
        r.totalCartons,
        r.remarks ?? "",
      ]),
    ]

    const csvContent = rows
      .map((row) =>
        row
          .map((c) => {
            const s = c === null || c === undefined ? "" : String(c)
            return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
          })
          .join(","),
      )
      .join("\n")

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `monthly_stock_report_${report.product.toLowerCase()}_${report.period.year}_${String(report.period.month).padStart(2, "0")}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const branchColumns: Column<BranchDistributionRow>[] = [
    {
      key: "branch",
      header: "Branch / Destination",
      primary: true,
      cell: (r) => (
        <div>
          <span className="font-bold text-ink-primary">{r.branch}</span>
          <div className="w-24 bg-surface-sunken rounded-full h-1.5 mt-1 overflow-hidden">
            <div
              className="bg-brand-solid h-full rounded-full transition-all"
              style={{ width: `${Math.min(100, r.percentageOfSales)}%` }}
            />
          </div>
        </div>
      ),
    },
    {
      key: "sales",
      header: "Total Sales",
      align: "right",
      numeric: true,
      cell: (r) => <span className="font-bold text-ink-primary">{fmt(r.totalSales)}</span>,
    },
    {
      key: "repack",
      header: "Repack Returns",
      align: "right",
      numeric: true,
      hideOnMobile: true,
      cell: (r) => (
        <span className={r.repackReturns > 0 ? "text-brand-ink-positive font-semibold" : "text-ink-muted"}>
          {fmt(r.repackReturns)}
        </span>
      ),
    },
    {
      key: "spoilage",
      header: "Spoilage Returns",
      align: "right",
      numeric: true,
      hideOnMobile: true,
      cell: (r) => (
        <span className={r.spoilageReturns > 0 ? "text-critical font-semibold" : "text-ink-muted"}>
          {fmt(r.spoilageReturns)}
        </span>
      ),
    },
    {
      key: "totalReturns",
      header: "Total Returns",
      align: "right",
      numeric: true,
      cell: (r) => (
        <span className={r.totalReturns > 0 ? "font-semibold text-ink-primary" : "text-ink-muted"}>
          {fmt(r.totalReturns)}
        </span>
      ),
    },
    {
      key: "actualSales",
      header: "Actual Sales",
      align: "right",
      numeric: true,
      cell: (r) => (
        <span className="font-bold text-brand-solid text-sm">
          {fmt(r.actualSales)}
        </span>
      ),
    },
    {
      key: "share",
      header: "% Share",
      align: "right",
      numeric: true,
      hideOnMobile: true,
      cell: (r) => <span className="text-xs text-ink-secondary">{r.percentageOfSales}%</span>,
    },
  ]

  const weeklyColumns: Column<WeeklyProductionRow>[] = [
    {
      key: "week",
      header: "Period",
      primary: true,
      cell: (r) => (
        <div>
          <span className="font-bold text-ink-primary">{r.label}</span>
          <p className="text-xs text-ink-secondary">{r.dateRange}</p>
        </div>
      ),
    },
    {
      key: "g1",
      header: "Group 1",
      align: "right",
      numeric: true,
      cell: (r) => <span className="font-medium text-ink-primary">{fmt(r.group1)}</span>,
    },
    {
      key: "g2",
      header: "Group 2",
      align: "right",
      numeric: true,
      cell: (r) => <span className="font-medium text-ink-primary">{fmt(r.group2)}</span>,
    },
    {
      key: "g3",
      header: "Group 3",
      align: "right",
      numeric: true,
      cell: (r) => <span className="font-medium text-ink-primary">{fmt(r.group3)}</span>,
    },
    {
      key: "partTime",
      header: "Part-Time",
      align: "right",
      numeric: true,
      cell: (r) => (
        <span className={r.partTime > 0 ? "font-semibold text-brand-solid" : "text-ink-muted"}>
          {r.partTime > 0 ? fmt(r.partTime) : "—"}
        </span>
      ),
    },
    {
      key: "total",
      header: "Week Total",
      align: "right",
      numeric: true,
      cell: (r) => <span className="font-bold text-ink-primary text-sm">{fmt(r.total)}</span>,
    },
  ]

  const returnsColumns: Column<MonthlyReturnEvent>[] = [
    {
      key: "date",
      header: "Date",
      primary: true,
      cell: (r) => <span className="font-bold text-ink-primary">{r.formattedDate}</span>,
    },
    {
      key: "driver",
      header: "Driver",
      cell: (r) => (
        <div>
          <span className="font-semibold text-ink-primary">{r.driverName}</span>
          {r.vehicleReg && <p className="text-xs text-ink-secondary">{r.vehicleReg}</p>}
        </div>
      ),
    },
    {
      key: "branch",
      header: "Source / Branch",
      cell: (r) => <span className="font-medium text-ink-secondary">{r.sourceBranch}</span>,
    },
    {
      key: "repack",
      header: "Repacked",
      align: "right",
      numeric: true,
      cell: (r) => (
        <span className="font-semibold text-brand-ink-positive">
          {fmt(r.repackCartons)}
        </span>
      ),
    },
    {
      key: "spoilage",
      header: "Spoilage",
      align: "right",
      numeric: true,
      cell: (r) => (
        <span className={r.spoilageCartons > 0 ? "font-semibold text-critical" : "text-ink-muted"}>
          {fmt(r.spoilageCartons)}
        </span>
      ),
    },
    {
      key: "total",
      header: "Total Returned",
      align: "right",
      numeric: true,
      cell: (r) => <span className="font-bold text-ink-primary">{fmt(r.totalCartons)}</span>,
    },
  ]

  return (
    <div className="space-y-6 animate-fade-in-up pb-12">
      {/* Header and Controls */}
      <PageHeader
        title="Monthly Stock Reconciliation"
        description="Comprehensive physical distribution balance, branch sales, weekly group production, and returns audit"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={exportCsv}
              disabled={!report || loading}
              className="h-9 px-3 flex items-center gap-1.5 rounded-lg border border-hairline bg-surface-card text-xs font-bold text-ink-secondary hover:border-brand transition-colors disabled:opacity-60"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" /> Export Report
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

      {/* Control Bar: Product Tabs + Period Selectors */}
      <div className="bg-surface-card rounded-2xl border border-hairline p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Product Switcher */}
        <div className="flex items-center p-1 bg-surface-sunken rounded-xl border border-hairline">
          {PRODUCTS.map((p) => {
            const active = selectedProduct === p.key
            return (
              <button
                key={p.key}
                onClick={() => setSelectedProduct(p.key)}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                  active
                    ? "bg-surface-card text-ink-primary shadow-sm"
                    : "text-ink-secondary hover:text-ink-primary"
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    p.key === "Bitters" ? "bg-amber-600" : "bg-emerald-600"
                  }`}
                />
                {p.label}
              </button>
            )
          })}
        </div>

        {/* Month & Year Selectors */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-surface-sunken px-3 py-1.5 rounded-xl border border-hairline">
            <Calendar className="w-4 h-4 text-ink-secondary" />
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              aria-label="Select month"
              className="bg-transparent text-xs font-bold text-ink-primary outline-none cursor-pointer"
            >
              {MONTHS.map((m) => (
                <option key={m.num} value={m.num}>
                  {m.name}
                </option>
              ))}
            </select>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              aria-label="Select year"
              className="bg-transparent text-xs font-bold text-ink-primary outline-none cursor-pointer border-l border-hairline pl-2"
            >
              {YEARS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {loading && !report && (
        <Card padded className="py-16 flex flex-col items-center justify-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-brand-solid" />
          <p className="text-sm font-semibold text-ink-secondary">Reconciling monthly ledger records…</p>
        </Card>
      )}

      {error && (
        <Card padded>
          <EmptyState
            icon={<AlertCircle className="w-6 h-6 text-critical" />}
            title="Failed to load monthly reconciliation"
            description="Could not compile monthly figures. Please check your network connection and retry."
            action={
              <button
                onClick={load}
                className="h-10 px-4 rounded-xl bg-brand-solid text-brand-ink text-sm font-bold"
              >
                Retry
              </button>
            }
          />
        </Card>
      )}

      {!loading && report && (
        <>
          {/* Official Company Report Header with Logo */}
          <div className="bg-surface-card rounded-2xl border border-hairline p-5 shadow-xs flex flex-col sm:flex-row items-center gap-4 justify-between">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-xl bg-surface-sunken border border-hairline p-1.5 flex items-center justify-center shrink-0">
                <Image
                  src="/logo.png"
                  alt="Lawson Limited Company Logo"
                  width={56}
                  height={56}
                  className="object-contain w-full h-full"
                  priority
                />
              </div>
              <div>
                <h1 className="text-lg sm:text-xl font-black uppercase tracking-tight text-ink-primary">
                  LAWSON LIMITED COMPANY
                </h1>
                <p className="text-sm font-bold text-brand-solid">
                  {selectedProduct === "Bitters" ? "DE-RAY MAN ABITTERS" : "DE-RAY MAN GINGER LIQUOR"}
                </p>
                <p className="text-xs font-semibold text-ink-secondary">
                  STOCK REPORT FOR THE PERIOD 1ST - {report.period.endDate.slice(8, 10)}TH {report.period.monthName.toUpperCase()}, {report.period.year}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-center">
              <button
                onClick={() => window.print()}
                className="h-9 px-3 flex items-center gap-1.5 rounded-lg border border-hairline bg-surface-card text-xs font-bold text-ink-secondary hover:border-brand transition-colors"
              >
                <Printer className="w-3.5 h-3.5" aria-hidden="true" /> Print Report
              </button>
            </div>
          </div>

          {/* Executive Flow Pipeline: Visual representation of the exact report formula */}
          <div className="bg-surface-card rounded-2xl border border-hairline p-5 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-ink-secondary">
                  Stock Reconciliation Equation
                </h3>
                <p className="text-sm font-semibold text-ink-primary">
                  Goods Available − Total Distribution = Closing Stock
                </p>
              </div>
              <Chip tone={selectedProduct === "Bitters" ? "bitters" : "ginger"}>
                {report.period.monthName} {report.period.year}
              </Chip>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-stretch">
              {/* 1. Opening Stock */}
              <div className="bg-surface-sunken rounded-xl p-4 border border-hairline flex flex-col justify-between relative group hover:border-brand transition-colors">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-ink-secondary uppercase">Opening Stock</span>
                  <button
                    onClick={() => {
                      setTempOpening(String(report.openingStock))
                      setIsEditingOpening(!isEditingOpening)
                    }}
                    title="Adjust opening stock baseline"
                    className="p-1 rounded-md text-ink-muted hover:text-brand hover:bg-surface-card transition-colors"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="mt-3">
                  {isEditingOpening ? (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          value={tempOpening}
                          onChange={(e) => setTempOpening(e.target.value)}
                          className="w-full text-sm font-bold p-1 rounded border border-brand bg-surface-card text-ink-primary"
                          placeholder="e.g. 8127"
                          autoFocus
                        />
                        <button
                          onClick={() => {
                            const val = Number(tempOpening)
                            if (!isNaN(val) && val >= 0) {
                              setOpeningOverrides((prev) => ({ ...prev, [selectedProduct]: val }))
                              setIsEditingOpening(false)
                            }
                          }}
                          className="p-1.5 bg-brand-solid text-brand-ink rounded text-xs"
                        >
                          <Check className="w-3 h-3" />
                        </button>
                      </div>
                      <p className="text-[10px] text-ink-muted">Press check to apply</p>
                    </div>
                  ) : (
                    <>
                      <p className="text-2xl font-black text-ink-primary tnum">
                        {fmt(report.openingStock)}
                      </p>
                      <p className="text-xs text-ink-muted mt-0.5">Carried / Baseline count</p>
                    </>
                  )}
                </div>
              </div>

              {/* + 2. Production Completed */}
              <div className="bg-surface-sunken rounded-xl p-4 border border-hairline flex flex-col justify-between relative group hover:border-brand transition-colors">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-brand-ink-positive uppercase flex items-center gap-1">
                    <Plus className="w-3 h-3" /> Production
                  </span>
                  <Factory className="w-4 h-4 text-brand-ink-positive" />
                </div>
                <div className="mt-3">
                  <p className="text-2xl font-black text-ink-primary tnum">
                    {fmt(report.totalProduced)}
                  </p>
                  <p className="text-xs text-ink-muted mt-0.5">Table 1: Packaging groups</p>
                </div>
              </div>

              {/* = 3. Goods Available */}
              <div className="bg-surface-sunken rounded-xl p-4 border border-hairline flex flex-col justify-between relative group hover:border-brand transition-colors">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-ink-secondary uppercase">Available</span>
                  <Boxes className="w-4 h-4 text-ink-secondary" />
                </div>
                <div className="mt-3">
                  <p className="text-2xl font-black text-ink-primary tnum">
                    {fmt(report.goodsAvailable)}
                  </p>
                  <p className="text-xs text-ink-muted mt-0.5">Opening + Produced</p>
                </div>
              </div>

              {/* − 4. Total Distribution */}
              <div className="bg-surface-sunken rounded-xl p-4 border border-hairline flex flex-col justify-between relative group hover:border-brand transition-colors">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-600 uppercase flex items-center gap-1">
                    <Minus className="w-3 h-3" /> Distributed
                  </span>
                  <Truck className="w-4 h-4 text-amber-600" />
                </div>
                <div className="mt-3">
                  <p className="text-2xl font-black text-ink-primary tnum">
                    {fmt(report.totalDistribution)}
                  </p>
                  <p className="text-xs text-ink-muted mt-0.5">Sales − Repack + Donations</p>
                </div>
              </div>

              {/* = 5. Closing Stock Balance */}
              <div className="bg-brand-solid/10 rounded-xl p-4 border border-brand-solid flex flex-col justify-between relative">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-brand-solid uppercase">Closing Stock</span>
                  <PackageCheck className="w-4 h-4 text-brand-solid" />
                </div>
                <div className="mt-3">
                  <p className="text-2xl font-black text-ink-primary tnum">
                    {fmt(report.closingStock)}
                  </p>
                  <p className="text-xs text-ink-muted mt-0.5">Ending inventory</p>
                </div>
              </div>
            </div>

            {/* Reconciliation breakdown cards */}
            <div className="mt-4 pt-4 border-t border-hairline grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
              <div className="bg-surface-card p-3 rounded-lg border border-hairline">
                <span className="text-ink-secondary font-medium">Gross Dispatched</span>
                <p className="text-base font-bold text-ink-primary tnum mt-0.5">{fmt(report.totalSales)} ctn</p>
              </div>
              <div className="bg-surface-card p-3 rounded-lg border border-hairline">
                <span className="text-ink-secondary font-medium">Repack Returns</span>
                <p className="text-base font-bold text-brand-ink-positive tnum mt-0.5">{fmt(report.repackReturns)} ctn</p>
              </div>
              <div className="bg-surface-card p-3 rounded-lg border border-hairline">
                <span className="text-ink-secondary font-medium">Spoilage Returns</span>
                <p className="text-base font-bold text-critical tnum mt-0.5">{fmt(report.spoilageReturns)} ctn</p>
              </div>
              <div className="bg-surface-card p-3 rounded-lg border border-hairline">
                <span className="text-ink-secondary font-medium">Actual Net Sales</span>
                <p className="text-base font-bold text-brand-solid tnum mt-0.5">{fmt(report.actualSales)} ctn</p>
              </div>
              <div className="bg-surface-card p-3 rounded-lg border border-hairline">
                <span className="text-ink-secondary font-medium">Donations / Gifts</span>
                <p className="text-base font-bold text-purple-600 tnum mt-0.5">{fmt(report.donations)} ctn</p>
              </div>
            </div>
          </div>

          {/* Tab Navigation for Detailed Sections */}
          <div className="flex items-center gap-2 border-b border-hairline pb-2">
            <button
              onClick={() => setActiveTab("branches")}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 ${
                activeTab === "branches"
                  ? "bg-brand-solid text-brand-ink"
                  : "bg-surface-card text-ink-secondary border border-hairline hover:border-brand"
              }`}
            >
              <Truck className="w-3.5 h-3.5" /> Branch Distribution Matrix
            </button>
            <button
              onClick={() => setActiveTab("production")}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 ${
                activeTab === "production"
                  ? "bg-brand-solid text-brand-ink"
                  : "bg-surface-card text-ink-secondary border border-hairline hover:border-brand"
              }`}
            >
              <Factory className="w-3.5 h-3.5" /> Weekly Production by Group (Table 1)
            </button>
            <button
              onClick={() => setActiveTab("returns")}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 ${
                activeTab === "returns"
                  ? "bg-brand-solid text-brand-ink"
                  : "bg-surface-card text-ink-secondary border border-hairline hover:border-brand"
              }`}
            >
              <RotateCcw className="w-3.5 h-3.5" /> Returns Audit Log (Table 2)
            </button>
          </div>

          {/* Tab 1: Branch Distribution Matrix */}
          {activeTab === "branches" && (
            <Card padded className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-ink-primary">Branch Distribution Matrix</h3>
                  <p className="text-xs text-ink-secondary">
                    Cartons delivered to all 10 branches, returns subtracted to determine Actual Sales.
                  </p>
                </div>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-surface-sunken text-ink-primary">
                  10 Branches Monitored
                </span>
              </div>

              <DataTable
                columns={branchColumns}
                rows={report.branchMatrix}
                rowKey={(r) => r.branch}
                empty={
                  <EmptyState
                    compact
                    title="No branch distributions recorded"
                    description="No loads were dispatched to branches in this period."
                  />
                }
              />

              {/* Total Footer Banner */}
              <div className="p-4 rounded-xl border border-hairline bg-surface-sunken flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase text-ink-secondary">All Branches Total</p>
                  <p className="text-lg font-black text-ink-primary tnum">{fmt(report.totalSales)} cartons dispatched</p>
                </div>
                <div className="flex items-center gap-6 text-xs">
                  <div>
                    <span className="text-ink-secondary">Total Returns:</span>
                    <p className="font-bold text-ink-primary tnum">{fmt(report.totalReturns)} ctn</p>
                  </div>
                  <div>
                    <span className="text-ink-secondary">Actual Sales:</span>
                    <p className="font-bold text-brand-solid tnum">{fmt(report.actualSales)} ctn</p>
                  </div>
                  <div>
                    <span className="text-ink-secondary">Donations:</span>
                    <p className="font-bold text-purple-600 tnum">{fmt(report.donations)} ctn</p>
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* Tab 2: Weekly Production by Group (Table 1) */}
          {activeTab === "production" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-surface-card p-4 rounded-xl border border-hairline">
                  <span className="text-xs font-bold text-ink-secondary">Group 1 Production</span>
                  <p className="text-2xl font-black text-ink-primary tnum mt-1">
                    {fmt(report.weeklyProduction.totalGroup1)}
                  </p>
                  <p className="text-xs text-ink-muted">cartons total</p>
                </div>
                <div className="bg-surface-card p-4 rounded-xl border border-hairline">
                  <span className="text-xs font-bold text-ink-secondary">Group 2 Production</span>
                  <p className="text-2xl font-black text-ink-primary tnum mt-1">
                    {fmt(report.weeklyProduction.totalGroup2)}
                  </p>
                  <p className="text-xs text-ink-muted">cartons total</p>
                </div>
                <div className="bg-surface-card p-4 rounded-xl border border-hairline">
                  <span className="text-xs font-bold text-ink-secondary">Group 3 Production</span>
                  <p className="text-2xl font-black text-ink-primary tnum mt-1">
                    {fmt(report.weeklyProduction.totalGroup3)}
                  </p>
                  <p className="text-xs text-ink-muted">cartons total</p>
                </div>
                <div className="bg-surface-card p-4 rounded-xl border border-hairline">
                  <span className="text-xs font-bold text-ink-secondary">Part-Time Workers</span>
                  <p className="text-2xl font-black text-ink-primary tnum mt-1">
                    {fmt(report.weeklyProduction.totalPartTime)}
                  </p>
                  <p className="text-xs text-ink-muted">casual / extra shifts</p>
                </div>
              </div>

              <Card padded className="space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-ink-primary">Table 1: Weekly Production Breakdown</h3>
                  <p className="text-xs text-ink-secondary">
                    Weekly cartons packaged by Group 1, Group 2, Group 3, and Part-Time teams.
                  </p>
                </div>

                <DataTable
                  columns={weeklyColumns}
                  rows={report.weeklyProduction.rows}
                  rowKey={(r) => String(r.week)}
                  empty={
                    <EmptyState
                      compact
                      title="No production recorded"
                      description="No packaging records were filed during this month."
                    />
                  }
                />
              </Card>
            </div>
          )}

          {/* Tab 3: Returns Audit Log (Table 2) */}
          {activeTab === "returns" && (
            <Card padded className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-ink-primary">Table 2: Returns Event Audit Log</h3>
                  <p className="text-xs text-ink-secondary">
                    Individual return records specifying driver, origin branch, and condition (repacked vs. spoilage).
                  </p>
                </div>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-surface-sunken text-ink-primary">
                  {report.returnsLog.length} Return Incidents
                </span>
              </div>

              <DataTable
                columns={returnsColumns}
                rows={report.returnsLog}
                rowKey={(r) => r.id}
                empty={
                  <EmptyState
                    compact
                    title="No return events logged"
                    description="No finished product was returned to the warehouse in this period."
                  />
                }
              />
            </Card>
          )}
        </>
      )}
    </div>
  )
}
