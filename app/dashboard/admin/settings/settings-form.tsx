"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, Chip, Eyebrow, Field, NumberInput } from "@/components/primitives"
import {
  CONVERSION_FIELDS,
  DEFAULT_CONVERSIONS,
  SETTINGS_LIMITS,
  cartonLitres,
  cartonsPerDay,
  conversionRow,
  recipeWarnings,
  settingsFromRow,
  validateConversions,
  validateRecipes,
  validateSettings,
  type Conversions,
  type Recipes,
  type SettingsInput,
} from "@/lib/domain/settings"
import { expectedDailyBurn, stampsPerCarton } from "@/lib/domain/expected-burn"
import { ledgerUnitFor } from "@/lib/domain/materials"
import type { Product, ProductRecipeRow } from "@/lib/db/types"
import { ConversionsCard, type ConversionDraft } from "./conversions-card"
import { RecipesCard, type RecipesDraft } from "./recipes-card"

// ============================================================================
// Operational settings — the numbers the business changes without a deploy.
//
// Three blocks, in the order one reasons about them: the production FORECAST (what the
// plant expects to make), the CONVERSIONS (what a container holds), and the RECIPES
// (what a carton is made of). Together they drive every days-left projection: until a
// material has weeks of records a measured burn rate means nothing, so the projection
// falls back on what the plant SHOULD consume — and all of that is derived from these.
//
// The panel at the bottom shows the DERIVED rates live, before saving, computed by the
// SAME functions the report routes call. A forecast is abstract; "27 boxes of caps a
// day" is checkable against what the stores actually issue, and that is the difference
// between a number someone confirms and a number someone guesses at.
//
// Every input is held as a STRING and parsed on read. A numeric state would collapse
// "4." to 4 mid-keystroke, so a decimal recipe figure could not be typed at all.
// ============================================================================

const PREVIEW_KEYS = [
  "alcohol",
  "preform",
  "caps",
  "labels_bitters",
  "labels_ginger",
  "caramel_bitters",
  "caramel_ginger",
  "tax_stamp",
  "carton_bitters",
  "carton_ginger",
] as const

const LABELS: Record<string, string> = {
  alcohol: "Alcohol",
  preform: "Preforms",
  caps: "Caps",
  labels_bitters: "Labels — Bitters",
  labels_ginger: "Labels — Ginger",
  caramel_bitters: "Caramel — Bitters",
  caramel_ginger: "Caramel — Ginger",
  tax_stamp: "Tax stamps",
  carton_bitters: "Cartons — Bitters",
  carton_ginger: "Cartons — Ginger",
}

const FORECAST_FIELDS: Array<{ key: keyof SettingsInput; label: string; hint?: string }> = [
  { key: "cartons_per_shift_bitters", label: "Bitters cartons per shift" },
  { key: "cartons_per_shift_ginger", label: "Ginger cartons per shift" },
  {
    key: "shifts_per_day",
    label: "Shifts per day",
    hint: `${SETTINGS_LIMITS.shiftsPerDay.min}–${SETTINGS_LIMITS.shiftsPerDay.max}`,
  },
  { key: "waste_allowance_pct", label: "Waste allowance (%)", hint: "Applies to preforms, caps and labels." },
]

const PRODUCTS: Product[] = ["Bitters", "Ginger"]
const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 })
const str = (n: number) => (Number.isFinite(n) ? String(n) : "")
/** Blank is NOT zero: it is "no number", so validation names the field. */
const parse = (s: string) => (s.trim() === "" ? Number.NaN : Number(s))

type ForecastDraft = Record<keyof SettingsInput, string>

export function SettingsForm({
  initial,
  conversions: initialConversions,
  recipes: initialRecipes,
}: {
  initial: SettingsInput
  conversions: Conversions
  recipes: Recipes
}) {
  const [forecast, setForecast] = useState<ForecastDraft>(() => ({
    cartons_per_shift_bitters: str(initial.cartons_per_shift_bitters),
    cartons_per_shift_ginger: str(initial.cartons_per_shift_ginger),
    shifts_per_day: str(initial.shifts_per_day),
    waste_allowance_pct: str(initial.waste_allowance_pct),
    alcohol_drums_per_day: str(initial.alcohol_drums_per_day),
  }))
  const [conversions, setConversions] = useState<ConversionDraft>(
    () =>
      Object.fromEntries(CONVERSION_FIELDS.map((f) => [f.key, str(initialConversions[f.key])])) as ConversionDraft,
  )
  const [recipes, setRecipes] = useState<RecipesDraft>(() => ({
    Bitters: initialRecipes.Bitters.map((l) => ({
      ingredient: l.ingredient,
      label: l.label,
      litres: str(l.litresPerCarton),
    })),
    Ginger: initialRecipes.Ginger.map((l) => ({
      ingredient: l.ingredient,
      label: l.label,
      litres: str(l.litresPerCarton),
    })),
  }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notes, setNotes] = useState<string[]>([])

  const setForecastField = (key: keyof SettingsInput) => (e: { target: { value: string } }) => {
    setForecast((f) => ({ ...f, [key]: e.target.value }))
    setError(null)
  }

  // ── Parsed values: what will be validated, previewed and posted ────────────
  const parsedForecast: SettingsInput = {
    cartons_per_shift_bitters: parse(forecast.cartons_per_shift_bitters),
    cartons_per_shift_ginger: parse(forecast.cartons_per_shift_ginger),
    shifts_per_day: parse(forecast.shifts_per_day),
    waste_allowance_pct: parse(forecast.waste_allowance_pct),
    alcohol_drums_per_day: parse(forecast.alcohol_drums_per_day),
  }
  // Seeded from the defaults purely to satisfy the type: CONVERSION_FIELDS covers every
  // key of Conversions (asserted in a test), so every one is overwritten below.
  const parsedConversions: Conversions = { ...DEFAULT_CONVERSIONS }
  for (const f of CONVERSION_FIELDS) parsedConversions[f.key] = parse(conversions[f.key])
  const parsedRecipes: Recipes = {
    Bitters: recipes.Bitters.map((l) => ({
      ingredient: l.ingredient.trim(),
      label: l.label.trim(),
      litresPerCarton: parse(l.litres),
    })),
    Ginger: recipes.Ginger.map((l) => ({
      ingredient: l.ingredient.trim(),
      label: l.label.trim(),
      litresPerCarton: parse(l.litres),
    })),
  }

  const problem =
    validateSettings(parsedForecast) ??
    validateConversions(parsedConversions) ??
    validateRecipes(parsedRecipes, parsedConversions)

  // The preview runs through settingsFromRow — the SAME path the report routes take
  // from a database row — so what is shown here cannot drift from what the dashboards
  // will project.
  const recipeRows: ProductRecipeRow[] = PRODUCTS.flatMap((product) =>
    parsedRecipes[product].map((line, i) => ({
      product,
      ingredient: line.ingredient,
      label: line.label,
      litres_per_carton: line.litresPerCarton,
      display_order: i + 1,
    })),
  )
  const settings = settingsFromRow(
    { ...parsedForecast, ...conversionRow(parsedConversions) },
    recipeRows,
  )
  const target = cartonLitres(settings.conversions)

  const save = async () => {
    if (problem) {
      setError(problem)
      return
    }
    setSaving(true)
    setNotes([])
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...parsedForecast, conversions: parsedConversions, recipes: parsedRecipes }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || "Could not save the settings.")
      setError(null)
      setNotes(Array.isArray(body.warnings) ? body.warnings : [])
      if (Array.isArray(body.warnings) && body.warnings.length > 0) {
        toast.warning("Saved, with something left undone — see the notes on the form.")
      } else {
        toast.success("Settings saved — projections and the packaging ledger now use these figures.")
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not save the settings."
      setError(message)
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Production forecast" hint="drives the expected daily consumption" />
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {FORECAST_FIELDS.map((f) => (
              <Field key={f.key} label={f.label} required={f.key !== "waste_allowance_pct"} hint={f.hint}>
                {(p) => (
                  <NumberInput
                    {...p}
                    value={forecast[f.key]}
                    onChange={setForecastField(f.key)}
                    inputMode={f.key === "waste_allowance_pct" ? "decimal" : "numeric"}
                    step={f.key === "waste_allowance_pct" ? "any" : 1}
                    min={0}
                  />
                )}
              </Field>
            ))}
          </div>

          <div className="border-t border-hairline pt-4">
            <Field
              label="Alcohol drums per day"
              required
              hint="Stated directly, not derived: the ledger also covers alcohol drawn for concentrate extraction and ginger production, which a per-carton recipe cannot see."
            >
              {(p) => (
                <NumberInput
                  {...p}
                  value={forecast.alcohol_drums_per_day}
                  onChange={setForecastField("alcohol_drums_per_day")}
                  inputMode="decimal"
                  step="any"
                  min={0}
                  className="sm:max-w-xs"
                />
              )}
            </Field>
          </div>

          <p className="text-sm font-medium text-ink-secondary">
            {fmt(cartonsPerDay(settings, "Bitters"))} Bitters + {fmt(cartonsPerDay(settings, "Ginger"))} Ginger
            {" = "}
            <strong className="text-ink-primary">
              {fmt(cartonsPerDay(settings, "Bitters") + cartonsPerDay(settings, "Ginger"))} cartons a day
            </strong>
          </p>
        </div>
      </Card>

      <ConversionsCard
        draft={conversions}
        onChange={(key, value) => {
          setConversions((c) => ({ ...c, [key]: value }))
          setError(null)
        }}
      />

      <RecipesCard
        draft={recipes}
        cartonLitres={target}
        warnings={recipeWarnings(parsedRecipes)}
        onChange={(next) => {
          setRecipes(next)
          setError(null)
        }}
      />

      <Card>
        <CardHeader title="What this expects each day" hint="live, before you save" />
        <div className="p-4">
          <Eyebrow className="mb-2">Expected consumption per operating day</Eyebrow>
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
            {PREVIEW_KEYS.map((key) => {
              const rate = expectedDailyBurn(key, settings)
              const unit = ledgerUnitFor(key, settings.conversions)?.unit ?? "pcs"
              return (
                <div key={key} className="min-w-0">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted break-words">
                    {LABELS[key]}
                  </dt>
                  <dd className="text-sm font-bold text-ink-primary tnum break-words">
                    {rate === null ? "—" : `${fmt(rate)} ${unit}`}
                  </dd>
                </div>
              )
            })}
          </dl>
          <div className="mt-3 space-y-2">
            <Chip tone="neutral">
              packaging ledger deducts {fmt(stampsPerCarton(settings.conversions))} stamps per carton
            </Chip>
            <p className="text-xs text-ink-muted">
              Saving also writes that rate to the packaging bill of materials, which is what the stock ledger
              actually deducts — otherwise a stamp balance would drift from the figure above.
            </p>
            <p className="text-xs text-ink-muted">
              Herbs and PPE are absent on purpose: herb sacks feed extraction, which has no per-carton recipe,
              and PPE is issued to people rather than consumed per carton. Both keep measuring from records
              only.
            </p>
          </div>
        </div>
      </Card>

      {notes.length > 0 && (
        <div className="rounded-xl border border-warning/30 bg-warning-subtle px-4 py-3 space-y-1">
          {notes.map((n) => (
            <p key={n} className="text-sm font-semibold text-warning-ink">
              {n}
            </p>
          ))}
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-xl border border-critical/30 bg-critical-subtle px-3 py-2.5 text-sm font-semibold text-critical-ink"
        >
          {error}
        </p>
      )}

      {/* The save control sits at the end of a long form, so it repeats what is
          blocking it rather than leaving a disabled button with no explanation. */}
      <div className="flex flex-wrap items-center gap-3 pb-2">
        <Button onClick={save} disabled={saving || !!problem} className="h-11">
          <Save className="w-4 h-4" aria-hidden="true" />
          {saving ? "Saving…" : "Save settings"}
        </Button>
        {problem && !error && <span className="text-xs font-medium text-ink-muted">{problem}</span>}
      </div>
    </div>
  )
}
