"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import Link from "next/link"
import { motion, AnimatePresence } from "framer-motion"
import {
  RefreshCw,
  Loader2,
  AlertCircle,
  AlertTriangle,
  PackageCheck,
  Send,
  ClipboardList,
  Truck,
  FileText,
  Warehouse,
  Factory,
  ChevronRight,
  ArrowUpRight,
  Boxes,
  History,
  RotateCcw,
  Calendar,
  Gift,
  Search,
  CheckCircle2,
  SlidersHorizontal,
  Layers,
} from "lucide-react"
import { fmt, fmt1 } from "@/components/features/dashboard/manager/viz"
import { byUrgency } from "@/lib/domain/stock-status"
import type { ProcurementMaterialStatus } from "@/lib/domain/stock-status"
import type { DispatchTotal } from "@/lib/domain/dispatch"
import { ALL_TIME_FROM } from "@/lib/domain/date-window"
import { Card, CardHeader, EmptyState, StatTile } from "@/components/primitives"

interface Report {
  materials: ProcurementMaterialStatus[]
  finishedGoods: { bitters: number; ginger: number }
  produced: { bitters: number; ginger: number; total: number }
  last_updated: string
}
interface DispatchSummary {
  totals: DispatchTotal[]
}

const iso = (d: Date) => d.toISOString().slice(0, 10)

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: "easeOut" as const },
  },
}

export function StockDashboard({ userName }: { userName: string | null }) {
  const [report, setReport] = useState<Report | null>(null)
  const [dispatched, setDispatched] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [urgencyFilter, setUrgencyFilter] = useState<"all" | "critical" | "warning">("all")

  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    const today = iso(new Date())
    try {
      const res = await fetch(`/api/procurement/report?from=${ALL_TIME_FROM}&to=${today}`)
      if (!res.ok) throw new Error()
      setReport(await res.json())

      try {
        const dr = await fetch(`/api/dispatch?from=${ALL_TIME_FROM}&to=${today}`)
        if (dr.ok) {
          const d = (await dr.json()) as DispatchSummary
          setDispatched((d.totals ?? []).reduce((s, t) => s + t.cartons, 0))
        }
      } catch {
        /* silent — dispatched stays null */
      }
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const hour = new Date().getHours()
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"

  const materials = useMemo(
    () => (report ? [...report.materials].sort(byUrgency) : []),
    [report],
  )
  const critical = materials.filter((m) => m.level === "red").length
  const low = materials.filter((m) => m.level === "yellow").length
  const attention = useMemo(
    () => materials.filter((m) => m.level === "red" || m.level === "yellow"),
    [materials],
  )

  const filteredAttention = useMemo(() => {
    return attention.filter((m) => {
      const matchesSearch =
        m.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.unit.toLowerCase().includes(searchQuery.toLowerCase())
      if (!matchesSearch) return false
      if (urgencyFilter === "critical") return m.level === "red"
      if (urgencyFilter === "warning") return m.level === "yellow"
      return true
    })
  }, [attention, searchQuery, urgencyFilter])

  return (
    <motion.div
      className="space-y-6 pb-12"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Hero Banner */}
      <motion.div
        variants={itemVariants}
        className="hero-panel relative overflow-hidden rounded-3xl p-6 shadow-md border border-white/10 sm:p-7"
      >
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0 max-w-xl">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold tracking-wider uppercase text-white/80">
                <Warehouse className="h-3.5 w-3.5" />
                Stock Operations Hub
              </span>
              <span className="text-xs text-white/60 font-medium">·</span>
              <span className="text-xs text-white/70">{greeting}</span>
            </div>

            <h1 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
              {loading && !report ? (
                <span className="inline-block h-8 w-44 rounded-lg bg-white/15 animate-pulse" />
              ) : (
                userName || "Stock Officer"
              )}
            </h1>
            <p className="mt-1 text-sm text-white/70">
              Managing plant raw materials, finished stock inventory, and branch distribution.
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              {!loading && report && (
                <>
                  {critical > 0 ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-critical/40 bg-critical/20 px-3 py-1 text-xs font-bold text-white backdrop-blur-sm">
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-critical opacity-75" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-critical" />
                      </span>
                      {critical} Material{critical === 1 ? "" : "s"} at Critical Level
                    </span>
                  ) : null}

                  {low > 0 ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-warning/40 bg-warning/20 px-3 py-1 text-xs font-bold text-white backdrop-blur-sm">
                      <AlertTriangle className="h-3 w-3" />
                      {low} to Reorder Soon
                    </span>
                  ) : null}

                  {critical === 0 && low === 0 ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-good/40 bg-good/20 px-3 py-1 text-xs font-bold text-white backdrop-blur-sm">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      All Materials Healthy
                    </span>
                  ) : null}
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={load}
              disabled={loading}
              className="flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-xs font-bold text-white backdrop-blur-sm transition-all hover:bg-white/20 active:scale-95 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Sync Data
            </button>
          </div>
        </div>

        {/* Decorative background glow */}
        <div className="pointer-events-none absolute -right-12 -bottom-12 h-64 w-64 rounded-full bg-white/5 blur-3xl" />
      </motion.div>

      {error && (
        <Card>
          <EmptyState
            icon={<AlertCircle className="h-6 w-6 text-critical" />}
            title="Failed to load stock data"
            description="The live stock report could not be retrieved. Please check your network and try again."
            action={
              <button
                onClick={load}
                className="h-10 rounded-xl bg-brand-solid px-5 text-sm font-bold text-brand-ink transition-transform active:scale-95"
              >
                Retry Connection
              </button>
            }
          />
        </Card>
      )}

      {/* Primary KPI Status Grid */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          label="Restock Now"
          value={report ? critical : "—"}
          unit="items"
          icon={<AlertCircle className="h-5 w-5" />}
          accent={critical > 0 ? "critical" : "neutral"}
        />
        <StatTile
          label="Reorder Soon"
          value={report ? low : "—"}
          unit="items"
          icon={<AlertTriangle className="h-5 w-5" />}
          accent={low > 0 ? "warning" : "neutral"}
        />
        <StatTile
          label="Bitters Finished"
          value={report?.finishedGoods.bitters ?? "—"}
          unit="ctn"
          icon={<Warehouse className="h-5 w-5" />}
          accent="bitters"
        />
        <StatTile
          label="Ginger Finished"
          value={report?.finishedGoods.ginger ?? "—"}
          unit="ctn"
          icon={<Warehouse className="h-5 w-5" />}
          accent="ginger"
        />
      </motion.div>

      {/* Production & Activity Overview */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile
          label="Total Produced"
          value={report?.produced.total ?? "—"}
          unit="cartons"
          sub="all-time production"
          icon={<Factory className="h-5 w-5" />}
          accent="brand"
        />
        <StatTile
          label="Total Dispatched"
          value={dispatched ?? "—"}
          unit="cartons"
          sub="dispatched to branches"
          icon={<Truck className="h-5 w-5" />}
          accent="neutral"
        />
        <StatTile
          label="Tracked Materials"
          value={report ? materials.length : "—"}
          unit="active items"
          sub="monitored in ledger"
          icon={<Boxes className="h-5 w-5" />}
          accent="neutral"
        />
      </motion.div>

      {/* Quick Actions Hub: Organized by Functional Areas */}
      <motion.div variants={itemVariants} className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-ink-primary">Stock Workflow Center</h2>
          <span className="text-xs text-ink-muted">Direct operational controls</span>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Movement & Floor Operations */}
          <div className="rounded-2xl border border-border-subtle bg-surface-card p-5 shadow-sm">
            <div className="mb-3.5 flex items-center justify-between border-b border-border-subtle pb-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-primary">
                  <Send className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-ink-primary">Physical Stock Operations</h3>
                  <p className="text-xs text-ink-muted">Inbound, outbound, returns & movements</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <Link
                href="/dashboard/stock/receipts"
                className="group flex flex-col justify-between rounded-xl border border-border-subtle bg-surface-base p-3.5 transition-all hover:border-brand-primary hover:shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-elevated text-ink-primary group-hover:bg-brand-primary group-hover:text-white transition-colors">
                    <Send className="h-4 w-4" />
                  </div>
                  <ChevronRight className="h-4 w-4 text-ink-muted group-hover:translate-x-0.5 transition-transform" />
                </div>
                <div className="mt-3">
                  <span className="block text-sm font-bold text-ink-primary">Log Receipts & Issues</span>
                  <span className="block text-xs text-ink-muted">Raw materials & PPE</span>
                </div>
              </Link>

              <Link
                href="/dashboard/stock/dispatch"
                className="group flex flex-col justify-between rounded-xl border border-border-subtle bg-surface-base p-3.5 transition-all hover:border-brand-primary hover:shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-elevated text-ink-primary group-hover:bg-brand-primary group-hover:text-white transition-colors">
                    <Truck className="h-4 w-4" />
                  </div>
                  <ChevronRight className="h-4 w-4 text-ink-muted group-hover:translate-x-0.5 transition-transform" />
                </div>
                <div className="mt-3">
                  <span className="block text-sm font-bold text-ink-primary">Dispatch Loads</span>
                  <span className="block text-xs text-ink-muted">Branch deliveries</span>
                </div>
              </Link>

              <Link
                href="/dashboard/stock/returns"
                className="group flex flex-col justify-between rounded-xl border border-border-subtle bg-surface-base p-3.5 transition-all hover:border-brand-primary hover:shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-elevated text-ink-primary group-hover:bg-brand-primary group-hover:text-white transition-colors">
                    <RotateCcw className="h-4 w-4" />
                  </div>
                  <ChevronRight className="h-4 w-4 text-ink-muted group-hover:translate-x-0.5 transition-transform" />
                </div>
                <div className="mt-3">
                  <span className="block text-sm font-bold text-ink-primary">Product Returns</span>
                  <span className="block text-xs text-ink-muted">Repack & spoilage logs</span>
                </div>
              </Link>

              <Link
                href="/dashboard/stock/donations"
                className="group flex flex-col justify-between rounded-xl border border-border-subtle bg-surface-base p-3.5 transition-all hover:border-brand-primary hover:shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-elevated text-ink-primary group-hover:bg-brand-primary group-hover:text-white transition-colors">
                    <Gift className="h-4 w-4" />
                  </div>
                  <ChevronRight className="h-4 w-4 text-ink-muted group-hover:translate-x-0.5 transition-transform" />
                </div>
                <div className="mt-3">
                  <span className="block text-sm font-bold text-ink-primary">Donations & Samples</span>
                  <span className="block text-xs text-ink-muted">Promotional outgoings</span>
                </div>
              </Link>
            </div>
          </div>

          {/* Audit, Reports & Verification */}
          <div className="rounded-2xl border border-border-subtle bg-surface-card p-5 shadow-sm">
            <div className="mb-3.5 flex items-center justify-between border-b border-border-subtle pb-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <Calendar className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-ink-primary">Audit, Reports & Governance</h3>
                  <p className="text-xs text-ink-muted">Reconciliation, invoices & counts</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <Link
                href="/dashboard/stock/monthly-report"
                className="group flex flex-col justify-between rounded-xl border-2 border-brand-primary/30 bg-brand-primary/[0.03] p-3.5 transition-all hover:border-brand-primary hover:shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-primary text-white">
                    <Calendar className="h-4 w-4" />
                  </div>
                  <span className="rounded-full bg-brand-primary/10 px-2 py-0.5 text-[10px] font-bold text-brand-primary">
                    Core Report
                  </span>
                </div>
                <div className="mt-3">
                  <span className="block text-sm font-bold text-ink-primary">Monthly Stock Report</span>
                  <span className="block text-xs text-ink-muted">Executive reconciliation</span>
                </div>
              </Link>

              <Link
                href="/dashboard/stock"
                className="group flex flex-col justify-between rounded-xl border border-border-subtle bg-surface-base p-3.5 transition-all hover:border-brand-primary hover:shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-elevated text-ink-primary group-hover:bg-brand-primary group-hover:text-white transition-colors">
                    <ClipboardList className="h-4 w-4" />
                  </div>
                  <ChevronRight className="h-4 w-4 text-ink-muted group-hover:translate-x-0.5 transition-transform" />
                </div>
                <div className="mt-3">
                  <span className="block text-sm font-bold text-ink-primary">Stock Levels & Counts</span>
                  <span className="block text-xs text-ink-muted">Balances & reconciliations</span>
                </div>
              </Link>

              <Link
                href="/dashboard/stock/invoices"
                className="group flex flex-col justify-between rounded-xl border border-border-subtle bg-surface-base p-3.5 transition-all hover:border-brand-primary hover:shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-elevated text-ink-primary group-hover:bg-brand-primary group-hover:text-white transition-colors">
                    <FileText className="h-4 w-4" />
                  </div>
                  <ChevronRight className="h-4 w-4 text-ink-muted group-hover:translate-x-0.5 transition-transform" />
                </div>
                <div className="mt-3">
                  <span className="block text-sm font-bold text-ink-primary">Supplier Invoices</span>
                  <span className="block text-xs text-ink-muted">GRN & matching</span>
                </div>
              </Link>

              <Link
                href="/dashboard/history"
                className="group flex flex-col justify-between rounded-xl border border-border-subtle bg-surface-base p-3.5 transition-all hover:border-brand-primary hover:shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-elevated text-ink-primary group-hover:bg-brand-primary group-hover:text-white transition-colors">
                    <History className="h-4 w-4" />
                  </div>
                  <ChevronRight className="h-4 w-4 text-ink-muted group-hover:translate-x-0.5 transition-transform" />
                </div>
                <div className="mt-3">
                  <span className="block text-sm font-bold text-ink-primary">Ledger History</span>
                  <span className="block text-xs text-ink-muted">Audit trail of transactions</span>
                </div>
              </Link>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Materials Needing Attention Section */}
      <motion.div variants={itemVariants}>
        <Card>
          <div className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle pb-4">
              <div>
                <h3 className="text-base font-bold text-ink-primary">Stock Requiring Attention</h3>
                <p className="text-xs text-ink-muted">
                  Materials at or below reorder threshold based on recent daily burn
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Filter Pills */}
                <div className="flex items-center rounded-xl border border-border-subtle bg-surface-base p-1 text-xs font-semibold">
                  <button
                    onClick={() => setUrgencyFilter("all")}
                    className={`rounded-lg px-2.5 py-1 transition-colors ${
                      urgencyFilter === "all"
                        ? "bg-brand-solid text-brand-ink"
                        : "text-ink-secondary hover:text-ink-primary"
                    }`}
                  >
                    All ({attention.length})
                  </button>
                  <button
                    onClick={() => setUrgencyFilter("critical")}
                    className={`rounded-lg px-2.5 py-1 transition-colors ${
                      urgencyFilter === "critical"
                        ? "bg-critical text-white"
                        : "text-ink-secondary hover:text-ink-primary"
                    }`}
                  >
                    Critical ({critical})
                  </button>
                  <button
                    onClick={() => setUrgencyFilter("warning")}
                    className={`rounded-lg px-2.5 py-1 transition-colors ${
                      urgencyFilter === "warning"
                        ? "bg-warning text-ink-primary font-bold"
                        : "text-ink-secondary hover:text-ink-primary"
                    }`}
                  >
                    Reorder Soon ({low})
                  </button>
                </div>

                {/* Search */}
                <div className="relative w-44 sm:w-56">
                  <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-ink-muted" />
                  <input
                    type="text"
                    placeholder="Search material..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-8.5 w-full rounded-xl border border-border-subtle bg-surface-base pl-8 pr-3 text-xs text-ink-primary placeholder:text-ink-muted focus:border-brand-primary focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {loading && !report ? (
              <div className="space-y-2 py-4">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-16 animate-pulse rounded-2xl bg-surface-sunken" />
                ))}
              </div>
            ) : filteredAttention.length === 0 ? (
              <EmptyState
                compact
                icon={<PackageCheck className="h-6 w-6 text-good" />}
                title={searchQuery ? "No matching materials" : "Everything is stocked"}
                description={
                  searchQuery
                    ? "Try a different search term or reset filter."
                    : "No materials are currently at or below reorder level."
                }
              />
            ) : (
              <div className="mt-3 divide-y divide-border-subtle">
                {filteredAttention.map((m) => {
                  const isRed = m.level === "red"
                  return (
                    <motion.div
                      key={m.key}
                      whileHover={{ x: 2 }}
                      transition={{ duration: 0.15 }}
                    >
                      <Link
                        href={`/dashboard/stock/material/${m.key}`}
                        className="group flex flex-wrap items-center justify-between gap-3 px-3 py-3.5 rounded-xl hover:bg-surface-sunken transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span
                            className={`flex h-3 w-3 shrink-0 rounded-full ${
                              isRed ? "bg-critical ring-4 ring-critical/20" : "bg-warning ring-4 ring-warning/20"
                            }`}
                          />
                          <div className="min-w-0">
                            <span className="block text-sm font-bold text-ink-primary group-hover:text-brand-primary transition-colors">
                              {m.label}
                            </span>
                            <span className="block text-xs text-ink-muted">
                              {fmt(m.remaining)} {m.unit} on hand
                              {m.breakdown ? ` · ${m.breakdown}` : ""}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 shrink-0">
                          <div className="text-right">
                            <span
                              className={`block text-sm font-bold ${
                                isRed ? "text-critical" : "text-amber-600 dark:text-amber-400"
                              }`}
                            >
                              {m.operatingDaysLeft === null ? "—" : `${fmt1(m.operatingDaysLeft)} days`}
                            </span>
                            <span className="block text-[11px] font-medium text-ink-muted">
                              operating cover left
                            </span>
                          </div>
                          <ChevronRight className="h-4 w-4 text-ink-muted group-hover:text-ink-primary transition-colors" />
                        </div>
                      </Link>
                    </motion.div>
                  )
                })}
              </div>
            )}

            {report && (
              <div className="mt-4 flex items-center justify-between border-t border-border-subtle pt-3">
                <span className="text-xs text-ink-muted">
                  Showing {filteredAttention.length} of {attention.length} attention items
                </span>
                <Link
                  href="/dashboard/stock"
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-primary hover:underline"
                >
                  View full stock ledger <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            )}
          </div>
        </Card>
      </motion.div>
    </motion.div>
  )
}
