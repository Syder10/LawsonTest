"use client"

import Link from "next/link"
import { ChevronRight } from "lucide-react"

// Shared quick-action button (was duplicated in Supervisor & Procurement dashboards).
export function ActionBtn({
  href,
  icon: Icon,
  label,
  primary,
  external,
}: {
  href: string
  icon: React.ElementType
  label: string
  primary?: boolean
  external?: boolean
}) {
  const cls = `group flex items-center gap-3 rounded-2xl px-4 py-3.5 transition-all duration-150 active:scale-[0.97]
    ${primary
      ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/25"
      : "bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/80 shadow-sm"
    }`
  const inner = (
    <>
      <span className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-colors ${primary ? "bg-white/10 group-hover:bg-white/20" : "bg-slate-100 group-hover:bg-slate-200"}`}>
        <Icon className={`w-4 h-4 ${primary ? "text-white" : "text-slate-500"}`} />
      </span>
      <p className="text-sm font-bold">{label}</p>
      <ChevronRight className={`w-4 h-4 ml-auto shrink-0 opacity-0 group-hover:opacity-40 transition-opacity ${primary ? "text-white" : "text-slate-400"}`} />
    </>
  )
  return external ? <a href={href} className={cls}>{inner}</a> : <Link href={href} className={cls}>{inner}</Link>
}
