import { redirect } from "next/navigation"
import { requireStockRead } from "@/lib/auth/guards"
import { canWriteStock } from "@/lib/domain/roles"
import { ReturnsClient } from "./returns-client"

// Read for the stock-reading set (stock, procurement, manager);
// the "New return" action is gated by canWrite so only Stock Officer can submit.
export default async function ProductReturnsPage() {
  const auth = await requireStockRead()
  if (!auth.ok) redirect("/dashboard")
  return <ReturnsClient canWrite={canWriteStock(auth.ctx.profile.role)} />
}
