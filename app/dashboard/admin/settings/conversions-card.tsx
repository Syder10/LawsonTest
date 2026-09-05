"use client"

import { Card, CardHeader, Field, NumberInput } from "@/components/primitives"
import { CONVERSION_FIELDS, type Conversions } from "@/lib/domain/settings"

// ============================================================================
// Unit conversions.
//
// Every NUMBER that turns one unit into another lives here. The unit WORDS do not:
// "drums", "boxes" and "rolls" appear in the entry-form labels, and those labels are
// the keys a submission is posted under, so renaming one from a settings page would
// orphan in-flight drafts and change what the submit route reads. That is a code
// change with a data migration, not a preference.
//
// Fields are rendered from CONVERSION_FIELDS rather than written out, so adding a
// conversion to the domain model cannot leave a field that nothing can edit.
// ============================================================================

const GROUPS: Array<{
  key: (typeof CONVERSION_FIELDS)[number]["group"]
  title: string
  blurb: string
}> = [
  {
    key: "carton",
    title: "A carton",
    blurb:
      "The recipe total and every per-bottle count derive from these two. Changing them changes what a recipe must sum to.",
  },
  {
    key: "perBottle",
    title: "Per bottle",
    blurb: "One of each, confirmed 2026-09-03. Every bottle carries a tax stamp.",
  },
  {
    key: "vessel",
    title: "What a vessel holds",
    blurb:
      "Capacities in litres. These convert a count into a volume on the dashboards and set the vessel column of the bill of materials.",
  },
  {
    key: "container",
    title: "What a container holds",
    blurb:
      "Pieces per box, roll or bag — the container a supervisor counts. Changing one moves both the balance and the expected daily rate.",
  },
  {
    key: "pack",
    title: "Received packs",
    blurb: "How procurement's boxes convert to pieces when a receipt is logged.",
  },
]

export type ConversionDraft = Record<keyof Conversions, string>

export function ConversionsCard({
  draft,
  onChange,
}: {
  draft: ConversionDraft
  onChange: (key: keyof Conversions, value: string) => void
}) {
  return (
    <Card>
      <CardHeader title="Unit conversions" hint="what one of a thing holds" />
      <div className="p-4 space-y-5">
        {GROUPS.map((group) => {
          const fields = CONVERSION_FIELDS.filter((f) => f.group === group.key)
          if (fields.length === 0) return null
          return (
            <fieldset key={group.key} className="space-y-3">
              <legend className="text-sm font-bold text-ink-primary">{group.title}</legend>
              <p className="text-xs text-ink-muted">{group.blurb}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {fields.map((f) => (
                  <Field
                    key={f.key}
                    label={f.label}
                    required
                    hint={f.integer ? "whole number" : undefined}
                  >
                    {(p) => (
                      <NumberInput
                        {...p}
                        value={draft[f.key]}
                        onChange={(e) => onChange(f.key, e.target.value)}
                        inputMode={f.integer ? "numeric" : "decimal"}
                        step={f.integer ? 1 : "any"}
                        min={f.min}
                        max={f.max}
                      />
                    )}
                  </Field>
                ))}
              </div>
            </fieldset>
          )
        })}
      </div>
    </Card>
  )
}
