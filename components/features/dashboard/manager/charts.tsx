"use client"

import { useState } from "react"
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
} from "recharts"
import { SERIES, GRID, AXIS, fmt } from "./viz"
import type { DaySeriesPoint, ShiftSeriesPoint, GroupSeriesPoint } from "./types"
import { Card, CardHeader, EmptyState } from "@/components/primitives"
import { groupTrendData, type TrendGrouping } from "@/lib/domain/trend-grouping"

// ============================================================================
// Charts.
//
// Key rules applied here:
//   • Gridlines are SOLID hairlines one step off the surface, never dashed —
//     dashing reads as "projection" or "threshold" when it is just a grid.
//   • A legend appears only for two or more series. A single series needs none:
//     the card title already names what is plotted.
//   • `productSplit` gates the Bitters/Ginger series. Blowing and Concentrate have
//     no `product` column, so splitting there would fabricate data. Those get one
//     neutral series instead.
//   • Text never wears the series colour — values and labels use ink tokens; the
//     coloured mark beside them carries identity.
//   • The pivot table (PackagingPivotTable) serves as the accessible tabular
//     equivalent; chart-only table toggles have been removed.
// ============================================================================

const axisProps = {
  stroke: AXIS,
  tick: { fontSize: 11, fill: AXIS },
  tickLine: false,
  axisLine: { stroke: GRID },
}

function TooltipCard({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const point = payload[0]?.payload
  return (
    <div className="rounded-xl border border-hairline bg-surface-raised shadow-lg px-3 py-2 text-xs">
      <div className="flex items-center justify-between gap-2 mb-1">
        <p className="font-bold text-ink-primary">{label}</p>
        {point?.noWorkReason && (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30">
            No Work
          </span>
        )}
      </div>
      {point?.noWorkReason && (
        <p className="text-[11px] text-amber-700 dark:text-amber-300 mb-1.5 font-medium">
          {point.noWorkReason}
        </p>
      )}
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2 tnum">
          {/* A short stroke keys the series; at tooltip density a filled box is
              data-weight ink doing a label's job. */}
          <span className="w-3 h-0.5 rounded-full" style={{ background: p.color }} aria-hidden="true" />
          <span className="text-ink-secondary font-semibold">{p.name}</span>
          <span className="ml-auto font-bold text-ink-primary">{fmt(p.value)}</span>
        </div>
      ))}
    </div>
  )
}


/**
 * Per-day trend. What is plotted depends on the department — cartons for
 * Packaging, bottles for Blowing, litres for Concentrate — so `label` and `unit`
 * are passed in rather than hardcoded to "cartons".
 *
 * Phase 6 display controls: Day / Week / Month grouping (via pure function)
 * and optional metric toggle for Bitters / Ginger when split exists.
 */
export function ProductionTrend({
  data,
  onSelectDay,
  label = "Output",
  unit,
  productSplit = true,
}: {
  data: DaySeriesPoint[]
  onSelectDay: (date: string) => void
  label?: string
  unit?: string
  productSplit?: boolean
}) {
  const [grouping, setGrouping] = useState<TrendGrouping>("month")
  const [metricFilter, setMetricFilter] = useState<"all" | "bitters" | "ginger">("all")

  const grouped = groupTrendData(data, grouping)

  return (
    <Card>
      <CardHeader
        title={`${label} over time`}
        hint={`${unit ?? ""}${unit ? " · " : ""}click a period to inspect`}
        actions={
          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            {/* Metric toggle if productSplit is true */}
            {productSplit && (
              <div
                role="radiogroup"
                aria-label="Metric series"
                className="inline-flex rounded-lg border border-hairline overflow-hidden text-[11px] font-bold"
              >
                {(
                  [
                    ["all", "All"],
                    ["bitters", "Bitters"],
                    ["ginger", "Ginger"],
                  ] as const
                ).map(([m, text]) => (
                  <button
                    key={m}
                    role="radio"
                    aria-checked={metricFilter === m}
                    onClick={() => setMetricFilter(m)}
                    className={`h-7 px-2 transition-colors ${
                      metricFilter === m
                        ? "bg-brand-subtle text-brand-subtle-ink"
                        : "text-ink-muted hover:text-ink-secondary"
                    }`}
                  >
                    {text}
                  </button>
                ))}
              </div>
            )}

            {/* Grouping toggle: Month / All Time */}
            <div
              role="radiogroup"
              aria-label="Time grouping"
              className="inline-flex rounded-lg border border-hairline overflow-hidden text-[11px] font-bold"
            >
              {(
                [
                  ["month", "Month"],
                  ["year", "All Time"],
                ] as const
              ).map(([g, text]) => (
                <button
                  key={g}
                  role="radio"
                  aria-checked={grouping === g}
                  onClick={() => setGrouping(g)}
                  className={`h-7 px-2.5 transition-colors ${
                    grouping === g
                      ? "bg-brand-subtle text-brand-subtle-ink"
                      : "text-ink-muted hover:text-ink-secondary"
                  }`}
                >
                  {text}
                </button>
              ))}
            </div>
          </div>
        }
      />
      {grouped.length === 0 ? (
        <EmptyState compact title="Nothing recorded in this range" description="Try a wider date range or a different filter." />
      ) : (
        <div className="p-4 pt-2">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart
              data={grouped}
              margin={{ top: 8, right: 12, left: -8, bottom: 0 }}
              onClick={(e: any) => {
                const d = e?.activePayload?.[0]?.payload?.startDate
                if (d) onSelectDay(d)
              }}
            >
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="label" {...axisProps} minTickGap={16} />
              <YAxis {...axisProps} width={44} allowDecimals={false} />
              <Tooltip content={<TooltipCard />} cursor={{ stroke: AXIS }} />
              {productSplit && metricFilter === "all" && (
                <Legend iconType="plainline" wrapperStyle={{ fontSize: 11, fontWeight: 700 }} />
              )}

              {/* Show Total if all metrics chosen or no product split */}
              {(!productSplit || metricFilter === "all") && (
                <Line
                  type="monotone"
                  dataKey="total"
                  name={productSplit ? "Total" : label}
                  stroke={productSplit ? SERIES.total : SERIES.bitters}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              )}

              {/* Show Bitters if all or bitters chosen */}
              {productSplit && (metricFilter === "all" || metricFilter === "bitters") && (
                <Line
                  type="monotone"
                  dataKey="bitters"
                  name="Bitters"
                  stroke={SERIES.bitters}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              )}

              {/* Show Ginger if all or ginger chosen */}
              {productSplit && (metricFilter === "all" || metricFilter === "ginger") && (
                <Line
                  type="monotone"
                  dataKey="ginger"
                  name="Ginger"
                  stroke={SERIES.ginger}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  )
}

/** Output measure split across groups (Group 1, Group 2, Group 3, Part Time) or shifts. */
export function GroupBreakdown({
  data,
  groupData,
  shiftData,
  productSplit = true,
  label = "Output",
}: {
  data?: GroupSeriesPoint[] | ShiftSeriesPoint[]
  groupData?: GroupSeriesPoint[]
  shiftData?: ShiftSeriesPoint[]
  productSplit?: boolean
  label?: string
}) {
  const [viewMode, setViewMode] = useState<"group" | "shift">("group")

  // Resolve groups vs shifts
  // 1. If groupData is provided, use it
  // 2. If data has group objects, use it
  // 3. Fall back to shiftData or data
  const groups = groupData ?? (data && data.length > 0 && "group" in data[0] ? (data as GroupSeriesPoint[]) : undefined)
  const shifts = shiftData ?? (data && data.length > 0 && "shift" in data[0] ? (data as ShiftSeriesPoint[]) : undefined)

  const isGroup = viewMode === "group" || !shifts || shifts.length === 0
  const activeRows = isGroup && groups && groups.length > 0
    ? groups.map((g) => ({ key: g.group, total: g.total, bitters: g.bitters, ginger: g.ginger }))
    : (shifts ?? []).map((s) => ({ key: s.shift, total: s.total, bitters: s.bitters, ginger: s.ginger }))

  const hasData = activeRows.some((s) => s.total > 0)
  const title = isGroup ? "By group" : "By shift"

  return (
    <Card>
      <CardHeader
        title={title}
        hint={label}
        actions={
          <div className="flex items-center gap-1.5">
            {shifts && shifts.length > 0 && groups && groups.length > 0 && (
              <div role="radiogroup" aria-label="Split by" className="inline-flex rounded-lg border border-hairline overflow-hidden text-xs">
                <button
                  type="button"
                  role="radio"
                  aria-checked={isGroup}
                  onClick={() => setViewMode("group")}
                  className={`h-7 px-2 text-[11px] font-semibold transition-colors ${
                    isGroup ? "bg-brand-subtle text-brand-subtle-ink" : "text-ink-muted hover:text-ink-secondary"
                  }`}
                >
                  Group
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={!isGroup}
                  onClick={() => setViewMode("shift")}
                  className={`h-7 px-2 text-[11px] font-semibold transition-colors ${
                    !isGroup ? "bg-brand-subtle text-brand-subtle-ink" : "text-ink-muted hover:text-ink-secondary"
                  }`}
                >
                  Shift
                </button>
              </div>
            )}
          </div>
        }
      />
      {!hasData ? (
        <EmptyState compact title="Nothing recorded in this range" />
      ) : (
        <div className="p-4 pt-2">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={activeRows} margin={{ top: 8, right: 12, left: -8, bottom: 0 }} barGap={2} barCategoryGap="28%">
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="key" {...axisProps} />
              <YAxis {...axisProps} width={44} allowDecimals={false} />
              <Tooltip content={<TooltipCard />} cursor={{ fill: "color-mix(in oklab, var(--ink-muted) 8%, transparent)" }} />
              {productSplit && <Legend iconType="square" wrapperStyle={{ fontSize: 11, fontWeight: 700 }} />}
              {productSplit ? (
                <>
                  <Bar dataKey="bitters" name="Bitters" fill={SERIES.bitters} radius={[4, 4, 0, 0]} maxBarSize={24} />
                  <Bar dataKey="ginger" name="Ginger" fill={SERIES.ginger} radius={[4, 4, 0, 0]} maxBarSize={24} />
                </>
              ) : (
                <Bar dataKey="total" name={label} fill={SERIES.bitters} radius={[4, 4, 0, 0]} maxBarSize={24} />
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  )
}

/** Backwards-compatible alias for existing callers */
export const ShiftBreakdown = GroupBreakdown
