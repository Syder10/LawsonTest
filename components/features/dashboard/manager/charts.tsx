"use client"

import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
} from "recharts"
import { SERIES, GRID, AXIS, shortDay, fmt } from "./viz"
import type { AnalyticsReport } from "./types"

const axisProps = { stroke: AXIS, tick: { fontSize: 11, fill: AXIS }, tickLine: false, axisLine: { stroke: GRID } }

function TooltipCard({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-lg px-3 py-2 text-xs">
      <p className="font-black text-slate-900 mb-1">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2 tabular-nums">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: p.color }} />
          <span className="text-slate-500 font-semibold capitalize">{p.name}</span>
          <span className="ml-auto font-bold text-slate-900">{fmt(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

// Per-day production trend. Total = neutral aggregate; Bitters/Ginger the two
// validated categorical hues. Click a point to inspect that day.
export function ProductionTrend({ data, onSelectDay }: { data: AnalyticsReport["byDay"]; onSelectDay: (date: string) => void }) {
  const rows = data.map((d) => ({ ...d, label: shortDay(d.date) }))
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-black text-slate-900">Production over time</h3>
        <span className="text-[10px] font-semibold text-slate-400">cartons · click a day to inspect</span>
      </div>
      {rows.length === 0 ? (
        <Empty />
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={rows} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}
            onClick={(e: any) => { const d = e?.activePayload?.[0]?.payload?.date; if (d) onSelectDay(d) }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
            <XAxis dataKey="label" {...axisProps} minTickGap={16} />
            <YAxis {...axisProps} width={44} allowDecimals={false} />
            <Tooltip content={<TooltipCard />} cursor={{ stroke: AXIS, strokeDasharray: "3 3" }} />
            <Legend iconType="plainline" wrapperStyle={{ fontSize: 11, fontWeight: 700 }} />
            <Line type="monotone" dataKey="total" name="Total" stroke={SERIES.total} strokeWidth={2} dot={false} activeDot={{ r: 5 }} />
            <Line type="monotone" dataKey="bitters" name="Bitters" stroke={SERIES.bitters} strokeWidth={2} dot={false} activeDot={{ r: 5 }} />
            <Line type="monotone" dataKey="ginger" name="Ginger" stroke={SERIES.ginger} strokeWidth={2} dot={false} activeDot={{ r: 5 }} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

// Production split across the three shifts.
export function ShiftBreakdown({ data }: { data: AnalyticsReport["byShift"] }) {
  const hasData = data.some((s) => s.total > 0)
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-black text-slate-900">By shift</h3>
        <span className="text-[10px] font-semibold text-slate-400">cartons</span>
      </div>
      {!hasData ? (
        <Empty />
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 0 }} barGap={2} barCategoryGap="28%">
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
            <XAxis dataKey="shift" {...axisProps} />
            <YAxis {...axisProps} width={44} allowDecimals={false} />
            <Tooltip content={<TooltipCard />} cursor={{ fill: "rgba(148,163,184,0.08)" }} />
            <Legend iconType="square" wrapperStyle={{ fontSize: 11, fontWeight: 700 }} />
            <Bar dataKey="bitters" name="Bitters" fill={SERIES.bitters} radius={[4, 4, 0, 0]} />
            <Bar dataKey="ginger" name="Ginger" fill={SERIES.ginger} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

function Empty() {
  return (
    <div className="h-[220px] flex items-center justify-center text-sm font-semibold text-slate-400">
      No production in this range.
    </div>
  )
}
