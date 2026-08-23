import type { UserRole } from "@/lib/db/types"

// Shared role presentation. The label map was duplicated in the dashboard
// layout header and the user-management screen.
export const ROLES: UserRole[] = ["supervisor", "manager", "admin", "procurement"]

export const ROLE_LABELS: Record<string, string> = {
  supervisor: "Supervisor",
  manager: "Manager",
  admin: "Administrator",
  procurement: "Stock Office",
}

export const ROLE_COLORS: Record<string, string> = {
  supervisor: "bg-emerald-50 text-emerald-700 border-emerald-200",
  manager: "bg-slate-100 text-slate-700 border-slate-200",
  admin: "bg-zinc-800 text-zinc-100 border-zinc-700",
  procurement: "bg-blue-50 text-blue-700 border-blue-200",
}

export const roleLabel = (role: string) => ROLE_LABELS[role] ?? "Supervisor"
