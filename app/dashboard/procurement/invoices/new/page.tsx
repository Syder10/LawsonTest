import { redirect } from "next/navigation"
import { requireStockWrite } from "@/lib/auth/guards"
import { InvoiceForm } from "./invoice-form"

// Write-only route. Procurement reads invoices but files none, so a stock-read role
// that arrives by URL is bounced to the log; the RPC enforces the same rule again.
export default async function NewInvoicePage() {
  const auth = await requireStockWrite()
  if (!auth.ok) redirect("/dashboard/procurement/invoices")
  return <InvoiceForm />
}
