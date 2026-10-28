import { type NextRequest, NextResponse } from "next/server"
import { requireStockRead } from "@/lib/auth/guards"
import { PRODUCTS } from "@/lib/domain/record-types"
import type { DispatchLineRow, Product } from "@/lib/db/types"
import {
  calculateMonthlyStockBalance,
  buildWeeklyProductionTable,
  buildBranchDistributionMatrix,
  getMonthName,
  getMonthRange,
  type MonthlyReturnEvent,
  type MonthlyStockReport,
} from "@/lib/domain/monthly-stock-report"

export async function GET(request: NextRequest) {
  const auth = await requireStockRead()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { supabase } = auth.ctx

  const url = new URL(request.url)
  const now = new Date()
  const year = parseInt(url.searchParams.get("year") || String(now.getUTCFullYear()), 10)
  const month = parseInt(url.searchParams.get("month") || String(now.getUTCMonth() + 1), 10)
  const rawProduct = url.searchParams.get("product") || "Bitters"
  const product: Product = (PRODUCTS as readonly string[]).includes(rawProduct)
    ? (rawProduct as Product)
    : "Bitters"

  const { startDate, endDate } = getMonthRange(year, month)

  // 1. Fetch opening stock: prior history before startDate
  // Opening stock = Produced(before) - Loaded(before) + RepackReturns(before) - Donations(before)
  const [
    priorProdRes,
    priorReturnsRes,
    priorDonationsRes,
    monthProdRes,
    monthReturnsRes,
    monthDispatchesRes,
    monthDonationsRes,
  ] = await Promise.all([
    supabase
      .from("packaging_daily_records")
      .select("quantity_cartons_produced, quantity_cartons_loaded")
      .eq("product", product)
      .lt("date", startDate),
    supabase
      .from("product_returns")
      .select("repack_cartons, cartons")
      .eq("product", product)
      .lt("date", startDate),
    supabase
      .from("donations")
      .select("cartons")
      .eq("product", product)
      .lt("date", startDate),
    // Month's production
    supabase
      .from("packaging_daily_records")
      .select("date, quantity_cartons_produced, group_number, is_part_time")
      .eq("product", product)
      .gte("date", startDate)
      .lte("date", endDate)
      .order("date", { ascending: true }),
    // Month's returns
    supabase
      .from("product_returns")
      .select("id, date, shift, cartons, repack_cartons, spoilage_cartons, returned_from, driver_name, vehicle_reg, remarks")
      .eq("product", product)
      .gte("date", startDate)
      .lte("date", endDate)
      .order("date", { ascending: true }),
    // Month's dispatches — header only; lines fetched separately below
    supabase
      .from("dispatches")
      .select("id, date, destination")
      .gte("date", startDate)
      .lte("date", endDate),
    // Month's donations
    supabase
      .from("donations")
      .select("id, date, cartons, recipient, remarks")
      .eq("product", product)
      .gte("date", startDate)
      .lte("date", endDate),
  ])

  // Derive Opening Stock
  let priorProduced = 0
  let priorLoaded = 0
  for (const r of (priorProdRes.data ?? [])) {
    priorProduced += Number(r.quantity_cartons_produced) || 0
    priorLoaded += Number(r.quantity_cartons_loaded) || 0
  }
  let priorRepack = 0
  for (const r of (priorReturnsRes.data ?? [])) {
    priorRepack += Number(r.repack_cartons ?? r.cartons) || 0
  }
  let priorDonations = 0
  for (const r of (priorDonationsRes.data ?? [])) {
    priorDonations += Number(r.cartons) || 0
  }

  // If manual baseline / query override provided, use it
  const manualOpening = url.searchParams.get("openingStock")
  const openingStock = manualOpening !== null && !isNaN(Number(manualOpening))
    ? Number(manualOpening)
    : Math.max(0, priorProduced - priorLoaded + priorRepack - priorDonations)

  // Current Month Production
  const prodRecords = (monthProdRes.data ?? []).map((r) => ({
    date: r.date,
    quantity_cartons_produced: Number(r.quantity_cartons_produced) || 0,
    group_number: r.group_number,
    is_part_time: (r as { is_part_time?: boolean }).is_part_time,
  }))
  const totalProduced = prodRecords.reduce((sum, r) => sum + r.quantity_cartons_produced, 0)
  const weeklyProduction = buildWeeklyProductionTable(prodRecords)

  // Current Month Returns
  const returnsLog: MonthlyReturnEvent[] = (monthReturnsRes.data ?? []).map((r) => {
    const total = Number(r.cartons) || 0
    const repack = r.repack_cartons != null ? Number(r.repack_cartons) : total
    const spoilage = r.spoilage_cartons != null ? Number(r.spoilage_cartons) : 0
    const day = parseInt(r.date.slice(8, 10), 10)
    const suffix = day === 1 || day === 21 || day === 31 ? "st" : day === 2 || day === 22 ? "nd" : day === 3 || day === 23 ? "rd" : "th"

    return {
      id: r.id,
      date: r.date,
      formattedDate: `${day}${suffix}`,
      driverName: r.driver_name?.trim() || "Unspecified",
      sourceBranch: r.returned_from?.trim() || "Head Office",
      vehicleReg: r.vehicle_reg ?? null,
      repackCartons: repack,
      spoilageCartons: spoilage,
      totalCartons: total,
      remarks: r.remarks ?? null,
    }
  })

  const repackReturns = returnsLog.reduce((s, r) => s + r.repackCartons, 0)
  const spoilageReturns = returnsLog.reduce((s, r) => s + r.spoilageCartons, 0)

  // Current Month Dispatches — two queries like the main dispatch route.
  // The typed client cannot resolve the dispatch→dispatch_lines FK in a nested select.
  const dispatchHeaders = monthDispatchesRes.data ?? []
  const dispatchIds = dispatchHeaders.map((d) => d.id)

  const linesById = new Map<string, { product: Product; cartons: number }[]>()
  if (dispatchIds.length > 0) {
    const { data: lineRows } = await supabase
      .from("dispatch_lines")
      .select("dispatch_id, product, cartons")
      .in("dispatch_id", dispatchIds)
    for (const l of (lineRows ?? []) as Pick<DispatchLineRow, "dispatch_id" | "product" | "cartons">[]) {
      const list = linesById.get(l.dispatch_id) ?? []
      list.push({ product: l.product, cartons: Number(l.cartons) })
      linesById.set(l.dispatch_id, list)
    }
  }

  const dispatchRows: { destination: string; cartons: number }[] = []
  for (const d of dispatchHeaders) {
    const lines = linesById.get(d.id) ?? []
    for (const line of lines) {
      if (line.product === product) {
        dispatchRows.push({
          destination: d.destination,
          cartons: line.cartons,
        })
      }
    }
  }
  const totalSales = dispatchRows.reduce((sum, d) => sum + d.cartons, 0)

  // Current Month Donations
  const monthDonations = (monthDonationsRes.data ?? []).reduce(
    (sum, d) => sum + (Number(d.cartons) || 0),
    0,
  )

  // Calculations
  const balance = calculateMonthlyStockBalance({
    openingStock,
    totalProduced,
    totalSales,
    repackReturns,
    spoilageReturns,
    donations: monthDonations,
  })

  // Branch Matrix
  const branchMatrix = buildBranchDistributionMatrix({
    dispatches: dispatchRows,
    returns: returnsLog,
    donations: monthDonations,
  })

  const report: MonthlyStockReport = {
    period: {
      year,
      month,
      monthName: getMonthName(month),
      startDate,
      endDate,
    },
    product,
    openingStock,
    totalProduced,
    goodsAvailable: balance.goodsAvailable,
    totalSales,
    repackReturns,
    spoilageReturns,
    totalReturns: balance.totalReturns,
    actualSales: balance.actualSales,
    donations: monthDonations,
    totalDistribution: balance.totalDistribution,
    closingStock: balance.closingStock,
    weeklyProduction,
    returnsLog,
    branchMatrix,
  }

  return NextResponse.json(report)
}
