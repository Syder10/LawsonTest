import { redirect } from "next/navigation"
import { requireManager } from "@/lib/auth/guards"
import { DepartmentMatrixClient } from "@/components/features/reports/matrix/department-matrix-client"

export const dynamic = "force-dynamic"

// Printable monthly production matrices, one per department. Same access as the
// Reports hub it is listed on.
export default async function DepartmentMatrixPage() {
  const auth = await requireManager()
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login")
    redirect("/dashboard")
  }

  // "Prepared by" on each printed sheet is the account printing it.
  return <DepartmentMatrixClient preparedBy={auth.ctx.profile.full_name} />
}
