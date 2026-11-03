import { redirect } from "next/navigation"
import { requireManager } from "@/lib/auth/guards"
import { ProductionClient } from "./production-client"

export const dynamic = "force-dynamic"

export default async function ProductionPage() {
  const auth = await requireManager()
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login")
    redirect("/dashboard")
  }

  return <ProductionClient />
}
