"use client"

import { useState } from "react"
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
} from "recharts"
import { BarChart3, Table2 } from "lucide-react"
import { SERIES, GRID, AXIS, shortDay, fmt } from "./viz"
import type { DaySeriesPoint, ShiftSeriesPoint } from "./types"
import { Card, CardHeader, EmptyState } from "@/components/primitives"

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
//   • Every chart has a TABLE VIEW twin, so no value is reachable only by hover.
// ============================================================================

const axisProps = {
  stroke: AXIS,
  tick: { fontSize: 11, fill: AXIS },
  tickLine: false,
  axisLine: { stroke: GRID },
}

function TooltipCard({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-hairline bg-surface-raised shadow-lg px-3 py-2 text-xs">
      <p className="font-bold text-ink-primary mb-1">{label}</p>
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

/** Chart / table toggle — the table view is the WCAG-clean equivalent. */
function ViewToggle({ view, onChange }: { view: "chart" | "table"; onChange: (v: "chart" | "table") => void }) {
  return (
    <div role="radiogroup" aria-label="View as" className="inline-flex rounded-lg border border-hairline overflow-hidden">
      {([["chart", BarChart3, "Chart"], ["table", Table2, "Table"]] as const).map(([v, Icon, label]) => (
        <button
          key={v}
          role="radio"
          aria-checked={view === v}
          aria-label={label}
          title={label}
          onClick={() => onChange(v)}
          className={`h-7 w-8 flex items-center justify-center transition-colors ${
            view === v ? "bg-brand-subtle text-brand-subtle-ink" : "text-ink-muted hover:text-ink-secondary"
          }`}
        >
          <Icon className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      ))}
    </div>
  )
}

function SeriesTable({
  rows,
  firstHeader,
  productSplit,
  label,
}: {
  rows: { key: string; total: number; bitters: number; ginger: number }[]
  firstHeader: string
  productSplit: boolean
  label: string
}) {
  return (
    <div className="max-h-[260px] overflow-y-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-surface-sunken">
          <tr>
            <th scope="col" className="text-left px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-ink-muted">{firstHeader}</th>
            <th scope="col" className="text-right px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-ink-muted">{label}</th>
            {productSplit && <th scope="col" className="text-right px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-ink-muted">Bitters</th>}
            {productSplit && <th scope="col" className="text-right px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-ink-muted">Ginger</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-hairline">
          {rows.map((r) => (
            <tr key={r.key}>
              <td className="px-3 py-1.5 font-semibold text-ink-secondary whitespace-nowrap">{r.key}</td>
              <td className="px-3 py-1.5 text-right tnum text-ink-primary font-semibold">{fmt(r.total)}</td>
              {productSplit && <td className="px-3 py-1.5 text-right tnum text-ink-secondary">{fmt(r.bitters)}</td>}
              {productSplit && <td className="px-3 py-1.5 text-right tnum text-ink-secondary">{fmt(r.ginger)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * Per-day trend. What is plotted depends on the department — cartons for
 * Packaging, bottles for Blowing, litres for Concentrate — so `label` and `unit`
 * are passed in rather than hardcoded to "cartons".
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
  const [view, setView] = useState<"chart" | "table">("chart")
  const rows = data.map((d) => ({ ...d, label: shortDay(d.date) }))

  return (
    <Card>
      <CardHeader
        title={`${label} over time`}
        hint={`${unit ?? ""}${unit ? " · " : ""}click a day to inspect`}
        actions={<ViewToggle view={view} onChange={setView} />}
      />
      {rows.length === 0 ? (
        <EmptyState compact title="Nothing recorded in this range" description="Try a wider date range or a different filter." />
      ) : view === "table" ? (
        <SeriesTable
          rows={rows.map((r) => ({ key: r.label, total: r.total, bitters: r.bitters, ginger: r.ginger }))}
          firstHeader="Day"
          productSplit={productSplit}
          label={label}
        />
      ) : (
        // Height includes the x-axis band, so the axis labels are never cropped
        // into a nested scrollbar.
        <div className="p-4 pt-2">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart
              data={rows}
              margin={{ top: 8, right: 12, left: -8, bottom: 0 }}
              onClick={(e: any) => {
                const d = e?.activePayload?.[0]?.payload?.date
                if (d) onSelectDay(d)
              }}
            >
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="label" {...axisProps} minTickGap={16} />
              <YAxis {...axisProps} width={44} allowDecimals={false} />
              <Tooltip content={<TooltipCard />} cursor={{ stroke: AXIS }} />
              {productSplit && <Legend iconType="plainline" wrapperStyle={{ fontSize: 11, fontWeight: 700 }} />}
              <Line
                type="monotone"
                dataKey="total"
                name={productSplit ? "Total" : label}
                stroke={productSplit ? SERIES.total : SERIES.bitters}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
              {productSplit && (
                <Line type="monotone" dataKey="bitters" name="Bitters" stroke={SERIES.bitters} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              )}
              {productSplit && (
                <Line type="monotone" dataKey="ginger" name="Ginger" stroke={SERIES.ginger} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  )
}

/** The same measure split across the three shifts. */
export function ShiftBreakdown({
  data,
  productSplit = true,
  label = "Output",
}: {
  data: ShiftSeriesPoint[]
  productSplit?: boolean
  label?: string
}) {
  const [view, setView] = useState<"chart" | "table">("chart")
  const hasData = data.some((s) => s.total > 0)

  return (
    <Card>
      <CardHeader title="By shift" hint={label} actions={<ViewToggle view={view} onChange={setView} />} />
      {!hasData ? (
        <EmptyState compact title="Nothing recorded in this range" />
      ) : view === "table" ? (
        <SeriesTable
          rows={data.map((s) => ({ key: s.shift, total: s.total, bitters: s.bitters, ginger: s.ginger }))}
          firstHeader="Shift"
          productSplit={productSplit}
          label={label}
        />
      ) : (
        <div className="p-4 pt-2">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 0 }} barGap={2} barCategoryGap="28%">
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="shift" {...axisProps} />
              <YAxis {...axisProps} width={44} allowDecimals={false} />
              <Tooltip content={<TooltipCard />} cursor={{ fill: "color-mix(in oklab, var(--ink-muted) 8%, transparent)" }} />
              {productSplit && <Legend iconType="square" wrapperStyle={{ fontSize: 11, fontWeight: 700 }} />}
              {productSplit ? (
                <>
                  {/* maxBarSize caps the mark so the band keeps some air rather
                      than the bar filling its whole slot. */}
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
