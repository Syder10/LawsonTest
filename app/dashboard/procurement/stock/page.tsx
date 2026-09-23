import { redirect } from "next/navigation"
import { requireStockRead } from "@/lib/auth/guards"
import { canWriteStock } from "@/lib/domain/roles"
import { StockClient } from "./stock-client"

// The dashboard is read for the whole stock-reading set (stock, procurement,
// manager, admin). Write affordances inside are gated on canWrite, so procurement
// reads the figures and the RPCs reject anything it might still try to send.
export default async function ProcurementStockPage() {
  const auth = await requireStockRead()
  if (!auth.ok) redirect("/dashboard")
  return <StockClient canWrite={canWriteStock(auth.ctx.profile.role)} />
}
