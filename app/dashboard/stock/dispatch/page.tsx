import { redirect } from "next/navigation"
import { requireStockRead } from "@/lib/auth/guards"
import { canWriteStock } from "@/lib/domain/roles"
import { DispatchClient } from "./dispatch-client"

// Read for the whole stock-reading set (stock, procurement, manager, admin); the
// New dispatch affordance is gated by canWrite so procurement sees the log only.
export default async function DispatchPage() {
  const auth = await requireStockRead()
  if (!auth.ok) redirect("/dashboard")
  return <DispatchClient canWrite={canWriteStock(auth.ctx.profile.role)} />
}
