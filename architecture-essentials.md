# Architecture Essentials

The short version. Read this before touching anything; read `architecture.md`
when you need the reasoning. `PLANNED` marks the stock/procurement separation
specified in `PRD.md`, which is designed but not yet built.

---

## 1. Stack and layout

Next.js 16 App Router · React 19 · TypeScript · Tailwind v4 · Supabase
(Postgres 16, Auth, PostgREST) · Recharts · ExcelJS · Vitest.

```
app/api/          route handlers — guard, query, shape, return
app/dashboard/    authenticated screens
components/primitives/   design system
components/features/     feature composites
lib/domain/       business rules — no React, no Supabase client
lib/auth/         guards
supabase/migrations/     the schema is the source of truth
supabase/tests/   SQL behaviour tests against a real Postgres
```

## 2. The one rule

**Declare a business rule once, in `lib/domain/`, and import it on both sides of
the wire.**

Stock alerting was dead for weeks because the route emitted `daysLeft` and the UI
read `operatingDaysLeft`. `undefined !== null`, so every cell rendered `NaN` and
the urgency sort did nothing. Never let a client component hold a compiled-in
copy of a number the server projected with.

## 3. The stock ledger is derived, not stored

Supervisors record **movements only** — received and used per shift. No stored
opening, no stored remaining.

```
balance = latest stock_count at or before the point (else 0)
        + Σ (received − used) for movements after that count, up to the point
```

ordered by `(date, shift_rank)`, Morning < Afternoon < Night.

Why: an out-of-order shift entry corrupts a stored opening forever. A derived
chain self-heals — a late Afternoon submission fixes itself *and* every later
balance.

Reads go through `SECURITY DEFINER` functions (`stock_opening`,
`stock_remaining_asof`, `stock_ledger`, `finished_goods_stock`) because continuity
spans supervisors that RLS correctly hides from each other.

Same model for tax stamps and cartons (received from receipts, consumed as
`cartons produced × packaging_bom`). Finished goods too: `Σ produced − Σ loaded`.

**PPE is the exception** — a stored running total in `consumable_stock`, because
its issued events are not reconstructable from anything else.

## 4. Roles

`profiles.role` is the **only** source of truth. Nothing reads auth metadata
after signup — `handle_new_user()` runs once, and a dashboard-created account
always lands as `supervisor`. Fix the role in `profiles`, not in metadata.

Three enforcement layers, all required: **RLS** (the real boundary), **route
guards**, **navigation** (presentation only — a hidden button is not access
control).

| Role | Does |
|---|---|
| `supervisor` | Files production records for one department |
| `stock` `PLANNED` | Every physical movement: receipts, invoices, counts, dispatch |
| `procurement` `PLANNED` | **Reads** all stock screens, writes nothing |
| `manager` | Reads analytics, records stock counts |
| `admin` | Everything, plus users and settings |

`PLANNED` SQL helpers: `can_write_stock()` (stock/manager/admin) and
`can_read_stock()` (adds procurement). `is_procurement_staff()` stays as an alias
of the read helper so no existing policy is rewritten — a policy rewrite is where
access-control regressions hide.

`PLANNED` guards: `requireStockWrite`, `requireStockRead`. `requireProcurement`
is replaced at every call site, not redefined.

## 5. Grants and RLS are different things

`drop schema public cascade` destroys Supabase's grants and does not restore
them. Logins survive (`auth` is another schema), so it looks like "my profile
disappeared". The real error is `42501: permission denied for schema public`.

**If the SQL editor works but every app request 42501s, suspect grants, not
RLS.** The editor connects as the owner and needs no grants.

Postgres grants `EXECUTE` to `PUBLIC` on every new function, and `anon` is in
`PUBLIC`. Omitting `anon` from a `GRANT` does nothing. Every `SECURITY DEFINER`
function must `revoke execute … from public, anon` first — the anon key ships in
the browser bundle.

## 6. Units are domain data

Every ledger material is counted in a **container**, not pieces.

| Material | Unit | Each |
|---|---|---|
| alcohol | drums | 250 L |
| caps | boxes | 4,000 pcs |
| labels | rolls | 4,000 pcs |
| caramel | gallons | 20 L (a 20 L drum, not a US gallon) |
| herb | sacks | not stated → show nothing |
| preform | bags | 1,008 pcs |

Use `ledgerUnitFor()`. Where the per-container count was never stated, show
nothing — an invented factor is worse than a bare count.

**A ratio can be right while both its terms are mislabelled.** When a domain
expert says a number is impossible, check the unit before defending the formula.

## 7. Projections say where they came from

Days-left runs over **operating days** (Mon–Sat, closed Sunday). The burn-rate
denominator counts **days that recorded usage**, not days in the window —
counting empty days as zero-consumption days read 600 drums as 624 days of cover.

`buildMaterialStatus` falls back to the expected rate when the sample is thin
(< 3 days), when the measurement is outside ¼–4× a known normal, or when nothing
was recorded, and reports which via `basis`. The UI states it.

**For any rate, ask what the denominator counts.**

## 8. Shift dating

A record is dated by the day its shift **started**. A Night shift starting 21:00
on the 31st is dated the 31st; its on-time window is 04:00–05:30 the next
morning. Use `shiftDateFor()`, never `new Date()`.

The ledger sorts by `(date, shift_rank)`, so the wrong date puts a Night row
before that day's Morning row. Period rollover is 07:00 on the 1st — 90 minutes
after the last Night window closes.

## 9. API conventions

- Use `auth.ctx.supabase` (RLS-bound). Service role only for admin user
  management, gamification writes, and the profile cross-check.
- **`Number()` every scalar RPC result.** PostgREST returns `numeric` as a
  string; `variance === 0` is false for `"0"` and `+` concatenates.
- Read settings once per request, pass them down. A missing row degrades to the
  confirmed defaults, **never to zero** — a zero forecast reads as "no usage".
- Read the rate the ledger used (`packaging_bom`), don't recompute it.
- Propagate a guard's own status; don't remap 403 to 401.

## 10. Frontend rules

- **`truncate` is not a safe default.** It implies `nowrap`, so any stacked or
  generated cell overflows and information vanishes silently.
- **`min-w-0` beside `shrink-0` is the squeeze pattern** — the cause of every
  "text goes vertical on mobile" bug here. Let the container **wrap**.
- Every table uses `DataTable` for its mobile card fallback.
- 16px minimum input text (or iOS zooms), 12px type floor, 44px touch targets.
- Semantic tokens only — no literal palette classes.
- Client screens: fetch on mount + 60s poll, request-sequence guard, hold the
  previous render at reduced opacity while refetching.

## 11. `PLANNED` — new tables

```
invoices        supplier, invoice_number, invoice_date, currency,
                declared_total          unique (supplier, invoice_number)
invoice_lines   invoice_id, material_type, quantity, unit, unit_cost,
                line_total  GENERATED
dispatches      date, shift, vehicle_reg, driver_name, destination,
                waybill_number, released_by
                unique (waybill_number) where not null
dispatch_lines  dispatch_id, product, cartons  check (cartons > 0)
                unique (dispatch_id, product)
raw_materials_received  + invoice_line_id  null, on delete set null
```

- `declared_total` is what the document says. A mismatch with the line sum is
  **warned, never blocked** — real invoices carry freight and tax, and refusing a
  real document makes users type fake numbers.
- `invoice_line_id` is nullable: goods arrive before paperwork.
- **Dispatch does not feed the finished-goods balance and there is no variance
  report.** The balance keeps deriving from `quantity_cartons_loaded`. The two
  figures may differ and the system will not flag it — that is the decision
  (PRD.md §3.3), not an oversight.

## 12. Gates

```
npm run test:run     unit tests
npm run typecheck    zero tsc errors
npm run lint         zero eslint errors
npm run build        compiles
npm run validate     all of the above + SQL behaviour tests on a real PG16
```

All five must be green before a phase gate. SQL tests are mandatory for RLS,
generated columns, deferred constraints and triggers — none of which TypeScript
can prove.

Harness gotchas: macOS Homebrew PG16 needs `LC_ALL=C`; a plpgsql `EXCEPTION`
block cannot catch a **deferred** constraint (it fires at commit).

## 13. Settings, not constants

Forecast, shifts per day, waste, unit conversions and BOM recipes live in
`app_settings` (a singleton row, admin-`UPDATE` only) and `product_recipes`.

Two invariants:

1. **Every recipe sums to exactly 9 L** (`CARTON_LITRES`), enforced on save. This
   caught the one real BOM error. Saving goes through `save_recipes(jsonb)`
   because remove-an-ingredient over the Data API is two transactions and the
   intermediate state fails the constraint.
2. **Saving settings also writes `packaging_bom`** — `stock_balance_core` deducts
   stamps from it, so the ledger must deduct what the settings say.

## 14. Open items

- Days-left Level 2 (supplier lead times, safety stock) — needs business data.
- Edit/delete of a submitted record — not built, declined. A typo is permanent.
