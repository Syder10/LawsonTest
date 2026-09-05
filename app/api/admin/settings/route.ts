import { NextResponse } from "next/server"
import { requireAdmin, requireUser } from "@/lib/auth/guards"
import { stampsPerCarton } from "@/lib/domain/expected-burn"
import {
  CONVERSION_FIELDS,
  DEFAULT_CONVERSIONS,
  conversionRow,
  recipesFromRows,
  settingsFromRow,
  validateConversions,
  validateRecipes,
  validateSettings,
  type Recipes,
  type SettingsInput,
} from "@/lib/domain/settings"
import type { Product, ProductRecipeRow } from "@/lib/db/types"

// ============================================================================
// Operational settings — read by any signed-in user, written by admins only.
//
// The read is deliberately open to staff: the dashboards need the forecast to project
// days-left, and hiding it would mean either a service-role read on a normal page or a
// second copy of the numbers in code. RLS enforces the same split (0006), so this route
// is the readable error message, not the security boundary.
// ============================================================================

const RECIPE_COLUMNS = "product, ingredient, label, litres_per_carton, display_order"

export async function GET() {
  const auth = await requireUser()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const [settingsRes, recipesRes] = await Promise.all([
    auth.ctx.supabase.from("app_settings").select("*").maybeSingle(),
    auth.ctx.supabase.from("product_recipes").select(RECIPE_COLUMNS),
  ])
  if (settingsRes.error) return NextResponse.json({ error: settingsRes.error.message }, { status: 500 })
  const data = settingsRes.data

  // A missing row means 0006 has not been applied. Report the DEFAULTS rather than an
  // error: a stock dashboard that blanks out because a settings table is absent is a
  // worse failure than one running on the confirmed figures.
  return NextResponse.json({
    settings: data ?? null,
    recipes: recipesRes.data ?? null,
    effective: settingsFromRow(data, recipesRes.data),
  })
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  let body: Record<string, any>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 })
  }

  // Numbers arrive from a form as strings; coerce once, here, so validation and the
  // write see the same values.
  const forecast: SettingsInput = {
    cartons_per_shift_bitters: Number(body.cartons_per_shift_bitters),
    cartons_per_shift_ginger: Number(body.cartons_per_shift_ginger),
    shifts_per_day: Number(body.shifts_per_day),
    waste_allowance_pct: Number(body.waste_allowance_pct),
    alcohol_drums_per_day: Number(body.alcohol_drums_per_day),
  }

  const conversions = { ...DEFAULT_CONVERSIONS }
  for (const f of CONVERSION_FIELDS) {
    const raw = (body.conversions ?? {})[f.key]
    if (raw !== undefined) conversions[f.key] = Number(raw)
  }

  const recipes: Recipes | undefined = body.recipes
    ? {
        Bitters: (body.recipes.Bitters ?? []).map(normaliseLine),
        Ginger: (body.recipes.Ginger ?? []).map(normaliseLine),
      }
    : undefined

  for (const problem of [
    validateSettings(forecast),
    validateConversions(conversions),
    // The invariant, checked against the carton size being SAVED — not the stored one.
    // Changing bottles-per-carton without adjusting a recipe is exactly how a recipe
    // stops filling its carton, and the DB trigger only fires on recipe writes.
    recipes ? validateRecipes(recipes, conversions) : null,
  ]) {
    if (problem) return NextResponse.json({ error: problem }, { status: 400 })
  }

  // Read the singleton BEFORE writing: its columns are how we know which migrations
  // this database has. 0006 can stand alone, so the conversion columns may not exist —
  // and naming a missing column fails the WHOLE update, taking the forecast with it.
  const before = await auth.ctx.supabase.from("app_settings").select("*").maybeSingle()
  const supportsConversions = !!before.data && Object.hasOwn(before.data, "bottles_per_carton")
  const warnings: string[] = []

  const columns: Record<string, number | string> = { ...forecast }
  if (supportsConversions) {
    Object.assign(columns, conversionRow(conversions))
  } else if (body.conversions) {
    warnings.push(
      "The unit conversions were not saved: this database is missing them. Apply supabase/migrations/0007_settings_conversions_recipes.sql.",
    )
  }

  const { data, error } = await auth.ctx.supabase
    .from("app_settings")
    .update({ ...columns, updated_at: new Date().toISOString(), updated_by: auth.ctx.user.id })
    .eq("id", true)
    .select("*")
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // No row updated means the singleton is missing — 0006 has not been applied here.
  if (!data) {
    return NextResponse.json(
      { error: "Settings row not found. Apply supabase/migrations/0006_app_settings.sql to this database." },
      { status: 409 },
    )
  }

  // Recipes live in their own table, so this is a second call rather than one
  // transaction with the settings write. It is validated against the same conversions
  // above, so the two cannot end up describing different carton sizes; the 0007
  // trigger is the backstop if a recipe write ever lands on its own.
  //
  // It goes through save_recipes() rather than an upsert because a save may REMOVE an
  // ingredient: an upsert-then-delete is two transactions, and the state in between —
  // the new rows plus the ones about to go — does not fill a carton, so the deferred
  // check would reject a valid edit.
  let recipeRows: ProductRecipeRow[] | null = null
  if (recipes) {
    const payload = (["Bitters", "Ginger"] as Product[]).flatMap((product) =>
      recipes[product].map((line, i) => ({
        product,
        ingredient: line.ingredient,
        label: line.label,
        litres_per_carton: line.litresPerCarton,
        display_order: i + 1,
      })),
    )
    const written = await auth.ctx.supabase.rpc("save_recipes", { payload })
    if (written.error) {
      if (missingTable(written.error)) {
        warnings.push(
          "The recipes were not saved: this database has no product_recipes table. Apply supabase/migrations/0007_settings_conversions_recipes.sql.",
        )
      } else {
        return NextResponse.json(
          { error: `The forecast was saved, but the recipes were rejected: ${written.error.message}` },
          { status: 400 },
        )
      }
    } else {
      recipeRows = written.data
    }
  }

  // THE LEDGER MUST DEDUCT WHAT THE SETTINGS SAY. `stock_balance_core` derives stamp
  // consumption from packaging_bom, so leaving that table behind would recreate the
  // exact bug this replaced: the ledger deducting 9 stamps a carton while every
  // projection assumed 12. Both products share the rate — one stamp per bottle.
  const stampRate = stampsPerCarton(conversions)
  const bom = await auth.ctx.supabase
    .from("packaging_bom")
    .update({ stamps_per_carton: stampRate })
    .in("product", ["Bitters", "Ginger"])
    .select("product, stamps_per_carton")
  if (bom.error) {
    warnings.push(
      `The packaging ledger still deducts its previous stamp rate — ${bom.error.message}. Until it is updated, stamp balances and the ${stampRate}-per-carton forecast disagree.`,
    )
  }

  return NextResponse.json({
    settings: data,
    recipes: recipeRows,
    effective: settingsFromRow(data, recipeRows),
    stampsPerCarton: stampRate,
    warnings,
  })
}

/** True when a write failed because the table or function itself is absent (0007). */
function missingTable(error: { code?: string; message?: string }): boolean {
  // PostgREST reports an unknown relation as PGRST205 and an unknown function as
  // PGRST202, both from its schema cache; a direct Postgres error would be 42P01 or
  // 42883. Accept any of them rather than matching on prose.
  return ["PGRST205", "PGRST202", "42P01", "42883"].includes(error.code ?? "")
}

/** One posted recipe line, coerced. Labels come from the form so a new ingredient can be named. */
function normaliseLine(line: { ingredient?: string; label?: string; litresPerCarton?: unknown }) {
  return {
    ingredient: String(line.ingredient ?? "").trim(),
    label: String(line.label ?? "").trim(),
    litresPerCarton: Number(line.litresPerCarton),
  }
}
