"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import {
  FileSpreadsheet,
  History,
  Download,
  ArrowRight,
  ShieldCheck,
  Calendar,
  Layers,
} from "lucide-react"
import { Card, Eyebrow } from "@/components/primitives"

const REPORT_SECTIONS = [
  {
    title: "Monthly Stock Reconciliation",
    description: "Official end-of-month stock accounting report. Reconciles opening balances, packaging additions, branch dispatches, repackage returns, spoilage write-offs, donations, and closing physical inventory.",
    href: "/dashboard/stock/monthly-report",
    icon: FileSpreadsheet,
    badge: "Official Reconciliation",
    badgeTone: "bg-brand-subtle text-brand-subtle-ink border-brand/25",
    accent: "border-brand-subtle",
    meta: "Standardised printable matrix with branch breakdown",
  },
  {
    title: "Stock & Shift Ledger History",
    description: "Continuous audit trail of every supervisor shift submission, warehouse material receipt, and stock reconciliation count across all production departments.",
    href: "/dashboard/history",
    icon: History,
    badge: "Continuous Audit Trail",
    badgeTone: "bg-surface-sunken text-ink-secondary border-line-strong",
    accent: "border-hairline",
    meta: "Filtered by date, shift, department and material",
  },
  {
    title: "Export Production Records",
    description: "Download raw operational records and shift logs in structured tabular format for offline analysis, auditing, and corporate archiving.",
    href: "/api/records/export",
    icon: Download,
    badge: "Direct Download",
    badgeTone: "bg-surface-sunken text-ink-secondary border-line-strong",
    accent: "border-hairline",
    meta: "Live database records with full audit fields",
    download: true,
  },
]

export function ReportsClient() {
  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="pb-4 border-b border-hairline"
      >
        <Eyebrow>Lawson Limited Company</Eyebrow>
        <h1 className="text-2xl sm:text-3xl font-bold text-ink-primary leading-tight mt-0.5">
          Reports & Audits
        </h1>
        <p className="text-sm text-ink-secondary mt-1">
          Access official monthly stock reconciliation reports, continuous shift audit trails, and raw data exports.
        </p>
      </motion.header>

      {/* Report Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {REPORT_SECTIONS.map((sec, idx) => {
          const Icon = sec.icon
          const CardContent = (
            <Card className="h-full hover:border-brand transition-all duration-200 p-5 flex flex-col justify-between group shadow-sm hover:shadow-md cursor-pointer">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl bg-brand-subtle text-brand flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <Icon className="w-5 h-5" aria-hidden="true" />
                  </div>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${sec.badgeTone}`}>
                    {sec.badge}
                  </span>
                </div>
                <div>
                  <h2 className="text-base font-bold text-ink-primary group-hover:text-brand transition-colors flex items-center gap-1.5">
                    {sec.title}
                    <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" aria-hidden="true" />
                  </h2>
                  <p className="text-xs text-ink-secondary leading-relaxed mt-1.5">
                    {sec.description}
                  </p>
                </div>
              </div>

              <div className="pt-4 mt-4 border-t border-hairline flex items-center justify-between text-xs text-ink-muted">
                <span>{sec.meta}</span>
                <span className="font-semibold text-brand text-xs flex items-center gap-1 group-hover:underline">
                  {sec.download ? "Download CSV" : "Open Report"} →
                </span>
              </div>
            </Card>
          )

          return (
            <motion.div
              key={sec.title}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: idx * 0.1 }}
              whileHover={{ y: -3, scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              className="h-full"
            >
              {sec.download ? (
                <a href={sec.href} download className="block h-full">
                  {CardContent}
                </a>
              ) : (
                <Link href={sec.href} className="block h-full">
                  {CardContent}
                </Link>
              )}
            </motion.div>
          )
        })}
      </div>

      {/* Governance & Integrity Note */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.3 }}
        className="rounded-2xl border border-hairline bg-surface-card p-4 flex items-start gap-3"
      >
        <ShieldCheck className="w-5 h-5 text-brand shrink-0 mt-0.5" aria-hidden="true" />
        <div className="text-xs text-ink-secondary leading-relaxed">
          <p className="font-bold text-ink-primary mb-0.5">Audit Governance & Read Integrity</p>
          Reports derive figures directly from the verified shift ledger and monthly packaging summaries. Figures are verified against recorded material movements and physical count reconciliations.
        </div>
      </motion.div>
    </div>
  )
}
