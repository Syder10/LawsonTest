import { notFound, redirect } from "next/navigation"
import { requireStockRead } from "@/lib/auth/guards"
import { canWriteStock } from "@/lib/domain/roles"
import { materialDescriptorForKey, herbDescriptor, parseHerbKey } from "@/lib/domain/stock-materials"
import { assembleMaterialDetail } from "@/lib/domain/material-detail"
import { ALL_TIME, ALL_TIME_FROM, isAllTime } from "@/lib/domain/date-window"
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
  let descriptor = materialDescriptorForKey(key)
  // A herb key ("herb:Lemon Grass") has no static descriptor; build one on demand,
  // but only after confirming the variant is a real herb_types row so an arbitrary
  // path segment cannot conjure an empty detail page.
  const herbVariant = descriptor ? null : parseHerbKey(key)
  if (herbVariant) {
    const { data: herb } = await auth.ctx.supabase
      .from("herb_types")
      .select("name")
      .eq("name", herbVariant)
      .maybeSingle()
    if (herb) descriptor = herbDescriptor(herbVariant)
  }
  if (!descriptor) notFound()

  const isHerb = descriptor.variant !== null
  const { from: fromParam, to: toParam } = await searchParams
  const today = todayIso()
  const to = toParam || today
  // Herbs default to all time (their filings are sparse across variants); other
  // materials keep the 30-day default. The all-time selection travels as an empty
  // `from`, so map it to the floor date for the query while handing the client the
  // sentinel, so the page never displays a sentinel date (it shows "All time").
  const fromSelection = fromParam === undefined ? (isHerb ? ALL_TIME : daysAgo(29)) : fromParam
  const queryFrom = isAllTime(fromSelection) ? ALL_TIME_FROM : fromSelection

  const detail = await assembleMaterialDetail(auth.ctx.supabase, descriptor, queryFrom, to, today)

  return (
    <MaterialDetailClient
      descriptor={descriptor}
      detail={detail}
      from={fromSelection}
      to={to}
      canWrite={canWriteStock(auth.ctx.profile.role)}
      backHref={isHerb ? "/dashboard/procurement/stock/herbs" : "/dashboard/procurement/stock"}
      backLabel={isHerb ? "Herbs" : "Stock levels"}
    />
  )
}
