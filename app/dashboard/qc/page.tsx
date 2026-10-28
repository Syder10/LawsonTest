import { redirect } from "next/navigation"
import { requireQcAccess } from "@/lib/auth/guards"
import { QcDashboardClient } from "@/components/features/qc/qc-dashboard-client"

export default async function QcPage() {
  const auth = await requireQcAccess()
  if (!auth.ok) redirect("/dashboard")

  const isManager = auth.ctx.profile.role === "qc_manager" || auth.ctx.profile.role === "admin"
  return <QcDashboardClient isManager={isManager} />
}
