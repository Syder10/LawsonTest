import { redirect } from "next/navigation"
import { requireQcAccess } from "@/lib/auth/guards"
import { QcStandardsClient } from "@/components/features/qc/qc-standards-client"

export default async function QcStandardsPage() {
  const auth = await requireQcAccess()
  if (!auth.ok) redirect("/dashboard")

  const isManager = auth.ctx.profile.role === "qc_manager" || auth.ctx.profile.role === "admin"
  return <QcStandardsClient isManager={isManager} />
}
