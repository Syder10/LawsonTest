import { redirect } from "next/navigation"
import { requireQcAccess } from "@/lib/auth/guards"
import { QcHistoryClient } from "@/components/features/qc/qc-history-client"

export default async function QcHistoryPage() {
  const auth = await requireQcAccess()
  if (!auth.ok) redirect("/dashboard")

  const isManager = auth.ctx.profile.role === "qc_manager" || auth.ctx.profile.role === "admin"
  return <QcHistoryClient isManager={isManager} />
}
