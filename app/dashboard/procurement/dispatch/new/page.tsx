import { redirect } from "next/navigation"
import { requireStockWrite } from "@/lib/auth/guards"
import { DispatchForm } from "./dispatch-form"

// Write-only route. The read-only procurement office has no path here and is
// bounced to the log if it arrives by URL; the RPC enforces the same rule again.
export default async function NewDispatchPage() {
  const auth = await requireStockWrite()
  if (!auth.ok) redirect("/dashboard/procurement/dispatch")
  return <DispatchForm />
}
