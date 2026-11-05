"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Download,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Filter,
  Table2,
  Layers,
  Loader2,
  TrendingUp,
  RefreshCw,
  Sun,
  CloudSun,
  Moon,
  Clock,
  Sparkles,
  AlertCircle,
} from "lucide-react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import {
  buildPackagingPivotMatrix,
  exportPackagingPivotCsv,
  fmtNum,
  getDaysInMonth,
  type PackagingDailyRow,
  type PackagingPivotMatrix,
} from "@/lib/domain/packaging-pivot"
import { Card, Eyebrow, StatTile, Chip } from "@/components/primitives"
import { shiftTone, type ShiftTone } from "@/lib/shift-config"
import { cn } from "@/lib/utils"

interface PackagingPivotTableProps {
  initialYear?: number
  initialMonth?: number
  onSelectDay?: (date: string) => void
}

const MONTHS = [
  { value: 1, label: "January" },
  { value: 2, label: "February" },
  { value: 3, label: "March" },
  { value: 4, label: "April" },
  { value: 5, label: "May" },
  { value: 6, label: "June" },
  { value: 7, label: "July" },
  { value: 8, label: "August" },
  { value: 9, label: "September" },
  { value: 10, label: "October" },
  { value: 11, label: "November" },
  { value: 12, label: "December" },
]

function getShiftIcon(shift: string) {
  if (/morning/i.test(shift)) return <Sun className="w-3 h-3 text-amber-500 shrink-0" aria-hidden="true" />
  if (/afternoon/i.test(shift)) return <CloudSun className="w-3 h-3 text-sky-500 shrink-0" aria-hidden="true" />
  if (/night/i.test(shift)) return <Moon className="w-3 h-3 text-indigo-500 shrink-0" aria-hidden="true" />
  return <Clock className="w-3 h-3 text-ink-muted shrink-0" aria-hidden="true" />
}

export function PackagingPivotTable({
  initialYear,
  initialMonth,
  onSelectDay,
}: PackagingPivotTableProps) {
  const supabase = getSupabaseBrowserClient()

  // Default to current date if not provided
  const now = useMemo(() => new Date(), [])
  const [year, setYear] = useState<number>(() => initialYear ?? now.getFullYear())
  const [month, setMonth] = useState<number>(() => initialMonth ?? now.getMonth() + 1)

  // Filters & View Mode
  const [productFilter, setProductFilter] = useState<"All" | "Bitters" | "Ginger">("All")
  const [shiftFilter, setShiftFilter] = useState<"" | "Morning" | "Afternoon" | "Night">("")
  const [viewMode, setViewMode] = useState<"groups" | "shifts">("groups")

  // Raw rows fetched from Supabase for this month
  const [records, setRecords] = useState<PackagingDailyRow[]>([])
  const [noWorkMap, setNoWorkMap] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // Fetch packaging records and no-work records for the selected month
  const fetchMonthRecords = useCallback(async () => {
    setLoading(true)
    setFetchError(null)

    const daysInMonth = getDaysInMonth(year, month)
    const padMonth = String(month).padStart(2, "0")
    const fromDate = `${year}-${padMonth}-01`
    const toDate = `${year}-${padMonth}-${String(daysInMonth).padStart(2, "0")}`

    try {
      const [pkgRes, nwRes] = await Promise.all([
        supabase
          .from("packaging_daily_records")
          .select(
            "date, shift, group_number, product, quantity_cartons_produced, number_cartons_wasted, quantity_cartons_loaded, is_part_time"
          )
          .gte("date", fromDate)
          .lte("date", toDate)
          .order("date", { ascending: true }),
        supabase
          .from("no_work_records")
          .select("date, shift, department, reason")
          .eq("department", "Packaging")
          .gte("date", fromDate)
          .lte("date", toDate),
      ])

      if (pkgRes.error) {
        setFetchError(pkgRes.error.message)
        setRecords([])
      } else {
        const rows: PackagingDailyRow[] = (pkgRes.data ?? []).map((r) => ({
          date: String(r.date),
          shift: String(r.shift),
          group_number: r.group_number ? Number(r.group_number) : null,
          product: String(r.product),
          quantity_cartons_produced: Number(r.quantity_cartons_produced) || 0,
          number_cartons_wasted: r.number_cartons_wasted ? Number(r.number_cartons_wasted) : 0,
          quantity_cartons_loaded: r.quantity_cartons_loaded ? Number(r.quantity_cartons_loaded) : 0,
          is_part_time: Boolean(r.is_part_time),
        }))
        setRecords(rows)
      }

      // Map no-work records by date
      const nwMap = new Map<string, string>()
      for (const nw of nwRes.data ?? []) {
        const d = String(nw.date)
        const existing = nwMap.get(d)
        const entry = nw.shift ? `${nw.shift}: ${nw.reason}` : String(nw.reason)
        nwMap.set(d, existing ? `${existing}; ${entry}` : entry)
      }
      setNoWorkMap(nwMap)
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Failed to load packaging records")
      setRecords([])
    } finally {
      setLoading(false)
    }
  }, [supabase, year, month])

  useEffect(() => {
    fetchMonthRecords()
  }, [fetchMonthRecords])

  // Compute the pivot matrix purely in memory
  const matrix: PackagingPivotMatrix = useMemo(() => {
    return buildPackagingPivotMatrix({
      year,
      month,
      records,
      productFilter,
      shiftFilter,
    })
  }, [year, month, records, productFilter, shiftFilter])

  // Stepper handlers
  const handlePrevMonth = () => {
    if (month === 1) {
      setMonth(12)
      setYear((y) => y - 1)
    } else {
      setMonth((m) => m - 1)
    }
  }

  const handleNextMonth = () => {
    if (month === 12) {
      setMonth(1)
      setYear((y) => y + 1)
    } else {
      setMonth((m) => m + 1)
    }
  }

  const handleCurrentMonth = () => {
    setYear(now.getFullYear())
    setMonth(now.getMonth() + 1)
  }

  // Export CSV download
  const handleExportCsv = () => {
    const csvContent = exportPackagingPivotCsv(matrix, viewMode)
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `packaging-production-pivot-${year}-${String(month).padStart(2, "0")}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const monthLabel = MONTHS.find((m) => m.value === month)?.label ?? `Month ${month}`

  return (
    <div className="space-y-4">
      {/* ── CARD HEADER & CONTROLS ────────────────────────────────────────── */}
      <Card className="p-4 sm:p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-hairline pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Eyebrow>Packaging Department</Eyebrow>
              <Chip tone="brand" className="text-[11px] font-bold">
                Pivot Analysis
              </Chip>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-ink-primary flex items-center gap-2.5">
              <Table2 className="w-5 h-5 text-brand shrink-0" aria-hidden="true" />
              <span>Production Matrix — {monthLabel} {year}</span>
            </h2>
            <p className="text-xs sm:text-sm text-ink-secondary">
              Excel-style monthly pivot breakdown of finished cartons produced by Group, Shift, and Date.
            </p>
          </div>

          {/* Month / Year Navigator */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center rounded-xl border border-hairline bg-surface-sunken p-1 gap-1">
              <button
                type="button"
                onClick={handlePrevMonth}
                title="Previous Month"
                aria-label="Previous Month"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-secondary hover:text-ink-primary hover:bg-surface-card transition-colors active:scale-95"
              >
                <ChevronLeft className="w-4 h-4" aria-hidden="true" />
              </button>

              <div className="flex items-center gap-1.5 px-2">
                <Calendar className="w-3.5 h-3.5 text-brand shrink-0" aria-hidden="true" />
                <span className="text-xs sm:text-sm font-bold text-ink-primary whitespace-nowrap tnum">
                  {monthLabel} {year}
                </span>
              </div>

              <button
                type="button"
                onClick={handleNextMonth}
                title="Next Month"
                aria-label="Next Month"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-secondary hover:text-ink-primary hover:bg-surface-card transition-colors active:scale-95"
              >
                <ChevronRight className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <button
              type="button"
              onClick={handleCurrentMonth}
              className="h-10 px-3 rounded-xl border border-hairline bg-surface-card text-xs font-semibold text-ink-secondary hover:text-ink-primary hover:border-brand/40 transition-colors active:scale-95 whitespace-nowrap"
            >
              Current Month
            </button>

            <button
              type="button"
              onClick={handleExportCsv}
              disabled={loading || matrix.rows.length === 0}
              className="h-10 px-3.5 flex items-center gap-1.5 rounded-xl bg-surface-card border border-hairline text-ink-primary text-xs font-bold hover:border-brand transition-colors disabled:opacity-50 active:scale-95 whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5 text-brand shrink-0" aria-hidden="true" />
              <span>Export CSV</span>
            </button>

            <button
              type="button"
              onClick={fetchMonthRecords}
              disabled={loading}
              title="Refresh month data"
              aria-label="Refresh month data"
              className="w-10 h-10 rounded-xl border border-hairline bg-surface-card flex items-center justify-center text-ink-secondary hover:text-ink-primary hover:border-brand/40 transition-colors disabled:opacity-50 active:scale-95 shrink-0"
            >
              <RefreshCw className={cn("w-4 h-4", loading && "animate-spin text-brand")} aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* ── FILTER & VIEW TOGGLES ────────────────────────────────────────── */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
          {/* Product & Shift Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 text-ink-muted mr-1 font-semibold uppercase tracking-wider text-[11px]">
              <Filter className="w-3 h-3 text-brand" aria-hidden="true" />
              <span>Filters:</span>
            </div>

            {/* Product Filter Pills */}
            <div className="inline-flex rounded-xl border border-hairline bg-surface-sunken p-1 gap-1">
              {(["All", "Bitters", "Ginger"] as const).map((p) => {
                const isSelected = productFilter === p
                const toneClass =
                  p === "Bitters"
                    ? isSelected
                      ? "bg-series-bitters text-white font-bold shadow-sm"
                      : "text-series-bitters hover:bg-surface-card"
                    : p === "Ginger"
                    ? isSelected
                      ? "bg-series-ginger text-white font-bold shadow-sm"
                      : "text-series-ginger hover:bg-surface-card"
                    : isSelected
                    ? "bg-brand text-brand-ink font-bold shadow-sm"
                    : "text-ink-secondary hover:bg-surface-card"

                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setProductFilter(p)}
                    className={cn(
                      "px-2.5 py-1 rounded-lg text-xs font-semibold transition-all select-none min-h-[32px] flex items-center gap-1",
                      toneClass
                    )}
                  >
                    {p === "Bitters" && <span className="w-2 h-2 rounded-full bg-teal-500 inline-block" />}
                    {p === "Ginger" && <span className="w-2 h-2 rounded-full bg-orange-500 inline-block" />}
                    {p === "All" ? "All Products" : p}
                  </button>
                )
              })}
            </div>

            {/* Shift Filter Pills */}
            <div className="inline-flex rounded-xl border border-hairline bg-surface-sunken p-1 gap-1">
              {(
                [
                  { key: "", label: "All Shifts", icon: null },
                  { key: "Morning", label: "Morning", icon: <Sun className="w-3 h-3 text-amber-500" /> },
                  { key: "Afternoon", label: "Afternoon", icon: <CloudSun className="w-3 h-3 text-sky-500" /> },
                  { key: "Night", label: "Night", icon: <Moon className="w-3 h-3 text-indigo-500" /> },
                ] as const
              ).map(({ key, label, icon }) => {
                const isSelected = shiftFilter === key
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setShiftFilter(key)}
                    className={cn(
                      "px-2.5 py-1 rounded-lg text-xs font-semibold transition-all select-none min-h-[32px] flex items-center gap-1",
                      isSelected
                        ? "bg-surface-card text-ink-primary shadow-sm border border-hairline font-bold"
                        : "text-ink-secondary hover:text-ink-primary hover:bg-surface-card/60"
                    )}
                  >
                    {icon}
                    <span>{label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* View Mode Toggle: Groups vs Shifts */}
          <div className="flex items-center gap-2 self-start md:self-auto">
            <span className="text-[11px] font-semibold text-ink-muted uppercase tracking-wider">Columns:</span>
            <div className="inline-flex rounded-xl border border-hairline bg-surface-sunken p-1 gap-1">
              <button
                type="button"
                onClick={() => setViewMode("groups")}
                className={cn(
                  "px-3 py-1 rounded-lg text-xs font-semibold transition-all select-none min-h-[32px] flex items-center gap-1.5",
                  viewMode === "groups"
                    ? "bg-surface-card text-ink-primary font-bold shadow-sm border border-hairline"
                    : "text-ink-secondary hover:text-ink-primary"
                )}
              >
                <Layers className="w-3.5 h-3.5 text-brand" aria-hidden="true" />
                <span>By Group</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("shifts")}
                className={cn(
                  "px-3 py-1 rounded-lg text-xs font-semibold transition-all select-none min-h-[32px] flex items-center gap-1.5",
                  viewMode === "shifts"
                    ? "bg-surface-card text-ink-primary font-bold shadow-sm border border-hairline"
                    : "text-ink-secondary hover:text-ink-primary"
                )}
              >
                <Clock className="w-3.5 h-3.5 text-brand" aria-hidden="true" />
                <span>By Shift</span>
              </button>
            </div>
          </div>
        </div>
      </Card>

      {/* ── SUMMARY STAT TILES ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatTile
          label="Total Cartons"
          value={matrix.summary.totalCartons}
          unit="ctn"
          sub={`${matrix.summary.operatingDays} active days`}
          accent="brand"
        />
        <StatTile
          label="Group 1 Output"
          value={matrix.summary.group1Total}
          unit="ctn"
          sub={`${matrix.summary.group1Share.toFixed(1)}% of total`}
          accent="neutral"
        />
        <StatTile
          label="Group 2 Output"
          value={matrix.summary.group2Total}
          unit="ctn"
          sub={`${matrix.summary.group2Share.toFixed(1)}% of total`}
          accent="neutral"
        />
        <StatTile
          label="Group 3 Output"
          value={matrix.summary.group3Total}
          unit="ctn"
          sub={`${matrix.summary.group3Share.toFixed(1)}% of total`}
          accent="neutral"
        />
        <StatTile
          label="Part Time Output"
          value={matrix.summary.partTimeTotal}
          unit="ctn"
          sub={`${matrix.summary.partTimeShare.toFixed(1)}% of total`}
          accent="warning"
        />
        <StatTile
          label="Daily Average"
          value={Math.round(matrix.summary.dailyAverage)}
          unit="ctn/day"
          sub={
            matrix.summary.peakDate
              ? `Peak: ${fmtNum(matrix.summary.peakCartons)} ctn`
              : "No production"
          }
          icon={<TrendingUp className="w-4 h-4" />}
          accent="good"
        />
      </div>

      {/* ── THE PIVOT TABLE ────────────────────────────────────────────────── */}
      <Card className="overflow-hidden border border-hairline shadow-sm">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 text-ink-muted gap-2">
            <Loader2 className="w-8 h-8 animate-spin text-brand" aria-hidden="true" />
            <p className="text-sm font-semibold">Loading packaging records for {monthLabel} {year}...</p>
          </div>
        ) : fetchError ? (
          <div className="p-8 text-center space-y-3">
            <p className="text-sm text-critical-ink font-semibold">{fetchError}</p>
            <button
              type="button"
              onClick={fetchMonthRecords}
              className="h-9 px-4 rounded-xl bg-brand text-brand-ink text-xs font-bold active:scale-95"
            >
              Retry
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto relative">
            <table className="w-full text-left border-collapse min-w-[700px]">
              {/* Table Head */}
              <thead>
                <tr className="border-b border-hairline bg-surface-sunken text-ink-muted text-xs font-bold uppercase tracking-wider sticky top-0 z-10">
                  <th scope="col" className="py-3 px-3.5 w-28 bg-surface-sunken">
                    Date
                  </th>
                  <th scope="col" className="py-3 px-2.5 w-16 bg-surface-sunken">
                    Day
                  </th>

                  {viewMode === "groups" ? (
                    <>
                      <th scope="col" className="py-3 px-3 text-right bg-surface-sunken">
                        <div className="flex items-center justify-end gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
                          <span>Group 1</span>
                        </div>
                      </th>
                      <th scope="col" className="py-3 px-3 text-right bg-surface-sunken">
                        <div className="flex items-center justify-end gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                          <span>Group 2</span>
                        </div>
                      </th>
                      <th scope="col" className="py-3 px-3 text-right bg-surface-sunken">
                        <div className="flex items-center justify-end gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-purple-500 inline-block" />
                          <span>Group 3</span>
                        </div>
                      </th>
                      <th scope="col" className="py-3 px-3 text-right bg-surface-sunken">
                        <div className="flex items-center justify-end gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
                          <span>Part Time</span>
                        </div>
                      </th>
                    </>
                  ) : (
                    <>
                      <th scope="col" className="py-3 px-3 text-right bg-surface-sunken">
                        <div className="flex items-center justify-end gap-1.5">
                          <Sun className="w-3.5 h-3.5 text-amber-500" />
                          <span>Morning</span>
                        </div>
                      </th>
                      <th scope="col" className="py-3 px-3 text-right bg-surface-sunken">
                        <div className="flex items-center justify-end gap-1.5">
                          <CloudSun className="w-3.5 h-3.5 text-sky-500" />
                          <span>Afternoon</span>
                        </div>
                      </th>
                      <th scope="col" className="py-3 px-3 text-right bg-surface-sunken">
                        <div className="flex items-center justify-end gap-1.5">
                          <Moon className="w-3.5 h-3.5 text-indigo-500" />
                          <span>Night</span>
                        </div>
                      </th>
                    </>
                  )}

                  <th scope="col" className="py-3 px-4 text-right bg-surface-sunken font-extrabold text-ink-primary w-28">
                    Daily Total
                  </th>
                </tr>
              </thead>

              {/* Table Body */}
              <tbody className="divide-y divide-hairline text-sm text-ink-primary">
                {matrix.rows.map((r) => {
                  const isPeak = matrix.summary.peakDate === r.date && r.total > 0
                  const noWork = noWorkMap.get(r.date)
                  return (
                    <tr
                      key={r.date}
                      onClick={() => onSelectDay?.(r.date)}
                      className={cn(
                        "transition-colors group",
                        onSelectDay ? "cursor-pointer hover:bg-brand-subtle/30" : "hover:bg-surface-sunken/40",
                        r.isWeekend && "bg-surface-sunken/30 text-ink-muted",
                        noWork && !isPeak && "bg-amber-500/[0.04]",
                        isPeak && "bg-good-subtle/20"
                      )}
                    >
                      {/* Date */}
                      <td className="py-2.5 px-3.5 whitespace-nowrap font-medium text-xs tnum">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={cn("font-bold", isPeak && "text-good-ink")}>
                            {r.date.slice(5)}
                          </span>
                          {isPeak && (
                            <span title="Monthly Peak" className="inline-flex">
                              <Sparkles className="w-3 h-3 text-amber-500 inline-block" />
                            </span>
                          )}
                          {noWork && (
                            <span
                              title={`No Work logged: ${noWork}`}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/30 whitespace-nowrap"
                            >
                              <AlertCircle className="w-2.5 h-2.5 shrink-0" />
                              <span>No Work</span>
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Day of Week */}
                      <td className="py-2.5 px-2.5 whitespace-nowrap text-xs font-semibold">
                        <span
                          className={cn(
                            "px-1.5 py-0.5 rounded text-[11px]",
                            r.isWeekend
                              ? "bg-surface-sunken text-ink-muted border border-hairline"
                              : "text-ink-secondary"
                          )}
                        >
                          {r.dayOfWeek}
                        </span>
                      </td>

                      {/* Group Columns View */}
                      {viewMode === "groups" ? (
                        <>
                          {/* Group 1 */}
                          <td className="py-2.5 px-3 text-right">
                            {r.group1.cartons > 0 ? (
                              <div className="flex flex-col items-end">
                                <span className="font-bold text-ink-primary tnum text-sm">
                                  {fmtNum(r.group1.cartons)}
                                </span>
                                <div className="flex flex-wrap justify-end gap-1 mt-0.5">
                                  {r.group1.shifts.map((s, idx) => (
                                    <span
                                      key={idx}
                                      className="inline-flex items-center gap-0.5 text-[10px] text-ink-muted"
                                      title={`${s.shift}: ${fmtNum(s.cartons)} cartons`}
                                    >
                                      {getShiftIcon(s.shift)}
                                      <span className="tnum font-medium">{fmtNum(s.cartons)}</span>
                                    </span>
                                  ))}
                                </div>
                              </div>
                            ) : (
                              <span className="text-ink-muted/40 text-xs">—</span>
                            )}
                          </td>

                          {/* Group 2 */}
                          <td className="py-2.5 px-3 text-right">
                            {r.group2.cartons > 0 ? (
                              <div className="flex flex-col items-end">
                                <span className="font-bold text-ink-primary tnum text-sm">
                                  {fmtNum(r.group2.cartons)}
                                </span>
                                <div className="flex flex-wrap justify-end gap-1 mt-0.5">
                                  {r.group2.shifts.map((s, idx) => (
                                    <span
                                      key={idx}
                                      className="inline-flex items-center gap-0.5 text-[10px] text-ink-muted"
                                      title={`${s.shift}: ${fmtNum(s.cartons)} cartons`}
                                    >
                                      {getShiftIcon(s.shift)}
                                      <span className="tnum font-medium">{fmtNum(s.cartons)}</span>
                                    </span>
                                  ))}
                                </div>
                              </div>
                            ) : (
                              <span className="text-ink-muted/40 text-xs">—</span>
                            )}
                          </td>

                          {/* Group 3 */}
                          <td className="py-2.5 px-3 text-right">
                            {r.group3.cartons > 0 ? (
                              <div className="flex flex-col items-end">
                                <span className="font-bold text-ink-primary tnum text-sm">
                                  {fmtNum(r.group3.cartons)}
                                </span>
                                <div className="flex flex-wrap justify-end gap-1 mt-0.5">
                                  {r.group3.shifts.map((s, idx) => (
                                    <span
                                      key={idx}
                                      className="inline-flex items-center gap-0.5 text-[10px] text-ink-muted"
                                      title={`${s.shift}: ${fmtNum(s.cartons)} cartons`}
                                    >
                                      {getShiftIcon(s.shift)}
                                      <span className="tnum font-medium">{fmtNum(s.cartons)}</span>
                                    </span>
                                  ))}
                                </div>
                              </div>
                            ) : (
                              <span className="text-ink-muted/40 text-xs">—</span>
                            )}
                          </td>

                          {/* Part Time */}
                          <td className="py-2.5 px-3 text-right">
                            {r.partTime.cartons > 0 ? (
                              <div className="flex flex-col items-end">
                                <span className="font-bold text-amber-700 dark:text-amber-400 tnum text-sm">
                                  {fmtNum(r.partTime.cartons)}
                                </span>
                                <div className="flex flex-wrap justify-end gap-1 mt-0.5">
                                  {r.partTime.shifts.map((s, idx) => (
                                    <span
                                      key={idx}
                                      className="inline-flex items-center gap-0.5 text-[10px] text-ink-muted"
                                      title={`Part Time (${s.shift}): ${fmtNum(s.cartons)} cartons`}
                                    >
                                      {getShiftIcon(s.shift)}
                                      <span className="tnum font-medium">{fmtNum(s.cartons)}</span>
                                    </span>
                                  ))}
                                </div>
                              </div>
                            ) : (
                              <span className="text-ink-muted/40 text-xs">—</span>
                            )}
                          </td>
                        </>
                      ) : (
                        /* Shift Columns View */
                        <>
                          {/* Morning */}
                          <td className="py-2.5 px-3 text-right">
                            {r.byShift.Morning.cartons > 0 ? (
                              <div className="flex flex-col items-end">
                                <span className="font-bold text-ink-primary tnum text-sm">
                                  {fmtNum(r.byShift.Morning.cartons)}
                                </span>
                                {r.byShift.Morning.groupNumber && (
                                  <span className="text-[10px] font-semibold text-ink-muted">
                                    Grp {r.byShift.Morning.groupNumber}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-ink-muted/40 text-xs">—</span>
                            )}
                          </td>

                          {/* Afternoon */}
                          <td className="py-2.5 px-3 text-right">
                            {r.byShift.Afternoon.cartons > 0 ? (
                              <div className="flex flex-col items-end">
                                <span className="font-bold text-ink-primary tnum text-sm">
                                  {fmtNum(r.byShift.Afternoon.cartons)}
                                </span>
                                {r.byShift.Afternoon.groupNumber && (
                                  <span className="text-[10px] font-semibold text-ink-muted">
                                    Grp {r.byShift.Afternoon.groupNumber}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-ink-muted/40 text-xs">—</span>
                            )}
                          </td>

                          {/* Night */}
                          <td className="py-2.5 px-3 text-right">
                            {r.byShift.Night.cartons > 0 ? (
                              <div className="flex flex-col items-end">
                                <span className="font-bold text-ink-primary tnum text-sm">
                                  {fmtNum(r.byShift.Night.cartons)}
                                </span>
                                {r.byShift.Night.groupNumber && (
                                  <span className="text-[10px] font-semibold text-ink-muted">
                                    Grp {r.byShift.Night.groupNumber}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-ink-muted/40 text-xs">—</span>
                            )}
                          </td>
                        </>
                      )}

                      {/* Daily Total */}
                      <td className="py-2.5 px-4 text-right whitespace-nowrap bg-surface-sunken/20 font-bold text-sm tnum">
                        {r.total > 0 ? (
                          <span className={cn(isPeak ? "text-good-ink font-extrabold" : "text-ink-primary")}>
                            {fmtNum(r.total)}
                          </span>
                        ) : noWork ? (
                          <span className="text-[11px] font-bold text-amber-700 dark:text-amber-400" title={noWork}>
                            No work
                          </span>
                        ) : (
                          <span className="text-ink-muted/30 text-xs">0</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>

              {/* Table Footer: Totals and Share % */}
              <tfoot>
                {/* 1. Grand Totals Row */}
                <tr className="border-t-2 border-hairline bg-surface-sunken font-extrabold text-sm text-ink-primary">
                  <td colSpan={2} className="py-3 px-3.5 uppercase tracking-wider text-xs">
                    Monthly Total
                  </td>

                  {viewMode === "groups" ? (
                    <>
                      <td className="py-3 px-3 text-right tnum">
                        {fmtNum(matrix.summary.group1Total)}
                      </td>
                      <td className="py-3 px-3 text-right tnum">
                        {fmtNum(matrix.summary.group2Total)}
                      </td>
                      <td className="py-3 px-3 text-right tnum">
                        {fmtNum(matrix.summary.group3Total)}
                      </td>
                      <td className="py-3 px-3 text-right tnum text-amber-700 dark:text-amber-400">
                        {fmtNum(matrix.summary.partTimeTotal)}
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="py-3 px-3 text-right tnum">
                        {fmtNum(matrix.rows.reduce((s, r) => s + r.byShift.Morning.cartons, 0))}
                      </td>
                      <td className="py-3 px-3 text-right tnum">
                        {fmtNum(matrix.rows.reduce((s, r) => s + r.byShift.Afternoon.cartons, 0))}
                      </td>
                      <td className="py-3 px-3 text-right tnum">
                        {fmtNum(matrix.rows.reduce((s, r) => s + r.byShift.Night.cartons, 0))}
                      </td>
                    </>
                  )}

                  <td className="py-3 px-4 text-right tnum text-brand text-base font-black bg-brand-subtle/30">
                    {fmtNum(matrix.summary.totalCartons)}
                  </td>
                </tr>

                {/* 2. Group Percentage Share Row */}
                {viewMode === "groups" && matrix.summary.totalCartons > 0 && (
                  <tr className="border-t border-hairline bg-surface-card text-xs text-ink-secondary font-semibold">
                    <td colSpan={2} className="py-2 px-3.5 text-ink-muted text-[11px] uppercase tracking-wider">
                      % Share
                    </td>
                    <td className="py-2 px-3 text-right tnum">
                      {matrix.summary.group1Share.toFixed(1)}%
                    </td>
                    <td className="py-2 px-3 text-right tnum">
                      {matrix.summary.group2Share.toFixed(1)}%
                    </td>
                    <td className="py-2 px-3 text-right tnum">
                      {matrix.summary.group3Share.toFixed(1)}%
                    </td>
                    <td className="py-2 px-3 text-right tnum">
                      {matrix.summary.partTimeShare.toFixed(1)}%
                    </td>
                    <td className="py-2 px-4 text-right tnum font-bold text-ink-primary bg-surface-sunken/40">
                      100.0%
                    </td>
                  </tr>
                )}
              </tfoot>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
