import { redirect } from "next/navigation"
import { createServerSupabase } from "@/lib/supabase/server"
import { PageHeader } from "@/components/primitives"
import {
  DEFAULT_CONVERSIONS,
  DEFAULT_SETTINGS,
  recipesFromRows,
  settingsFromRow,
  type SettingsInput,
} from "@/lib/domain/settings"
import type { ProductRecipeRow } from "@/lib/db/types"
import { SettingsForm } from "./settings-form"

export const dynamic = "force-dynamic"

/**
 * Admin-only: the forecast, conversions and recipes every projection is built on.
 *
 * Gated here AND by RLS (0006/0007 allow writes only to admins) AND by the API route's
 * requireAdmin. The redirect is the polite version; the other two are the boundary.
 *
 * Both migrations can stand alone, so this page reports which of them a database is
 * missing rather than failing: 0006 carries the forecast, 0007 the conversions and the
 * recipes. What cannot be saved is still SHOWN — on the defaults the app is already
 * projecting with — because a blank form would misrepresent what the dashboards are
 * doing right now.
 */
export default async function AdminSettingsPage() {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  if (profile?.role !== "admin") redirect("/dashboard")

  const [settingsRes, recipesRes] = await Promise.all([
    supabase.from("app_settings").select("*").maybeSingle(),
    supabase.from("product_recipes").select("product, ingredient, label, litres_per_carton, display_order"),
  ])

  const row = settingsRes.data
  // The row's own columns are how we know 0007 landed — a table that predates it simply
  // has no bottles_per_carton.
  const hasConversions = !!row && Object.hasOwn(row, "bottles_per_carton")
  const recipeRows = (recipesRes.data ?? null) as ProductRecipeRow[] | null
  const hasRecipes = !recipesRes.error

  const effective = settingsFromRow(row, recipeRows)
  const initial: SettingsInput = {
    cartons_per_shift_bitters: effective.cartonsPerShift.Bitters,
    cartons_per_shift_ginger: effective.cartonsPerShift.Ginger,
    shifts_per_day: effective.shiftsPerDay,
    // Stored as a percentage, held as a fraction — one conversion, in one direction.
    waste_allowance_pct: effective.wasteAllowance * 100,
    alcohol_drums_per_day: effective.alcoholDrumsPerDay,
  }

  const missing = [
    !row ? { file: "0006_app_settings.sql", what: "the production forecast" } : null,
    !hasConversions || !hasRecipes
      ? { file: "0007_settings_conversions_recipes.sql", what: "the unit conversions and the recipes" }
      : null,
  ].filter((m): m is { file: string; what: string } => m !== null)

  return (
    <div className="space-y-5 max-w-3xl mx-auto animate-fade-in-up">
      <PageHeader
        title="Settings"
        description="The forecast, conversions and recipes behind every projection."
        backHref="/dashboard"
      />
      {missing.map((m) => (
        <p
          key={m.file}
          className="rounded-xl border border-warning/30 bg-warning-subtle px-4 py-3 text-sm font-semibold text-warning-ink"
        >
          Showing the built-in defaults for {m.what} — this database does not have them yet. Apply
          supabase/migrations/{m.file} to save changes.
        </p>
      ))}
      <SettingsForm
        initial={initial}
        conversions={hasConversions ? effective.conversions : DEFAULT_CONVERSIONS}
        recipes={hasRecipes ? recipesFromRows(recipeRows) : DEFAULT_SETTINGS.recipes}
      />
    </div>
  )
}
