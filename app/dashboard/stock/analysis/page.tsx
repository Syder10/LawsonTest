import { Suspense } from "react"
import { redirect } from "next/navigation"
import { Loader2 } from "lucide-react"
import { requireStockRead } from "@/lib/auth/guards"
import { StockAnalysisClient } from "./stock-analysis-client"

export const dynamic = "force-dynamic"

export default async function StockAnalysisPage() {
  const auth = await requireStockRead()
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login")
    redirect("/dashboard")
  }

  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20 text-ink-muted">
          <Loader2 className="w-7 h-7 animate-spin" aria-hidden="true" />
          <span className="sr-only">Loading stock & production analysis</span>
        </div>
      }
    >
      <StockAnalysisClient />
    </Suspense>
  )
}
