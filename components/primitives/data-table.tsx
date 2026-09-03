import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

// ============================================================================
// DataTable — a wide table that stays usable on a 360px phone.
//
// Replaces 5 hand-rolled table headers (all spelling the same thing differently)
// and, more importantly, fixes the mobile story: the procurement stock page's
// 11-column table only offered horizontal scroll, needing roughly three screens
// of sideways drag with no affordance and no frozen first column.
//
// Below `sm` each row renders as a CARD of label/value pairs instead of a table
// row. Columns marked `primary` become the card's heading; `hideOnMobile` columns
// drop out of the card entirely.
//
// Figures use tabular-nums so digits align down a column — the one place equal
// width digits are correct (a large standalone number should NOT use them).
// ============================================================================

export interface Column<T> {
  key: string
  header: ReactNode
  /** Cell contents. */
  cell: (row: T) => ReactNode
  align?: "left" | "right"
  /** Renders as the card heading in the mobile layout. Exactly one column. */
  primary?: boolean
  /** Omitted from the mobile card — detail that isn't worth the vertical space. */
  hideOnMobile?: boolean
  /** Align digits vertically (numeric columns). */
  numeric?: boolean
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  empty,
  className,
}: {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  /** Shown instead of the table when there are no rows. */
  empty?: ReactNode
  className?: string
}) {
  if (rows.length === 0 && empty) return <>{empty}</>

  const primary = columns.find((c) => c.primary) ?? columns[0]
  const rest = columns.filter((c) => c !== primary && !c.hideOnMobile)

  return (
    <div className={className}>
      {/* ── Desktop: a real table ─────────────────────────────────────────── */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-sunken">
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={cn(
                    "px-3 py-2 text-xs font-bold uppercase tracking-wider text-ink-muted whitespace-nowrap",
                    c.align === "right" ? "text-right" : "text-left",
                  )}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {rows.map((row) => (
              <tr key={rowKey(row)} className="hover:bg-surface-sunken/60 transition-colors">
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cn(
                      "px-3 py-2.5 text-ink-secondary",
                      c.align === "right" ? "text-right" : "text-left",
                      c.numeric && "tnum",
                    )}
                  >
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Mobile: one card per row ──────────────────────────────────────── */}
      <ul className="sm:hidden divide-y divide-hairline">
        {rows.map((row) => (
          <li key={rowKey(row)} className="px-4 py-3">
            <div className="font-bold text-ink-primary break-words">{primary.cell(row)}</div>
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
              {rest.map((c) => (
                <div key={c.key} className="min-w-0">
                  {/* NOT truncated. `truncate` implies white-space: nowrap, which on a
                      360px phone clipped both the header and — worse — any cell that
                      stacks two lines (a figure plus its unit, or "1 day of data"):
                      the lines collapsed onto one and ran out of the card. Wrapping
                      makes the card taller, which is free; clipped data is not. */}
                  <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted break-words">
                    {c.header}
                  </dt>
                  <dd className={cn("text-sm text-ink-secondary break-words", c.numeric && "tnum")}>
                    {c.cell(row)}
                  </dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </div>
  )
}
