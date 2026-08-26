// Frontend view of the analytics contract.
//
// Everything here is RE-EXPORTED from neutral domain modules — nothing is declared
// locally. Declaring a response shape independently on both sides is what caused
// the stock-alerting outage: this file said `operatingDaysLeft` while the route
// emitted `daysLeft`, so the "Days left" column rendered NaN for every material and
// the urgency sort silently did nothing. Do not re-declare these here.

export type { Level, MaterialStatus } from "@/lib/domain/stock-status"
export type {
  AnalyticsResponse,
  DayDetail,
  DaySeriesPoint,
  DepartmentReport,
  KpiValue,
  OverviewReport,
  ReportCommon,
  ShiftSeriesPoint,
} from "@/lib/domain/analytics-contract"
export { isDepartmentReport } from "@/lib/domain/analytics-contract"

// The old name for the overview payload, kept so existing imports keep compiling
// while the dashboard is migrated to the two-scope union.
export type { OverviewReport as AnalyticsReport } from "@/lib/domain/analytics-contract"
