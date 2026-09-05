"use client"

import { useState } from "react"
import { AlertTriangle, FlaskConical } from "lucide-react"
import { PRODUCT_BOM, estimateUsage, type ProductBom } from "@/lib/domain/bom"
import type { Product } from "@/lib/db/types"
import { Card, CardHeader, Chip, NumberInput } from "@/components/primitives"
import { fmt1 } from "./viz"

// ============================================================================
// Bill of materials — the ingredient recipe behind a carton.
//
// Three readings of the same recipe, because they answer different questions:
//   per carton    the recipe itself
//   this period   what the filtered window's production consumed
//   planning      "what do I need for N cartons?"
//
// Quantities are shown in LITRES and in the plant's own VESSELS (drums, mixing
// tanks, the Rambo tank, 20 L gallons) — procurement orders vessels, the recipe
// specifies litres, and conflating the two is what corrupted these figures before.
//
// The recipe arrives WITH the report: it is admin-editable, so a copy compiled into
// this component would show one thing while the report projected with another.
// ============================================================================

const ACCENT: Record<Product, string> = {
  Bitters: "text-series-bitters",
  Ginger: "text-series-ginger",
}

/** Small numbers stay legible; large ones stay compact. */
const qty = (n: number) => (n === 0 ? "0" : n < 0.01 ? n.toPrecision(2) : fmt1(n))

function IngredientTable({
  product,
  cartons,
  bom,
}: {
  product: Product
  cartons: number
  bom: Record<Product, ProductBom>
}) {
  const lines = estimateUsage(product, cartons, bom)

  return (
    // Ingredient names ("Ginger/Tiger Nut juice") plus two numeric columns are wider
    // than a 360px phone, and a table that overflows its card drags the whole PAGE
    // sideways. Scroll it here instead.
    <div className="overflow-x-auto">
      <table className="w-full min-w-[22rem] text-sm">
      <thead>
        <tr className="bg-surface-sunken">
          <th scope="col" className="text-left px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-ink-muted">Ingredient</th>
          <th scope="col" className="text-right px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-ink-muted">Litres</th>
          <th scope="col" className="text-right px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-ink-muted">Vessels</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-hairline">
        {lines.map((l) => (
          <tr key={l.key}>
            <td className="px-3 py-1.5 font-semibold text-ink-secondary">{l.label}</td>
            <td className="px-3 py-1.5 text-right tnum font-semibold text-ink-primary whitespace-nowrap">{qty(l.litres)} L</td>
            <td className="px-3 py-1.5 text-right tnum text-ink-muted whitespace-nowrap">
              {/* An ingredient with no known container shows litres only — a vessel
                  count against a guessed capacity would mean nothing. */}
              {l.vessel === null || l.vessels === null ? (
                <span className="text-xs">no container recorded</span>
              ) : (
                <>
                  {qty(l.vessels)} <span className="text-xs">{l.vessel.name}</span>
                  <span className="text-xs opacity-60"> ({l.vessel.litres} L)</span>
                </>
              )}
            </td>
          </tr>
        ))}
        </tbody>
      </table>
    </div>
  )
}

export function BomPanel({
  bitters,
  ginger,
  bom: configured,
}: {
  bitters: number
  ginger: number
  /** From the report. Falls back to the confirmed defaults if the field is absent. */
  bom?: ProductBom[]
}) {
  // Empty means "use the period's actual production".
  const [planned, setPlanned] = useState("")
  const plan = planned.trim() === "" ? null : Math.max(0, Number(planned) || 0)
  const actual: Record<Product, number> = { Bitters: bitters, Ginger: ginger }

  const bom: Record<Product, ProductBom> =
    configured && configured.length > 0
      ? { ...PRODUCT_BOM, ...Object.fromEntries(configured.map((b) => [b.product, b])) }
      : PRODUCT_BOM
  const products: Product[] = ["Bitters", "Ginger"]
  const broken = products.filter((p) => !bom[p].fillsCarton)

  return (
    <Card>
      <CardHeader
        title="Bill of materials"
        hint={`${bom.Bitters.cartonLitres} L per carton`}
        actions={
          <label className="flex items-center gap-2 text-xs font-semibold text-ink-secondary">
            <span className="whitespace-nowrap">Plan for</span>
            <NumberInput
              value={planned}
              onChange={(e) => setPlanned(e.target.value)}
              placeholder="cartons"
              aria-label="Plan for how many cartons"
              className="h-8 sm:h-8 w-24 text-sm"
            />
          </label>
        }
      />

      {broken.length > 0 && (
        <div className="flex items-start gap-2 px-4 py-2.5 bg-critical-subtle border-b border-critical/30">
          <AlertTriangle className="w-4 h-4 text-critical shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-xs font-medium text-critical-ink">
            {broken.join(" and ")} {broken.length === 1 ? "does" : "do"} not add up to a full carton, so every
            quantity below is understated or overstated by the difference. An administrator can correct the
            recipe in Settings.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-hairline">
        {products.map((product) => {
          const recipe = bom[product]
          const cartons = plan ?? actual[product]
          return (
            <div key={product}>
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                <h4 className={`text-sm font-bold inline-flex items-center gap-1.5 ${ACCENT[product]}`}>
                  <FlaskConical className="w-3.5 h-3.5" aria-hidden="true" />
                  {product}
                </h4>
                <div className="flex items-center gap-1.5">
                  {/* A recipe that doesn't fill its carton is wrong by
                      construction — surface it rather than quietly showing it. */}
                  <Chip tone={recipe.fillsCarton ? "neutral" : "critical"}>
                    {recipe.fillsCarton
                      ? `${recipe.batchLitres} L batch · ${fmt1(recipe.cartonsPerBatch)} ctn`
                      : `recipe sums to ${recipe.totalLitres} L, not ${recipe.cartonLitres}`}
                  </Chip>
                  <Chip tone={plan === null ? "neutral" : "brand"}>
                    {plan === null ? `${fmt1(actual[product])} ctn this period` : `planning ${fmt1(plan)} ctn`}
                  </Chip>
                </div>
              </div>
              <IngredientTable product={product} cartons={cartons} bom={bom} />
            </div>
          )
        })}
      </div>
    </Card>
  )
}
