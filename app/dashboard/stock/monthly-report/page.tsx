import { redirect } from "next/navigation"
import { requireStockRead } from "@/lib/auth/guards"
import { MonthlyReportClient } from "./monthly-report-client"

export default async function StockMonthlyReportPage() {
  const auth = await requireStockRead()
  if (!auth.ok) redirect("/dashboard")
  return <MonthlyReportClient />
}
