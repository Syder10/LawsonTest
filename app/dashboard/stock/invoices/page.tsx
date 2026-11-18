import { redirect } from "next/navigation"
import { requireStockRead } from "@/lib/auth/guards"
import { canWriteStock } from "@/lib/domain/roles"
import { InvoicesClient } from "./invoices-client"

// Read for the whole stock-reading set; the New invoice affordance is gated by
// canWrite so procurement sees the log without a path to record one.
export default async function InvoicesPage() {
  const auth = await requireStockRead()
  if (!auth.ok) redirect("/dashboard")
  return <InvoicesClient canWrite={canWriteStock(auth.ctx.profile.role)} />
}
