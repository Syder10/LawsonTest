# Architecture — Lawson Production Management

Written 2026-09-06. Describes the system as it stands **plus** the stock and
procurement separation specified in PRD.md, with the planned parts marked
`PLANNED`.

For the short version, read `architecture-essentials.md`. This document is the
long form: it explains why each layer is shaped the way it is, and records the
failures that shaped it.

---

## 1. What the system is

A production data-collection and stock-control application for a beverage plant
producing two products, **Bitters** and **Ginger**, across five departments:
Blowing, Alcohol and Blending, Filling Line, Packaging, Concentrate.

Supervisors file records per shift from a phone. Managers read analytics. A stock
office receives materials, counts them, and dispatches finished goods. An
administrator manages users and the production settings every projection derives
from.

Stack: Next.js 16 App Router, React 19, TypeScript, Tailwind v4, Supabase
(Postgres 16 + Auth + PostgREST), Recharts, ExcelJS, Vitest.

## 2. The shape of the codebase

```
app/
  api/                 Route handlers. Thin: guard, query, shape, return.
  dashboard/           Authenticated screens, one directory per area.
  login/ page.tsx      Unified sign-in and the splash screen.
components/
  primitives/          Design-system building blocks (Card, DataTable, Field, …)
  features/            Feature-specific composites, grouped by area
  ui/                  The remaining vendored shadcn pieces
lib/
  auth/                Guards and profile resolution
  db/types.ts          Hand-written Supabase `Database` type
  domain/              Business rules. No React, no Supabase client.
  glass/               WebGL splash screen
  supabase/            Client factories (browser, server, admin, middleware)
supabase/
  migrations/          Ordered SQL. The schema is the source of truth.
  tests/               SQL behaviour tests, run against a real Postgres
scripts/               Validation harnesses
```

### 2.1 The rule that matters most

**Business rules live in `lib/domain/`, are declared exactly once, and are
imported by both the route that computes them and the UI that renders them.**

This is not a style preference. The stock alerting was silently dead for weeks
because `/api/analytics/report` emitted `daysLeft` while the manager UI read
`operatingDaysLeft`; since `undefined !== null`, every "Days left" cell rendered
`NaN` and the urgency sort became a no-op. The procurement route happened to use
the correct name, so one screen worked and the bug hid.

The fix was structural, not a rename: `lib/domain/stock-status.ts` now declares
the row shape, the thresholds, the level function and the row builder, and both
routes construct rows through it. `manager/types.ts` re-exports rather than
re-declaring. The same reasoning produced `lib/domain/analytics-contract.ts` for
the wire format, and it is why the BOM recipe now exists once in
`settings.ts DEFAULT_RECIPES` instead of being duplicated into `bom.ts`.

Corollary: a client component must never hold a compiled-in copy of a number the
server projected with. The manager BOM panel renders `report.bom` from the API
for exactly this reason.

## 3. Data layer

### 3.1 Migrations

Five squashed migrations plus two settings migrations, applied in order:

| File | Contents |
|---|---|
| `0001_foundation` | Extensions, enums, role helper functions |
| `0002_reference_data` | Departments, materials, herb types, `packaging_bom` |
| `0003_identity` | `profiles`, hardened provisioning trigger, privilege guard |
| `0004_records` | Seven production tables, `stock_records`, consumables, receipts, gamification |
| `0005_ledger_and_grants` | The derived ledger, plus the Data API grants. **Must run last of 0001–0005** |
| `0006_app_settings` | The admin-editable settings singleton |
| `0007_settings_conversions_recipes` | Conversions and product recipes |
| `0008_stock_separation` | `PLANNED` — the `stock` role, invoices, dispatches |

`0008` is self-contained (its own RLS and grants) so it can be applied on its own
to a live database, following the pattern 0006 and 0007 established.

### 3.2 Grants are separate from RLS, and both are required

`drop schema public cascade; create schema public;` — the usual way to reset a
database — destroys the grants Supabase ships and does not restore them. Because
`auth` is a different schema, logins keep working, so the symptom looks like
"my profile disappeared" rather than "the API is dead". The real error is
`42501: permission denied for schema public` for user `authenticator`.

The SQL editor connects as the schema **owner**, which needs no grants, so it
keeps working throughout. **When the SQL editor works but every app request
42501s, suspect grants, not RLS.**

A second trap in the same area: Postgres grants `EXECUTE` on every new function
to `PUBLIC`, and `anon` is in `PUBLIC`. Omitting `anon` from a `GRANT` therefore
does nothing. The `SECURITY DEFINER` ledger functions bypass RLS by design, and
were briefly callable by anyone holding the anon key — which ships in the browser
bundle. They are now explicitly `REVOKE`d from `PUBLIC` and `anon` first.

Any new `SECURITY DEFINER` function in 0008 must follow the same pattern:
`revoke execute … from public, anon` then `grant execute … to authenticated`.

### 3.3 The derived stock ledger

The central design decision in the data layer. Supervisors record **only
movements** — quantity received and quantity used on their shift. There is no
stored opening and no stored remaining.

A balance at a point in time is:

```
  counted_qty of the latest stock_count at or before that point (else 0)
+ Σ (received − used) for every movement strictly after that count, up to the point
```

ordered chronologically by `(date, shift_rank)` with Morning < Afternoon < Night.

Why derived rather than stored: a frozen opening copied from "whichever row was
submitted last" corrupts the chain the moment shifts are entered out of order,
and can never self-heal. Deriving from the ordered movement log means a late
Afternoon submission slots into its true position and **every later balance
recomputes automatically**. This was validated against a real Postgres: entering
Afternoon 150, Night 120 and an end-of-day 90 out of order produces the correct
chain.

Balance reads go through `SECURITY DEFINER` functions because continuity spans
multiple supervisors' rows, which RLS correctly hides from any one of them. The
functions expose computed balances only, never another user's raw rows.

Management owns the baseline and drift correction via `stock_counts`: a physical
count re-anchors the ledger and stores the counted-minus-computed variance.

The same derivation covers tax stamps and cartons: received from
`raw_materials_received`, consumed as `cartons produced × packaging_bom rate`. So
editing a packaging record self-corrects the stamp balance, which the old
insert-only trigger could not do.

**Finished goods are derived too**: `Σ produced − Σ loaded` per product from
`packaging_daily_records`, via `finished_goods_stock()`. The stored
`packaging_live_stocks` running total was dropped because it drifted on edits and
could go negative.

### 3.4 What is *not* derived, and why

`consumable_stock` keeps a running total for PPE only. PPE has explicit received
and issued events in `raw_materials_received` that are not otherwise
reconstructable, so there is nothing to derive it from. Finished goods were 100%
derivable; PPE is not.

### 3.5 `PLANNED` — invoices and dispatches

Four new tables. Neither entity feeds the ledger.

```
invoices
  id, supplier, invoice_number, invoice_date, currency, declared_total,
  remarks, recorded_by, user_id, created_at
  unique (supplier, invoice_number)

invoice_lines
  id, invoice_id → invoices on delete cascade,
  material_type, quantity, unit, unit_cost,
  line_total  generated always as (quantity * unit_cost) stored

dispatches
  id, date, shift, vehicle_reg, driver_name, destination, waybill_number,
  released_by, remarks, user_id, created_at
  unique (waybill_number) where waybill_number is not null

dispatch_lines
  id, dispatch_id → dispatches on delete cascade,
  product, cartons  check (cartons > 0)
  unique (dispatch_id, product)

raw_materials_received
  + invoice_line_id  uuid null references invoice_lines(id) on delete set null
```

Design notes:

- **`line_total` is generated, not stored.** The database is the source of truth
  for anything computable, matching every other derived column in the schema.
- **The header total is `declared_total`, deliberately named.** It is what the
  supplier's document says, which is not necessarily the sum of the lines. FR-9
  warns on a mismatch and does not block it: real invoices carry freight, tax and
  discounts the line model does not represent, and refusing a real document
  because our arithmetic disagrees pushes users to type a fake number.
- **`invoice_line_id` is nullable with `on delete set null`.** Goods arrive
  before paperwork; a receipt must be recordable with no invoice, and deleting an
  invoice must not delete the fact that goods arrived.
- **The waybill unique index is partial.** A plain `unique` would allow only one
  null row in some engines and is semantically wrong here — many dispatches have
  no waybill, and they are not duplicates of each other.
- **`dispatch_lines` is unique on `(dispatch_id, product)`**, so one load carries
  at most one line per product and quantities cannot be double-entered.
- **`cartons > 0`**, not `>= 0`: a zero line is noise, and FR-13 requires at
  least one real quantity.
- **Dispatch does not touch `finished_goods_stock()`.** See PRD.md §3.3. The
  balance keeps deriving from `quantity_cartons_loaded`; dispatch is the delivery
  history beside it, with no variance report. The two figures may differ and the
  system will not flag it — that is the decision, recorded here so nobody "fixes"
  it by accident.

## 4. Roles and access control

### 4.1 Three enforcement layers, none of them optional

1. **RLS policies** — the real boundary. Table grants are broad because RLS is
   what constrains rows; a migration that grants without RLS enabled is refused
   by the safety gate in the grants block.
2. **Route guards** (`lib/auth/guards.ts`) — `requireUser`, `requireRole`, and
   the convenience wrappers. Every route handler starts with one.
3. **Navigation** (`lib/domain/roles.ts`) — what a role is *offered*.

Navigation is presentation, not security. A hidden button is not access control,
which is why the write matrix is asserted in SQL behaviour tests rather than
inferred from the nav config.

### 4.2 `profiles.role` is the only source of truth

Every authorisation decision reads `public.profiles.role`. Nothing reads
`auth.users.raw_user_meta_data` after account creation.

This caused a real, hard-to-diagnose incident. `handle_new_user()` is an
`AFTER INSERT` trigger on `auth.users`, runs **once**, and reads the role from
metadata — which is absent when an account is created from the Supabase dashboard,
so it defaults to `supervisor`. Editing the auth user's metadata afterwards
changes nothing, because nothing re-reads it. The role must be changed in
`public.profiles.role`, via User Management or SQL.

A trigger syncing role *from* metadata on UPDATE was considered and deliberately
**not** added: it would create a second source of truth that fights the admin
API, so a later metadata edit would silently revert an in-app promotion.

RLS gates rows, never columns, so `profiles_update_own` initially let any
supervisor set their own `role` to `admin` through PostgREST. A `BEFORE UPDATE`
trigger now rejects changes to role, department and group number. It allows
`auth.uid() IS NULL` (service role or table owner) because every profiles policy
is `to authenticated AND id = auth.uid()`, which is never true for a null uid —
so a null uid at update time means RLS was already bypassed legitimately.

### 4.3 `PLANNED` — the role split

The `user_role` enum gains `stock`. The single `is_procurement_staff()` helper
splits in two, because one predicate cannot express both "may write" and "may
read":

```sql
-- may create receipts, invoices, counts, dispatches
can_write_stock()  → role in ('stock', 'manager', 'admin')

-- may read every stock screen
can_read_stock()    → role in ('stock', 'procurement', 'manager', 'admin')
```

`is_procurement_staff()` is **kept as an alias of `can_read_stock()`** rather
than dropped. Dropping it would need every policy in 0004 and 0005 rewritten in
0008, and a policy rewrite is exactly where an access-control regression hides.
Keeping it means the read surface is unchanged by construction, and only the
write policies are touched.

Guards gain `requireStockWrite` (`stock`, `manager`, `admin`) and
`requireStockRead` (adds `procurement`). `requireProcurement` — currently
`procurement`, `manager`, `admin` — is **replaced at every call site** rather
than redefined, since silently changing what an existing guard permits is how an
authorisation change goes unnoticed.

Nav for the new role, within the five-item cap:

```
stock:        Home · Receive · Dispatch · Stock · Profile
procurement:  Home · Stock · Invoices · History · Profile   (no Receive)
```

## 5. Domain layer

`lib/domain/` holds pure business rules — no React, no Supabase client, fully
unit-testable. The modules that matter:

| Module | Owns |
|---|---|
| `record-types.ts` | The registry of record types: departments, storage, products, compulsory flags |
| `form-config.ts` | Field definitions carrying their own DB column and `generated` flag |
| `shift-config.ts` | Shift rotation, on-time windows, the night-shift dating convention |
| `stock-status.ts` | The one material-status contract: thresholds, levels, row builder |
| `operating-days.ts` | Mon–Sat operating days, burn-rate spans, run-out projection |
| `expected-burn.ts` | Expected daily consumption per material, derived from the forecast |
| `settings.ts` | The admin-editable settings, conversions and default recipes |
| `bom.ts` | Per-carton recipes, with `litresPerCarton` authoritative |
| `stock-ledger.ts` | Ledger enrichment for history, day detail and export |
| `roles.ts` | Role labels, badge styling, and navigation as data |
| `gamification.ts` | Streaks, gaps, on-time computation |
| `period.ts` | Month windows and the 07:00 rollover |
| `dispatch.ts` | `PLANNED` — dispatch row shapes and per-vehicle/destination aggregation |
| `invoices.ts` | `PLANNED` — invoice shapes, line totals, received-versus-invoiced |

### 5.1 Units are part of the domain, not a label

Every ledger material is counted in a **container**, not pieces. This was wrong
across the whole app: the form asked for a bare "Quantity Used", the floor counts
250 L drums, and every dashboard captioned the result "litres".

The arithmetic was self-consistent — drums in, drums out — so days-left was not
wrong by 250×. But every figure on screen was mislabelled, and "600 litres of
alcohol" reads as a rounding error for a plant this size rather than the three
days of cover 600 drums actually is.

| Material | Entry unit | Per container |
|---|---|---|
| alcohol | drums | 250 litres |
| caps | boxes | 4,000 pcs |
| labels | rolls | 4,000 pcs |
| caramel | gallons | 20 litres (a 20 L drum, not a US gallon) |
| herb | sacks | not stated — nothing shown |
| preform | bags | 1,008 pcs |

`ledgerUnitFor()` resolves the unit, falling back to the material prefix so
per-product rows (`labels_bitters`, `caramel_ginger`) still resolve. Where the
count per container was never stated, **nothing is shown** — an invented factor
is worse than a bare count.

The lesson generalises, and applies directly to the invoice line unit: *a ratio
can be right while both its terms are mislabelled.* When a domain expert says a
number is impossible, check the unit before defending the formula.

### 5.2 Projections state their own basis

Days-left is projected over operating days, and the burn-rate denominator counts
**days that recorded usage**, not days in the window. Dividing by every Mon–Sat
in a 30-day window counted days nobody had entered yet as days of zero
consumption, which read 600 drums with one 25-drum row as 624 days of cover.

A measured rate is only trustworthy when there is enough of it and it is not
absurd, so `buildMaterialStatus` falls back to the expected rate when the sample
is thin, when the measurement is outside a quarter to four times a known normal,
or when nothing was recorded — and reports which via `basis: "measured" |
"expected"`. The UI says "at ~200/day expected" when the basis is expected, and
"1 day of data" when the sample is thin.

The principle for any new figure, including dispatch rates: **for any rate, ask
what the denominator counts.** "Days in the period" and "days we have data for"
diverge hardest exactly when a system is new, which is when someone checks it
against a hand-figure.

### 5.3 Shift dating

A record is dated by the day its shift **started**. A Night shift beginning
21:00 on the 31st is dated the 31st, and its on-time window is 04:00–05:30 the
next morning.

This matters for the ledger: chaining sorts by `(date, shift_rank)`, so a Night
row dated by its end date would sort before that day's Morning row. It also
matters for period boundaries — the leaderboard rolls over at 07:00 on the 1st,
90 minutes after the last Night window closes, because "the month is over" is
not a clock fact in a shift business.

`PLANNED`: dispatch carries `date` and `shift` and inherits this convention,
using `shiftDateFor()` for its default date, so a load released at 05:00 is not
filed against the wrong day.

## 6. API layer

Route handlers are thin: guard, query, shape through a domain module, return.
There is no ORM and no repository layer — PostgREST via the typed Supabase client
is the data access layer.

Conventions, each of which exists because of a specific failure:

- **The RLS-bound client by default.** `auth.ctx.supabase` is the user's own
  client. The service-role client is used only where it is genuinely required:
  admin user management, gamification writes, and the profile cross-check.
- **`Number()` every scalar RPC result.** PostgREST serialises `numeric` as a
  **string**. Without the coercion, `variance === 0` is false for `"0"` and
  arithmetic silently concatenates.
- **Read settings once per request and pass them down.** A missing settings row
  degrades to the confirmed defaults, never to zero — a zero forecast renders
  every material as "no usage", which looks calm and is worse than a wrong
  number.
- **Read the rate the ledger actually used.** `/api/procurement/report` reads
  `packaging_bom.stamps_per_carton` for its stamps-used figure rather than
  recomputing it, so the displayed usage always matches the derived balance even
  if the settings write failed. This is how a 9-versus-12 disagreement survived
  for weeks.
- **A guard failure returns its own status.** `{ ok: false, status, error }`
  propagates unchanged; routes do not remap 403 to 401.

`PLANNED` routes:

| Route | Guard | Purpose |
|---|---|---|
| `POST /api/stock/dispatch` | `requireStockWrite` | Create a dispatch with lines |
| `GET /api/stock/dispatch` | `requireStockRead` | Filterable dispatch history |
| `POST /api/stock/invoices` | `requireStockWrite` | Create an invoice with lines |
| `GET /api/stock/invoices` | `requireStockRead` | Invoice log with received-versus-invoiced |
| `GET /api/stock/report` | `requireStockRead` | The stock dashboard payload |

`/api/procurement/report` is superseded by `/api/stock/report`, which returns the
existing material rows plus produced, dispatched and invoice blocks. Existing
write routes — `raw-materials`, `stock/reconcile` — move behind
`requireStockWrite`.

## 7. Frontend

Server components fetch and pass down; client components own interaction. Data
fetching in client screens is fetch-on-mount plus a 60-second poll, with a
request-sequence guard so a slow response for an old filter cannot overwrite a
newer one, and the previous render held at reduced opacity during a refetch
rather than flashing a skeleton.

`components/primitives/` is the design system: `Card`, `CardHeader`, `Chip`,
`StatusBadge`, `StatTile`, `DataTable`, `EmptyState`, `PageHeader`, and the form
set (`Field`, `TextInput`, `NumberInput`, `Select`, `Choice`, `TextArea`) which
auto-wires label to control.

Hard rules learned the hard way:

- **`truncate` is not a safe default.** It implies `white-space: nowrap`, so any
  cell that stacks two lines runs out of its container. It is right for one line
  of prose in a fixed slot and wrong for anything composed or generated from a
  column name — it deletes information silently.
- **`min-w-0` beside `shrink-0` is the squeeze pattern.** One flex child that may
  shrink to nothing next to one that never shrinks. Every "text goes vertical on
  mobile" report in this codebase has been that shape, and the answer is to let
  the container **wrap**, not to argue about widths.
- **Every table needs its mobile card fallback.** `DataTable` provides it. An
  11-column table whose only mobile strategy is horizontal drag is unusable on
  the device this app is actually used on.
- **16px minimum input text**, or iOS zooms on focus. 12px is the type floor.
  44px is the touch-target floor.
- **Colour comes from semantic tokens**, never literal palette classes. Chart
  series are `--series-*`, validated for colour-vision distance in both light and
  dark against the app's real surfaces.

## 8. Testing and gates

| Gate | Command | What it proves |
|---|---|---|
| Unit | `npm run test:run` | Domain rules, in isolation |
| Types | `npm run typecheck` | Zero `tsc` errors |
| Lint | `npm run lint` | Zero eslint errors |
| SQL behaviour | via `npm run validate` | Migrations apply and behave, on a real PG16 |
| Build | `npm run build` | The app compiles |

`npm run validate` runs everything against an ephemeral Postgres with an
auth-schema shim.

SQL tests are not optional for this work. RLS, generated columns, deferred
constraints and trigger behaviour cannot be tested from TypeScript, and the write
matrix in PRD.md §4.1 is exactly the kind of claim that must be proven against a
real database.

Two harness details worth keeping:

- macOS Homebrew PG16 needs `LC_ALL=C` or the postmaster aborts with "became
  multithreaded".
- A plpgsql `EXCEPTION` block **cannot catch a deferred constraint**: it fires at
  commit, and a subtransaction's commit does not run deferred triggers. Tests for
  deferred rejection use `set constraints all immediate` inside a rolled-back
  transaction, and prove the deferral separately with two updates under
  autocommit.

## 9. Settings as configuration, not constants

Production figures a business changes — forecast cartons per shift, shifts per
day, waste percentage, unit conversions, and the BOM recipes — live in the
`app_settings` singleton and `product_recipes`, editable by an admin.

`app_settings` is a singleton row (`id boolean primary key check (id)`), not a
key-value table, so a column typo fails at compile time instead of silently
reading null. RLS allows read to any authenticated user and `UPDATE` only to
admins — no insert, no delete, so a bug cannot empty the table and leave every
projection on defaults.

Two consequences that shaped the code:

**The recipe invariant is enforced on save.** Every recipe's ingredients must sum
to exactly `CARTON_LITRES` (9 L). A recipe that does not fill its carton is wrong
by construction, and this self-check is what caught the one real BOM data error.
Saving recipes goes through a `save_recipes(jsonb)` RPC because a save may
*remove* an ingredient: over the Data API that is upsert-then-delete, i.e. two
transactions, and the intermediate state does not fill a carton, so the deferred
constraint correctly rejects a valid edit. The RPC does delete-and-insert in one
transaction.

**Saving settings also writes `packaging_bom`.** `stock_balance_core` derives
stamp consumption from that table, so the ledger must deduct what the settings
say. The save reports a warning if that write fails, and a SQL test asserts the
two agree — that assertion is the real guard against a repeat of the 9-versus-12
drift.

## 10. Known open items

- **Days-left Level 2**: per-material supplier lead time and safety-stock reorder
  points. Needs supplier data from the business.
- **Edit and delete of a submitted record**: not built; the user declined. With
  the duplicate hard block in place, a typo is permanent and cannot be fixed by
  resubmitting.
- **Dispatch versus packaging divergence**: by design, per PRD.md §3.3.
