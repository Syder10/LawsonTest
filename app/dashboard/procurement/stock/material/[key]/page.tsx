import { notFound, redirect } from "next/navigation"
import { requireStockRead } from "@/lib/auth/guards"
import { canWriteStock } from "@/lib/domain/roles"
import { materialDescriptorForKey } from "@/lib/domain/stock-materials"
import { assembleMaterialDetail } from "@/lib/domain/material-detail"
import { MaterialDetailClient } from "./material-detail-client"

// One material's full dated history, reached from the Stock dashboard row and the
// stock History index. Read for the whole stock-reading set; the Count write is
// gated on canWrite inside the client (and the RPC enforces it again).
export const dynamic = "force-dynamic"

const iso = (d: Date) => d.toISOString().slice(0, 10)
const todayIso = () => iso(new Date())
const daysAgo = (n: number) => iso(new Date(Date.now() - n * 86_400_000))

export default async function MaterialDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const auth = await requireStockRead()
  if (!auth.ok) redirect("/dashboard")

  const { key } = await params
  const descriptor = materialDescriptorForKey(key)
  if (!descriptor) notFound()

  const { from: fromParam, to: toParam } = await searchParams
  const today = todayIso()
  const from = fromParam || daysAgo(29)
  const to = toParam || today

  const detail = await assembleMaterialDetail(auth.ctx.supabase, descriptor, from, to, today)

  return (
    <MaterialDetailClient
      descriptor={descriptor}
      detail={detail}
      from={from}
      to={to}
      canWrite={canWriteStock(auth.ctx.profile.role)}
    />
  )
}
