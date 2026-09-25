"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import {
  RefreshCw, Loader2, AlertCircle, AlertTriangle, PackageCheck, Send, ClipboardList,
  Truck, FileText, Warehouse, Factory, ChevronRight, ArrowUpRight, Boxes, History,
} from "lucide-react"
import { fmt, fmt1 } from "@/components/features/dashboard/manager/viz"
import { byUrgency } from "@/lib/domain/stock-status"
import type { ProcurementMaterialStatus } from "@/lib/domain/stock-status"
import type { DispatchTotal } from "@/lib/domain/dispatch"
import { ALL_TIME_FROM } from "@/lib/domain/date-window"
import { ActionBtn } from "@/components/features/shared/action-btn"
import { Card, CardHeader, Eyebrow, EmptyState, StatTile } from "@/components/primitives"

// ============================================================================
// Stock Keeper home — an operational command center, distinct from the supervisor
// home (streaks/badges/leaderboard) and the read-only procurement home. The stock
// office OWNS physical movement, so its landing page answers one question first:
// what needs acting on right now. It reuses the endpoints the stock dashboard
// already reads (/api/procurement/report + /api/dispatch, both open to `stock`
// via requireStockRead) — no new route, no new figure, nothing recomputed here.
//
// The window is all-time, matching the app default: on-hand and finished-goods
// balances are as-of-today regardless, and the days-left urgency the attention
// list sorts on is measured over the recorded-usage span, not the raw window.
// ============================================================================

interface Report {
  materials: ProcurementMaterialStatus[]
  finishedGoods: { bitters: number; ginger: number }
  produced: { bitters: number; ginger: number; total: number }
  last_updated: string
}
interface DispatchSummary { totals: DispatchTotal[] }

const iso = (d: Date) => d.toISOString().slice(0, 10)

export function StockDashboard({ userName }: { userName: string | null }) {
  const [report, setReport] = useState<Report | null>(null)
  const [dispatched, setDispatched] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    const today = iso(new Date())
    try {
      const res = await fetch(`/api/procurement/report?from=${ALL_TIME_FROM}&to=${today}`)
      if (!res.ok) throw new Error()
      setReport(await res.json())
      // Dispatched total, silent-fail like the stock dashboard: a dispatch error
      // leaves that one tile blank rather than blanking the whole page.
      try {
        const dr = await fetch(`/api/dispatch?from=${ALL_TIME_FROM}&to=${today}`)
        if (dr.ok) {
          const d = (await dr.json()) as DispatchSummary
          setDispatched((d.totals ?? []).reduce((s, t) => s + t.cartons, 0))
        }
      } catch { /* silent — the dispatched tile stays blank */ }
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  // Inner async keeps the setState calls off the effect's synchronous path
  // (react-compiler's set-state-in-effect rule), like the app's other loaders.
  useEffect(() => {
    const run = async () => { await load() }
    void run()
  }, [load])

  const hour = new Date().getHours()
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"

  const materials = report ? [...report.materials].sort(byUrgency) : []
  const critical = materials.filter((m) => m.level === "red").length
  const low = materials.filter((m) => m.level === "yellow").length
  const attention = materials.filter((m) => m.level === "red" || m.level === "yellow")

  // Staggered entrance: each section fades up just after the one above it. Inline
  // fill-mode "both" holds the hidden pre-animation state during the delay so a
  // delayed card never flashes in before its turn. Reduced motion is handled
  // globally (the .animate-fade-in-up override), which shows every card at rest.
  const step = (i: number) => ({ animationDelay: `${i * 70}ms`, animationFillMode: "both" as const })

  return (
    <div className="space-y-4">
      {/* Hero — the app's one deliberately dark panel (see .hero-panel). Unlike the
          procurement home it carries the keeper's name, so the person owning stock
          movement lands on a page that is clearly theirs. */}
      <div className="hero-panel rounded-3xl overflow-hidden shadow-sm animate-fade-in-up" style={step(0)}>
        <div className="flex items-start justify-between gap-4 px-5 py-6 sm:px-6">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-widest text-white/60">{greeting}</p>
            <h1 className="mt-0.5 break-words text-xl sm:text-2xl font-bold tracking-tight text-white">
              {loading && !report
                ? <span className="inline-block h-7 w-40 rounded-lg bg-white/10 animate-pulse" />
                : (userName || "Stock Keeper")}
            </h1>
            <p className="mt-0.5 text-sm font-medium text-white/60">Stock Office · command center</p>

            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {!loading && report && (
                critical > 0 ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-xs font-bold text-white">
                    <span className="relative flex h-2 w-2" aria-hidden="true">
                      <span className="absolute inline-flex h-full w-full rounded-full bg-critical opacity-75 animate-ping" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-critical" />
                    </span>
                    {critical} need{critical === 1 ? "s" : ""} restock now
                  </span>
                ) : low > 0 ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-xs font-bold text-white/85">
                    <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />{low} to reorder soon
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-xs font-bold text-white/85">
                    <PackageCheck className="h-3 w-3 shrink-0" aria-hidden="true" />All materials stocked
                  </span>
                )
              )}
            </div>
          </div>
          <span className="hidden sm:flex w-14 h-14 rounded-2xl bg-white/10 border border-white/15 items-center justify-center shrink-0">
            <Warehouse className="w-7 h-7 text-white" aria-hidden="true" />
          </span>
        </div>
      </div>

      {error && (
        <Card>
          <EmptyState
            icon={<AlertCircle className="w-5 h-5 text-critical" />}
            title="Couldn’t load the stock picture"
            description="The request failed. Check your connection and try again."
            action={
              <button onClick={load} className="h-10 px-4 rounded-xl bg-brand-solid text-brand-ink text-sm font-bold active:scale-[0.97]">
                Retry
              </button>
            }
          />
        </Card>
      )}

      {/* At-a-glance: what needs acting on, then what is on hand. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 animate-fade-in-up" style={step(1)}>
        <StatTile label="Restock now" value={report ? critical : "—"} unit="items" icon={<AlertCircle className="w-5 h-5" />} accent={critical > 0 ? "critical" : "neutral"} />
        <StatTile label="Reorder soon" value={report ? low : "—"} unit="items" icon={<AlertTriangle className="w-5 h-5" />} accent={low > 0 ? "warning" : "neutral"} />
        <StatTile label="Bitters — on hand" value={report?.finishedGoods.bitters ?? "—"} unit="ctn" icon={<Warehouse className="w-5 h-5" />} accent="bitters" />
        <StatTile label="Ginger — on hand" value={report?.finishedGoods.ginger ?? "—"} unit="ctn" icon={<Warehouse className="w-5 h-5" />} accent="ginger" />
      </div>

      {/* Lifetime activity. Labelled all-time so the totals are never mistaken for a
          recent window; the Stock levels page carries the full per-window detail. */}
      <div className="grid grid-cols-3 gap-3 animate-fade-in-up" style={step(2)}>
        <StatTile label="Produced" value={report?.produced.total ?? "—"} unit="ctn" sub="all-time" icon={<Factory className="w-5 h-5" />} accent="brand" />
        <StatTile label="Dispatched" value={dispatched ?? "—"} unit="ctn" sub="all-time" icon={<Truck className="w-5 h-5" />} accent="neutral" />
        <StatTile label="Tracked materials" value={report ? materials.length : "—"} unit="items" icon={<Boxes className="w-5 h-5" />} accent="neutral" />
      </div>

      <div className="animate-fade-in-up" style={step(3)}>
      <Card>
        <CardHeader
          title="Needs attention"
          hint={report
            ? attention.length > 0
              ? `${attention.length} material${attention.length > 1 ? "s" : ""} at or below reorder level`
              : "sorted by urgency · nothing low"
            : undefined}
          actions={
            <button
              onClick={load}
              disabled={loading}
              className="h-9 px-3 flex items-center gap-1.5 rounded-lg border border-hairline bg-surface-card text-xs font-bold text-ink-secondary hover:border-brand transition-colors disabled:opacity-60"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />}
              Refresh
            </button>
          }
        />
        {loading && !report ? (
          <div className="p-4 space-y-2">
            {[0, 1, 2].map((i) => <div key={i} className="h-14 rounded-2xl bg-surface-sunken animate-pulse" />)}
          </div>
        ) : attention.length === 0 ? (
          <EmptyState
            compact
            icon={<PackageCheck className="w-5 h-5" aria-hidden="true" />}
            title="Everything is stocked"
            description="No material is at or below its reorder level."
          />
        ) : (
          <ul className="divide-y divide-hairline">
            {attention.map((m) => (
              <li key={m.key}>
                <Link
                  href={`/dashboard/procurement/stock/material/${m.key}`}
                  className="group flex items-center gap-3 px-4 sm:px-5 py-3 hover:bg-surface-sunken transition-colors"
                >
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${m.level === "red" ? "bg-critical" : "bg-warning"}`} aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-ink-primary truncate">{m.label}</span>
                    <span className="block text-xs font-medium text-ink-muted truncate">
                      {fmt(m.remaining)} {m.unit} left{m.breakdown ? ` · ${m.breakdown}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className={`block text-sm font-bold ${m.level === "red" ? "text-critical-ink" : "text-warning-ink"}`}>
                      {m.operatingDaysLeft === null ? "—" : `${fmt1(m.operatingDaysLeft)}d`}
                    </span>
                    <span className="block text-[11px] font-medium text-ink-muted">left</span>
                  </span>
                  <ChevronRight className="w-4 h-4 shrink-0 text-ink-muted transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        )}
        {report && (
          <div className="px-5 py-3 border-t border-hairline">
            <Link href="/dashboard/procurement/stock" className="inline-flex items-center gap-1 text-xs font-bold text-brand hover:underline">
              View all stock levels <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
            </Link>
          </div>
        )}
      </Card>
      </div>

      {/* Quick actions — the stock office's real jobs, one tap each. Log receipt is
          the primary target; dispatch and invoices are stock responsibilities too. */}
      <div className="animate-fade-in-up" style={step(4)}>
        <Eyebrow className="mb-2 block">Quick actions</Eyebrow>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <ActionBtn href="/dashboard/procurement/submit" icon={Send} label="Log a receipt or issue" primary />
          <ActionBtn href="/dashboard/procurement/stock" icon={ClipboardList} label="Stock levels & counts" />
          <ActionBtn href="/dashboard/procurement/dispatch" icon={Truck} label="Dispatch a load" />
          <ActionBtn href="/dashboard/procurement/invoices" icon={FileText} label="Supplier invoices" />
          <ActionBtn href="/dashboard/history" icon={History} label="Stock history" />
        </div>
      </div>
    </div>
  )
}
