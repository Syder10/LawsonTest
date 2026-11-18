import { redirect } from "next/navigation"
import { requireStockRead } from "@/lib/auth/guards"
import { ProcurementReportClient } from "@/components/features/reports/procurement/procurement-report-client"

export const dynamic = "force-dynamic"

// The printable Procurement Stock Analysis Report. Readable by every role that can
// read stock (stock, procurement, manager) — it writes nothing.
export default async function ProcurementReportPage() {
  const auth = await requireStockRead()
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login")
    redirect("/dashboard")
  }

  // "Prepared by" on the printed report is the account printing it.
  return <ProcurementReportClient preparedBy={auth.ctx.profile.full_name} />
}
