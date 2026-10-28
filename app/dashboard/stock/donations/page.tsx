import { redirect } from "next/navigation"
import { requireStockRead } from "@/lib/auth/guards"
import { canWriteStock } from "@/lib/domain/roles"
import { DonationsClient } from "./donations-client"

export default async function DonationsPage() {
  const auth = await requireStockRead()
  if (!auth.ok) redirect("/dashboard")
  return <DonationsClient canWrite={canWriteStock(auth.ctx.profile.role)} />
}
