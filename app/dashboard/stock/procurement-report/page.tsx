import { redirect } from "next/navigation"
import { requireRole } from "@/lib/auth/guards"
import { ProcurementReportClient } from "@/components/features/reports/procurement/procurement-report-client"

export const dynamic = "force-dynamic"

// The printable Procurement Stock Analysis Report — for the PROCUREMENT DEPARTMENT ONLY
// (business decision, 2026-11-19). It writes nothing; the stock figures it reads stay
// available to the stock office and manager on their own screens.
export default async function ProcurementReportPage() {
  const auth = await requireRole(["procurement"])
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login")
    redirect("/dashboard")
  }

  // "Prepared by" on the printed report is the account printing it.
  return <ProcurementReportClient preparedBy={auth.ctx.profile.full_name} />
}
