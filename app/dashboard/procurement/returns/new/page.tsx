import { redirect } from "next/navigation"
import { requireStockWrite } from "@/lib/auth/guards"
import { ReturnForm } from "./return-form"

// Write-only route. Only Stock Officer can record a product return;
// others are redirected to the returns log.
export default async function NewReturnPage() {
  const auth = await requireStockWrite()
  if (!auth.ok) redirect("/dashboard/procurement/returns")
  return <ReturnForm />
}
