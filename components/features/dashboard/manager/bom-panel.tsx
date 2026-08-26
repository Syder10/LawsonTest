"use client"

import { useState } from "react"
import { AlertTriangle, FlaskConical } from "lucide-react"
import { CARTON_LITRES, PRODUCT_BOM, cartonsPerBatch, estimateUsage, recipeLitres } from "@/lib/domain/bom"
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
// Quantities are shown in LITRES and in the plant's own VESSELS (drums, 1000 L
// tanks, the 2500 L Rambo tank, 20 L gallons) — procurement orders vessels, the
// recipe specifies litres, and conflating the two is what corrupted these figures
// before. Unconfirmed recipes are labelled rather than presented as fact.
// ============================================================================

const ACCENT: Record<Product, string> = {
  Bitters: "text-series-bitters",
  Ginger: "text-series-ginger",
}

/** Small numbers stay legible; large ones stay compact. */
const qty = (n: number) => (n === 0 ? "0" : n < 0.01 ? n.toPrecision(2) : fmt1(n))

function IngredientTable({ product, cartons }: { product: Product; cartons: number }) {
  const lines = estimateUsage(product, cartons)

  return (
    <table className="w-full text-sm">
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
            <td className="px-3 py-1.5 font-semibold text-ink-secondary">
              <span className="inline-flex items-center gap-1.5">
                {l.label}
                {!l.confirmed && (
                  <span
                    role="img"
                    aria-label="Quantity not yet confirmed"
                    title="Awaiting confirmation from the business."
                    className="inline-flex"
                  >
                    <AlertTriangle className="w-3 h-3 text-warning shrink-0" aria-hidden="true" />
                  </span>
                )}
              </span>
            </td>
            <td className="px-3 py-1.5 text-right tnum font-semibold text-ink-primary whitespace-nowrap">{qty(l.litres)} L</td>
            <td className="px-3 py-1.5 text-right tnum text-ink-muted whitespace-nowrap">
              {qty(l.vessels)} <span className="text-xs">{l.vessel.name}</span>
              <span className="text-xs opacity-60"> ({l.vessel.litres} L)</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function BomPanel({ bitters, ginger }: { bitters: number; ginger: number }) {
  // Empty means "use the period's actual production".
  const [planned, setPlanned] = useState("")
  const plan = planned.trim() === "" ? null : Math.max(0, Number(planned) || 0)
  const actual: Record<Product, number> = { Bitters: bitters, Ginger: ginger }
  const products = Object.keys(PRODUCT_BOM) as Product[]
  const unconfirmed = products.filter((p) => !PRODUCT_BOM[p].confirmed)

  return (
    <Card>
      <CardHeader
        title="Bill of materials"
        hint={`${CARTON_LITRES} L per carton`}
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

      {unconfirmed.length > 0 && (
        <div className="flex items-start gap-2 px-4 py-2.5 bg-warning-subtle border-b border-warning/30">
          <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-xs font-medium text-warning-ink">
            {unconfirmed.join(" and ")} {unconfirmed.length === 1 ? "is" : "are"} awaiting confirmation. The
            quantities reconcile to a full carton, so they are probably right — but don’t plan a purchase against
            them until the recipe is signed off.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-hairline">
        {products.map((product) => {
          const bom = PRODUCT_BOM[product]
          const cartons = plan ?? actual[product]
          const balances = recipeLitres(product) === CARTON_LITRES
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
                  <Chip tone={balances ? "neutral" : "critical"}>
                    {balances
                      ? `${bom.batchLitres} L batch · ${cartonsPerBatch(product)} ctn`
                      : `recipe sums to ${recipeLitres(product)} L, not ${CARTON_LITRES}`}
                  </Chip>
                  <Chip tone={plan === null ? "neutral" : "brand"}>
                    {plan === null ? `${fmt1(actual[product])} ctn this period` : `planning ${fmt1(plan)} ctn`}
                  </Chip>
                </div>
              </div>
              <IngredientTable product={product} cartons={cartons} />
            </div>
          )
        })}
      </div>
    </Card>
  )
}
