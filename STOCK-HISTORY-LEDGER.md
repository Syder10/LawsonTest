# Role-scoped History, stock ledger view, and clickable material detail

Implementation record for the History/reference work. Planning lives here too, so
the "what we set out to do" and the "what shipped" sit in one place.

## Problem

Three related gaps, all about making history and reference views read cleanly per
role:

1. **History had no record-type filter.** A supervisor saw every record type their
   department files with no way to narrow to one, so the page was noisy.
2. **Stock and procurement had an empty History page.** `history/page.tsx` scoped
   non-managers by `profile.department`, but `stock`/`procurement` profiles carry
   `department = null`, so `recordTypesForDepartment(null)` returned `[]` and the
   page rendered nothing. Their nav already linked there, so the tab existed but was
   blank.
3. **Materials were not clickable.** The Stock dashboard showed current balances with
   no way to open a material and see the dated history behind the number (receipts,
   usage, counts and variances).

No schema, RLS or RPC change. Every figure comes from tables and RPCs that already
exist (`stock_ledger`, `stock_remaining_asof`, `raw_materials_received`,
`stock_records`, `stock_counts`, `blowing_daily_records`, `consumable_stock`).
Writes stay on the existing `ReconcileModal` to `/api/stock/reconcile` path.

## Decisions

- **Stock/procurement History is a material index plus drill-down**: a clean list of
  stock materials with current on-hand, each row opening that material's full detail.
- **The material drill-down is a dedicated page** (its own URL), reached from BOTH the
  Stock dashboard materials table and the stock History index. One detail surface,
  two entry points.
- **Materials have a three-way `kind`** (refined during implementation from the
  original two-way split), because `stock_ledger` and `stock_remaining_asof` do not
  agree on which materials produce per-shift movement rows:
  - `ledger` (alcohol, preforms, caps, labels, caramel): `stock_ledger` yields
    per-shift opening to remaining rows; balance via `stock_remaining_asof`;
    reconcilable.
  - `derived` (tax_stamp, cartons): balance is correct via `stock_remaining_asof`,
    but `stock_ledger` yields NO movement rows for them (verified in migration 0005:
    the `mov` CTE unions only `stock_records` and `blowing_daily_records`).
    Consumption is derived from production, not itemised, so the detail page shows
    receipts plus counts plus a note instead of a per-shift ledger. Reconcilable.
  - `consumable` (PPE: seal_tape, hair_net, nose_mask, gloves): balance via
    `consumable_stock`; received and issued via `raw_materials_received`; NOT
    reconcilable.

## What shipped, by phase

Each phase gated on `npm run typecheck`, `npm run lint`, `npm run test:run` and
`npm run build` before the next began. Final `npm run validate` (full gate plus the
PG16 SQL suite) passed.

### Phase 1: material registry

- `lib/domain/stock-materials.ts` (new): `STOCK_MATERIALS`, the single source for the
  key to descriptor mapping (`{ key, material, product, variant, label, unit, kind }`),
  plus `materialDescriptorForKey(key)` (handles the `cartons_*` to `carton_*` alias),
  `stockMaterialKeys()` and `isReconcilable(d)`.
- `lib/domain/stock-materials.test.ts` (new): product split, alias, PPE kind, unknown
  key to null, `isReconcilable`, key uniqueness.
- `components/features/stock/reconcile-modal.tsx`: `ledgerTargetForKey` now delegates
  to the registry instead of an inline switch (behaviour unchanged).

### Phase 2: detail assembler

- `lib/domain/material-detail.ts` (new): `assembleMaterialDetail(supabase, d, from,
  to, today)` returns `{ remaining, ledger[], sourceRecords[], counts[] }`, with pure,
  unit-tested normalisers (`normalizeLedger`, `normalizeStockRecord`,
  `normalizeBlowingRecord`, `normalizeReceipt`, `normalizeCount`) and thin Supabase
  loaders. Every numeric is `Number()`-coerced (PostgREST serialises `numeric` as a
  string).
- `lib/domain/material-detail.test.ts` (new): each normaliser fed string-typed numerics
  to prove coercion, including `variance === 0` truthiness.

### Phase 3: material detail page

- `app/dashboard/procurement/stock/material/[key]/page.tsx` (new, server):
  `requireStockRead`, resolve the key or `notFound()`, read `?from`/`?to` (default 30
  days), assemble, pass `canWrite` to the client child.
- `app/dashboard/procurement/stock/material/[key]/material-detail-client.tsx` (new,
  client): back link, header with an on-hand `StatTile`, a 7/30/90d plus custom date
  range driven through the URL, a ledger table (ledger kind only), a source-records
  table, a counts and variance table (non-consumable), and a Count action opening the
  existing `ReconcileModal` for `canWrite` readers on reconcilable materials.

### Phase 4: clickable rows

- `components/primitives/data-table.tsx`: added `rowHref?: (row) => string`
  (a stretched `next/link` in the primary cell of a `relative` row, valid table markup,
  no `useRouter`) and `Column.interactive?` to elevate an action cell above the row
  link so the Count button still works without navigating.
- `app/dashboard/procurement/stock/stock-client.tsx`: materials table now sets
  `rowHref` to the detail page and marks the Action column `interactive`. All 14 report
  keys resolve through the registry, so no row links to a 404.

### Phase 5: History type filter and stock ledger index

- `app/dashboard/history/HistoryDateFilter.tsx`: added a record-type `Select` (shown
  only when more than one type is available) driving a `?type=` param, plus a
  `FilterChip` for it.
- `app/dashboard/history/page.tsx`: builds the type options from the role's own def
  list, filters the rendered defs by `?type=`, and branches for `stock`/`procurement`
  to render the ledger index instead of the empty production-records view.
  Manager/admin keep the production view, now filterable.
- `components/features/stock/ledger-index.tsx` (new): `StockLedgerIndex` fetches
  `/api/procurement/report` (reuse, no new query), lists materials with on-hand as a
  `DataTable` with `rowHref` to the detail page, plus a group filter
  (all/procurement/production). On-hand only; the detail page carries the dated
  history.

## Constraints honoured

- No invented figures. Balances and ledger from `stock_ledger`/`stock_remaining_asof`,
  counts from `stock_counts`, receipts and usage from the tables that store them.
- Each derived rule declared once in `lib/domain/` and imported on both sides (NFR-2):
  the key to descriptor map and the detail assembler each live in one file.
- Dispatch is finished goods, not a raw material, and stays out of the material ledger.

## Verification

`npm run validate` passed all gates: typecheck (0 errors), lint (0 errors, 56
pre-existing warnings), 689 tests across 21 files, `next build`, and the PG16 SQL
suite (unaffected, no SQL changed). The dynamic route
`/dashboard/procurement/stock/material/[key]` is present in the build output.
