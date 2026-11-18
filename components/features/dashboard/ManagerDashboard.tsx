"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import Link from "next/link"
import { motion, useReducedMotion } from "framer-motion"
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Boxes,
  CheckCircle2,
  Factory,
  FileSpreadsheet,
  Home,
  Layers,
  Loader2,
  Package,
  RefreshCw,
  TrendingUp,
  Warehouse,
} from "lucide-react"
import { StatusBadge, compact } from "@/components/primitives"
import { GlassPanel, GlassWorkspace, type GlassTab } from "@/components/ui/glass-dashboard"
import { GroupBreakdown, ProductionTrend } from "./manager/charts"
import { DayDetailDrawer } from "./manager/day-detail-drawer"
import { MaterialsTable } from "./manager/materials-table"
import { fmt, fmt1 } from "./manager/viz"
import type { MaterialStatus } from "./manager/types"
import type { OverviewReport } from "@/lib/domain/analytics-contract"
import { burnLooksImplausible } from "@/lib/domain/stock-status"

// ============================================================================
// Manager landing — the glass redesign.
//
// What changed is the chrome: the content now sits inside the GlassWorkspace
// shell (components/ui/glass-dashboard) with its rail/dock navigation and the
// adjustable material. What did NOT change is anything the business reads:
//
//   • the same request (`/api/analytics/report`, last 7 days) with the same
//     request-sequence guard and the same loading / failed states;
//   • the same four figures (produced, critical count, Bitters and Ginger on
//     hand) from the same fields, and the same `/day avg` arithmetic;
//   • the same "Needs attention" rule — red, yellow, or an implausible burn —
//     and the same top-five cut, with StatusBadge carrying the level;
//   • the same ProductionTrend → DayDetailDrawer drill-down;
//   • the same three hub links.
//
// The dock's two extra views show more of the SAME report through components
// the manager already has on /dashboard/production (MaterialsTable,
// GroupBreakdown) — nothing is computed here that is not computed there.
// ============================================================================

const daysAgo = (n: number) => {
  const d = new Date(Date.now() - n * 86_400_000)
  return d.toISOString().slice(0, 10)
}

const TABS = [
  { id: "overview", label: "Overview", icon: Home },
  { id: "materials", label: "Materials", icon: Layers },
  { id: "output", label: "Output", icon: TrendingUp },
] as const satisfies readonly GlassTab[]
type View = (typeof TABS)[number]["id"]

const TITLES: Record<View, string> = {
  overview: "Operations Overview",
  materials: "Materials & days left",
  output: "Production output",
}

const HUBS = [
  {
    href: "/dashboard/production",
    Icon: Factory,
    title: "Production Analysis",
    body: "Department tabs, shift breakdown, recipe BOM, and materials.",
  },
  {
    href: "/dashboard/stock",
    Icon: Boxes,
    title: "Stock Office",
    body: "Warehouse inventory, material receipts, dispatches & counts.",
  },
  {
    href: "/dashboard/reports",
    Icon: FileSpreadsheet,
    title: "Reports & Audits",
    body: "Monthly reconciliation matrix, shift audit trail & raw export.",
  },
] as const

const daysLeftText = (m: MaterialStatus) =>
  `${fmt(m.remaining)} ${m.unit} on hand · ${m.operatingDaysLeft !== null ? `${fmt1(m.operatingDaysLeft)}d left` : "no usage"}`

export function ManagerDashboard({ userName = null }: { userName?: string | null }) {
  const [report, setReport] = useState<OverviewReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [view, setView] = useState<View>("overview")
  const requestRef = useRef(0)
  const reduceMotion = useReducedMotion()

  const load = useCallback(async () => {
    const seq = ++requestRef.current
    setLoading(true)
    try {
      const today = new Date().toISOString().slice(0, 10)
      const from = daysAgo(6)
      const res = await fetch(`/api/analytics/report?from=${from}&to=${today}`)
      const data = res.ok ? await res.json() : null
      if (seq === requestRef.current) {
        if (data && data.scope === "overview") {
          setReport(data as OverviewReport)
        } else {
          setReport(null)
        }
      }
    } catch {
      if (seq === requestRef.current) setReport(null)
    } finally {
      if (seq === requestRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const criticalMaterials = report?.materials.filter((m) => m.level === "red") ?? []
  const attentionMaterials =
    report?.materials.filter((m) => m.level === "red" || m.level === "yellow" || burnLooksImplausible(m)) ?? []

  const containerVariants = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.06 } },
  }
  const itemVariants = reduceMotion
    ? { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.2 } } }
    : {
        hidden: { opacity: 0.45, y: 12, filter: "blur(3px)" },
        show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.45, ease: [0.23, 1, 0.32, 1] as const } },
      }

  const criticalCount = criticalMaterials.length
  const statusText =
    criticalCount > 0 ? `${criticalCount} material${criticalCount > 1 ? "s" : ""} critical` : "All materials healthy"

  const alertsContent = (
    <>
      <p>
        {criticalCount > 0
          ? "Operating stock has fallen to a critical number of days. Replenish before it runs out."
          : attentionMaterials.length > 0
            ? `No material is critical. ${attentionMaterials.length} ${attentionMaterials.length === 1 ? "is" : "are"} flagged under Needs attention.`
            : "No materials are low, and burn rates are within expected parameters."}
      </p>
      {criticalCount > 0 && (
        <div className="gw-list">
          {criticalMaterials.map((m) => (
            <div className="gw-row" key={m.key}>
              <span className="gw-row-icon is-critical">
                <AlertTriangle size={17} strokeWidth={1.8} aria-hidden="true" />
              </span>
              <div className="gw-row-body">
                <strong>{m.label}</strong>
                <span>{daysLeftText(m)}</span>
              </div>
              <div className="gw-row-end">
                <StatusBadge level={m.level} />
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )

  const refreshButton = (
    <button type="button" className="gw-button" onClick={load} disabled={loading}>
      {loading ? (
        <Loader2 className="gw-spin" size={15} aria-hidden="true" />
      ) : (
        <RefreshCw size={15} aria-hidden="true" />
      )}
      Refresh
    </button>
  )

  return (
    <>
      <GlassWorkspace
        brand="Lawson"
        brandNote="Manager workspace"
        userName={userName}
        tabs={TABS}
        view={view}
        onViewChange={setView}
        storageKey="lawson:manager:glass"
        greeting={
          view === "overview" && userName
            ? `Welcome back, ${userName}.`
            : "Lawson Limited Company · 7-day plant throughput, warehouse balances and inventory attention items."
        }
        title={TITLES[view]}
        headingAction={
          <>
            <span className="gw-date">Last 7 days</span>
            {refreshButton}
          </>
        }
        alerts={report ? { count: criticalCount, content: alertsContent } : undefined}
        footerNote={
          report ? (
            <>
              <span>
                Updated {new Date(report.last_updated).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
              <span aria-hidden="true">·</span>
              <span>Last 7 days</span>
              <span aria-hidden="true">·</span>
              <span className={criticalCount > 0 ? "text-critical-ink font-bold" : "text-good-ink font-semibold"}>{statusText}</span>
            </>
          ) : undefined
        }
      >
        {/* Hold the previous render at reduced opacity while refetching. */}
        <div className={loading && report ? "opacity-60 transition-opacity" : "transition-opacity"}>
          {report && (
            <motion.div key={view} variants={containerVariants} initial="hidden" animate="show">
              {/* ── OVERVIEW ─────────────────────────────────────────────── */}
              {view === "overview" && (
                <>
                  <div className="gw-overview-grid">
                    <motion.div variants={itemVariants} className="gw-reveal">
                      <GlassPanel className="gw-hero" label="Produced (last 7 days)" icon={<Package size={17} aria-hidden="true" />}>
                        <strong className="gw-hero-value">
                          {fmt(report.totals.production_cartons)}
                          <small>ctn</small>
                        </strong>
                        <p className="gw-hero-meta">
                          <span className="gw-pill">{fmt1(report.totals.production_cartons / 7)}/day</span>
                          average over the window
                        </p>
                        <Link href="/dashboard/production" className="gw-hero-link">
                          <span className="gw-hero-link-icon">
                            <Factory size={19} strokeWidth={1.8} aria-hidden="true" />
                          </span>
                          <div>
                            <strong>Production Analysis</strong>
                            <span>Department tabs, shift breakdown, recipe BOM, and materials.</span>
                          </div>
                          <span className="gw-hero-link-arrow" aria-hidden="true">
                            <ArrowUpRight size={20} />
                          </span>
                        </Link>
                      </GlassPanel>
                    </motion.div>

                    <motion.div variants={itemVariants} className="gw-reveal gw-embed">
                      <ProductionTrend data={report.byDay} onSelectDay={setSelectedDay} label="Daily Output (7 Days)" />
                    </motion.div>
                  </div>

                  <div className="gw-stat-grid">
                    <motion.div variants={itemVariants} className="gw-reveal">
                      <GlassPanel
                        label="Critical materials"
                        icon={<AlertTriangle size={17} aria-hidden="true" />}
                        accent={criticalCount > 0 ? "critical" : "brand"}
                      >
                        <strong className="gw-stat-value">
                          {compact(criticalCount)}
                          <small>{criticalCount === 1 ? "item" : "items"}</small>
                        </strong>
                        <span className="gw-stat-sub">
                          {criticalCount > 0 ? "urgent replenishment needed" : "all materials healthy"}
                        </span>
                      </GlassPanel>
                    </motion.div>
                    <motion.div variants={itemVariants} className="gw-reveal">
                      <GlassPanel label="Bitters on hand" icon={<Warehouse size={17} aria-hidden="true" />} accent="bitters">
                        <strong className="gw-stat-value">
                          {compact(report.finishedGoods.bitters)}
                          <small>ctn</small>
                        </strong>
                        <span className="gw-stat-sub">warehouse stock balance</span>
                      </GlassPanel>
                    </motion.div>
                    <motion.div variants={itemVariants} className="gw-reveal">
                      <GlassPanel label="Ginger on hand" icon={<Warehouse size={17} aria-hidden="true" />} accent="ginger">
                        <strong className="gw-stat-value">
                          {compact(report.finishedGoods.ginger)}
                          <small>ctn</small>
                        </strong>
                        <span className="gw-stat-sub">warehouse stock balance</span>
                      </GlassPanel>
                    </motion.div>
                  </div>

                  <div className="gw-lower-grid">
                    <motion.div variants={itemVariants} className="gw-reveal">
                      <GlassPanel
                        title="Needs attention"
                        actions={
                          <span>
                            {attentionMaterials.length > 0
                              ? `${attentionMaterials.length} material${attentionMaterials.length > 1 ? "s" : ""} flagged`
                              : "Stock health"}
                          </span>
                        }
                      >
                        {attentionMaterials.length === 0 ? (
                          <div className="gw-empty">
                            <span className="gw-empty-orb">
                              <CheckCircle2 size={20} aria-hidden="true" />
                            </span>
                            <h3>All materials healthy</h3>
                            <p>Operating stock is above the critical threshold and burn rates are within expected parameters.</p>
                          </div>
                        ) : (
                          <div className="gw-list">
                            {attentionMaterials.slice(0, 5).map((m) => (
                              <div className="gw-row" key={m.key}>
                                <span
                                  className={`gw-row-icon ${
                                    m.level === "red" ? "is-critical" : m.level === "yellow" ? "is-warning" : ""
                                  }`}
                                >
                                  <AlertTriangle size={17} strokeWidth={1.8} aria-hidden="true" />
                                </span>
                                <div className="gw-row-body">
                                  <strong>{m.label}</strong>
                                  <span>{daysLeftText(m)}</span>
                                </div>
                                <div className="gw-row-end">
                                  <StatusBadge level={m.level} />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        <button type="button" className="gw-text-button" onClick={() => setView("materials")}>
                          View complete material status
                          <ArrowRight size={14} aria-hidden="true" />
                        </button>
                      </GlassPanel>
                    </motion.div>

                    <motion.div variants={itemVariants} className="gw-reveal">
                      <GlassPanel title="Go to" actions={<span>{HUBS.length} areas</span>}>
                        <div className="gw-list">
                          {HUBS.map(({ href, Icon, title, body }) => (
                            <Link key={href} href={href} className="gw-row">
                              <span className="gw-row-icon is-brand">
                                <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
                              </span>
                              <div className="gw-row-body">
                                <strong>{title}</strong>
                                <span>{body}</span>
                              </div>
                              <div className="gw-row-end">
                                <ArrowRight size={16} aria-hidden="true" />
                              </div>
                            </Link>
                          ))}
                        </div>
                      </GlassPanel>
                    </motion.div>
                  </div>
                </>
              )}

              {/* ── MATERIALS ────────────────────────────────────────────── */}
              {view === "materials" &&
                (report.materials.length > 0 ? (
                  <motion.div variants={itemVariants} className="gw-reveal gw-embed-deep">
                    <MaterialsTable
                      materials={report.materials}
                      redDays={report.thresholds.redDays}
                      amberDays={report.thresholds.amberDays}
                      onReconciled={load}
                    />
                  </motion.div>
                ) : (
                  <motion.div variants={itemVariants} className="gw-reveal">
                    <GlassPanel>
                      <div className="gw-empty">
                        <span className="gw-empty-orb">
                          <Layers size={20} aria-hidden="true" />
                        </span>
                        <h3>No materials in the ledger yet</h3>
                        <p>Material balances appear once receipts and shift usage have been recorded.</p>
                      </div>
                    </GlassPanel>
                  </motion.div>
                ))}

              {/* ── OUTPUT ───────────────────────────────────────────────── */}
              {view === "output" && (
                <div className="gw-output-grid">
                  <motion.div variants={itemVariants} className="gw-reveal gw-embed">
                    <ProductionTrend data={report.byDay} onSelectDay={setSelectedDay} label="Cartons produced" />
                  </motion.div>
                  <motion.div variants={itemVariants} className="gw-reveal gw-embed">
                    <GroupBreakdown data={report.byGroup} shiftData={report.byShift} />
                  </motion.div>
                </div>
              )}
            </motion.div>
          )}
        </div>

        {loading && !report && (
          <div className="gw-empty gw-empty-tall" aria-busy="true">
            <Loader2 className="gw-spin" size={28} aria-hidden="true" />
            <span className="sr-only">Loading overview</span>
          </div>
        )}

        {!loading && !report && (
          <GlassPanel>
            <div className="gw-empty">
              <h3>Couldn’t load the overview</h3>
              <p>The request failed. Check your connection and try again.</p>
              <button type="button" className="gw-button" onClick={load}>
                Retry
              </button>
            </div>
          </GlassPanel>
        )}
      </GlassWorkspace>

      <DayDetailDrawer date={selectedDay} shift="" department="" onClose={() => setSelectedDay(null)} />
    </>
  )
}
