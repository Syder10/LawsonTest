"use client"

import { Plus, Scale, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, Chip, Field, NumberInput, TextInput } from "@/components/primitives"
import { INGREDIENTS_WITH_VESSELS } from "@/lib/domain/bom"
import type { Product } from "@/lib/db/types"

// ============================================================================
// The per-carton recipe.
//
// THE INVARIANT IS THE POINT OF THIS SCREEN. A product's ingredients must sum to
// exactly one carton. A recipe that does not fill its carton is wrong by construction,
// and that check is what caught the one real error in the original bill of materials
// (Bitters concentrate coded against the 900 L batch instead of the 1000 L concentrate
// tank, overstating it by ~11%). It is enforced three times over — live here, on save
// in the API, and by a deferred trigger in the database — because the number it
// protects feeds every material projection.
//
// Litres per carton is AUTHORITATIVE. The vessel a thing is kept in only affects how
// the figure is displayed; conflating the two is what mislabelled four ingredients as
// litres when they held vessel fractions.
// ============================================================================

export interface RecipeLineDraft {
  ingredient: string
  label: string
  litres: string
}

export type RecipesDraft = Record<Product, RecipeLineDraft[]>

const PRODUCTS: Product[] = ["Bitters", "Ginger"]

const round4 = (n: number) => Math.round(n * 10_000) / 10_000

const sumLitres = (lines: RecipeLineDraft[]) =>
  round4(lines.reduce((s, l) => s + (Number.isFinite(Number(l.litres)) ? Number(l.litres) : 0), 0))

export function RecipesCard({
  draft,
  cartonLitres,
  warnings,
  onChange,
}: {
  draft: RecipesDraft
  /** From the conversions above, so the target moves with the carton. */
  cartonLitres: number
  warnings: string[]
  onChange: (next: RecipesDraft) => void
}) {
  const edit = (product: Product, index: number, patch: Partial<RecipeLineDraft>) => {
    const lines = draft[product].map((l, i) => (i === index ? { ...l, ...patch } : l))
    onChange({ ...draft, [product]: lines })
  }

  const remove = (product: Product, index: number) => {
    onChange({ ...draft, [product]: draft[product].filter((_, i) => i !== index) })
  }

  const add = (product: Product) => {
    onChange({ ...draft, [product]: [...draft[product], { ingredient: "", label: "", litres: "0" }] })
  }

  /** Water is the remainder in both real recipes, so make that one click. */
  const balanceWithWater = (product: Product) => {
    const lines = draft[product]
    const others = sumLitres(lines.filter((l) => l.ingredient !== "water"))
    const remainder = round4(cartonLitres - others)
    onChange({
      ...draft,
      [product]: lines.map((l) => (l.ingredient === "water" ? { ...l, litres: String(remainder) } : l)),
    })
  }

  return (
    <Card>
      <CardHeader title="Recipes" hint={`each must sum to ${cartonLitres} L per carton`} />

      {warnings.length > 0 && (
        <div className="px-4 py-2.5 bg-warning-subtle border-b border-warning/30 space-y-1">
          {warnings.map((w) => (
            <p key={w} className="text-xs font-medium text-warning-ink">
              {w}
            </p>
          ))}
        </div>
      )}

      <div className="p-4 space-y-6">
        <p className="text-xs text-ink-muted">
          Litres per carton is the authoritative figure — the vessel a thing is stored in only changes how it
          is displayed. Ingredients coded{" "}
          <span className="font-semibold text-ink-secondary">{INGREDIENTS_WITH_VESSELS.join(", ")}</span> have a
          known container and are shown in vessels as well as litres; anything else is shown in litres only,
          because guessing a container would print a vessel count that means nothing.
        </p>

        {PRODUCTS.map((product) => {
          const lines = draft[product]
          const total = sumLitres(lines)
          const fills = total === round4(cartonLitres)
          const hasWater = lines.some((l) => l.ingredient === "water")
          const remainder = round4(cartonLitres - sumLitres(lines.filter((l) => l.ingredient !== "water")))

          return (
            <fieldset key={product} className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <legend className="text-sm font-bold text-ink-primary">{product}</legend>
                <Chip tone={fills ? "brand" : "critical"}>
                  {fills ? `${total} L — fills the carton` : `${total} L of ${round4(cartonLitres)} L`}
                </Chip>
              </div>

              {lines.map((line, index) => (
                <div key={index} className="rounded-xl border border-hairline p-3 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] gap-3">
                    <Field label="Ingredient" required>
                      {(p) => (
                        <TextInput
                          {...p}
                          value={line.label}
                          onChange={(e) => edit(product, index, { label: e.target.value })}
                          placeholder="Raw ethanol"
                        />
                      )}
                    </Field>
                    <Field label="Code" required hint="lower-case, no spaces">
                      {(p) => (
                        <TextInput
                          {...p}
                          value={line.ingredient}
                          onChange={(e) => edit(product, index, { ingredient: e.target.value })}
                          placeholder="alcohol"
                          autoCapitalize="none"
                          autoCorrect="off"
                          spellCheck={false}
                        />
                      )}
                    </Field>
                    <Field label="Litres per carton" required>
                      {(p) => (
                        <NumberInput
                          {...p}
                          value={line.litres}
                          onChange={(e) => edit(product, index, { litres: e.target.value })}
                          inputMode="decimal"
                          step="any"
                          min={0}
                        />
                      )}
                    </Field>
                  </div>
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => remove(product, index)}
                      className="h-11 sm:h-9 text-critical-ink"
                      aria-label={`Remove ${line.label || line.ingredient || "this ingredient"} from ${product}`}
                    >
                      <X className="w-4 h-4" aria-hidden="true" />
                      Remove
                    </Button>
                  </div>
                </div>
              ))}

              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => add(product)} className="h-11 sm:h-10">
                  <Plus className="w-4 h-4" aria-hidden="true" />
                  Add ingredient
                </Button>
                {hasWater && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => balanceWithWater(product)}
                    disabled={remainder < 0 || fills}
                    title={
                      remainder < 0
                        ? "The other ingredients already exceed a carton — reduce one first."
                        : `Set water to ${remainder} L, the remainder of the carton.`
                    }
                    className="h-11 sm:h-10"
                  >
                    <Scale className="w-4 h-4" aria-hidden="true" />
                    Balance with water
                  </Button>
                )}
              </div>
            </fieldset>
          )
        })}
      </div>
    </Card>
  )
}
