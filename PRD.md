# PRD — Stock Management & Procurement Separation

Lawson Production Management · Bitters and Ginger production · Ghana

Status: **approved scope, not yet implemented.** Written 2026-09-06.

---

## 1. Why this exists

Today one role, `procurement`, does two unrelated jobs. It records physical
material movements (deliveries in, PPE issued out, physical counts) and it reads
the analytics that the buying office needs. Those are different people in the
building, and merging them has three consequences:

1. **The buying office can write to the ledger.** Anyone who can read a stock
   report can also log a receipt that permanently changes a balance. A stock
   count re-anchors the derived ledger, so a wrong count is not a display bug,
   it is a rewritten history.
2. **Deliveries out are a bare number with no destination.** The only trace of
   an outbound carton is `packaging_daily_records.quantity_cartons_loaded`. It
   records that cartons left. It does not record which vehicle, which driver,
   where they went, or who authorised it. When a customer disputes a delivery
   there is nothing to look at.
3. **There is no supplier invoice anywhere in the system.** A receipt records
   the quantity that arrived. It does not record what was ordered, from whom, at
   what price, or under which invoice number, so a received quantity cannot be
   checked against the document it arrived with.

This work separates the two concerns and then builds the stock side out into a
real inventory system: quantity produced, input invoices, and quantity going out
with full dispatch detail.

## 2. Users and what changes for them

| Role | Today | After |
|---|---|---|
| `supervisor` | Files production records for their department | Unchanged |
| `stock` | *does not exist* | **New.** Owns every physical movement: receipts, invoices, stock counts, dispatch |
| `procurement` | Logs receipts, issues PPE, reads stock reports | **Read-only.** Reads every stock screen, writes nothing |
| `manager` | Reads analytics, can reconcile | Unchanged, plus reads dispatch |
| `admin` | Everything, plus user and settings management | Unchanged, plus dispatch |

`procurement` becoming read-only is a **removal of capability from an existing
role**. Any account that must keep logging receipts has to be moved to `stock`
by an admin before this ships, or that person loses the ability to do their job.
That migration is a deployment step, not a code change — see §9.

## 3. Scope

### 3.1 In scope

**Role separation**
- A fourth operational role, `stock`, added to the `user_role` enum.
- `procurement` loses every write path: no receipts, no PPE issuance, no stock
  counts, no dispatch. It keeps read access to all stock screens.
- Navigation, guards and RLS all reflect the split, and each of the three is
  tested independently — a nav that hides a button is not access control.

**Stock management (the substantial part)**
- **Quantity produced.** Cartons produced per product per day, already captured
  by packaging records, surfaced on the stock dashboard as a first-class figure
  rather than only as an input to the finished-goods balance.
- **Input invoices.** A supplier invoice entity: header (supplier, invoice
  number, date, currency, total) plus lines (material, quantity, unit, unit
  cost). A receipt can reference an invoice line, so "what arrived" can be
  compared with "what we were billed for".
- **Quantity out / dispatch.** A dispatch record per outbound load: date, shift,
  vehicle registration, driver, destination or customer, waybill number,
  per-product cartons, and who released it. This is the delivery history the
  business currently has no record of.
- **Stock ledger, unchanged in model.** Derived-on-read balances stay exactly as
  they are (see architecture-essentials.md §3). Dispatch does **not** feed the
  ledger — see §3.3 for why that is deliberate.

**Procurement (read-only view)**
- The existing stock levels, days-left, run-out projections and receipts log,
  with every write affordance removed for `procurement` and the new dispatch and
  invoice history added as reads.

### 3.2 Out of scope

- Purchase orders and any approval workflow. An invoice is recorded as received,
  not requested and approved.
- Payments, ageing, or any accounting ledger. Invoice totals are recorded for
  reference and reconciliation, not posted anywhere.
- Editing or deleting a submitted record. This is a long-standing open item
  across the whole app and is unchanged here; a dispatch typo is corrected by a
  compensating entry, not an edit.
- Multi-warehouse or bin locations. There is one store.
- Barcode or scanner input.
- Supplier lead times and safety-stock reorder points ("days-left Level 2"),
  which remain open pending supplier data.

### 3.3 Explicitly decided: dispatch is a log, not a second count

`packaging_daily_records.quantity_cartons_loaded` stays exactly as it is, and
the finished-goods balance keeps deriving from it. The new `dispatches` table
records the same physical event in much more detail, but it is **not** wired
into the balance and **no variance report reconciles the two**.

This was decided deliberately. The alternative — making dispatch authoritative
and retiring the packaging field — would change what the finished-goods number
means and require every historical row to be re-sourced. The other alternative,
a variance report, was considered and rejected: it would produce a permanent
non-zero difference between a packaging supervisor's shift figure and a stock
keeper's per-load figures, which nobody has been given the authority to resolve.

The consequence, stated plainly because it will be noticed: **the sum of
dispatched cartons will not necessarily equal total cartons loaded, and the
system will not flag it.** Dispatch answers "where did the goods go"; the
packaging field answers "how many left". If the business later wants one number,
that is a separate decision with a data migration attached.

## 4. Functional requirements

### 4.1 Roles and access

- **FR-1** A `stock` role exists and is assignable from User Management.
- **FR-2** `stock` can create: raw-material receipts, supplier invoices and
  lines, stock counts, dispatches.
- **FR-3** `procurement` can read every stock screen and cannot write to any of
  the tables in FR-2. Enforced in RLS, in the route guard, and reflected in nav.
- **FR-4** `manager` and `admin` retain read access everywhere and keep the
  ability to record stock counts (management owns reconciliation).
- **FR-5** A `stock` user has no production-record submission rights and no user
  management.

### 4.2 Invoices

- **FR-6** A supplier invoice records: supplier name, invoice number, invoice
  date, currency, declared total, optional remarks.
- **FR-7** Invoice number is unique per supplier. The same number from two
  different suppliers is legitimate; the same number twice from one supplier is
  a duplicate entry and is rejected.
- **FR-8** An invoice has one or more lines: material, quantity, unit, unit
  cost, line total.
- **FR-9** The sum of line totals is computed and displayed beside the declared
  header total. A mismatch is shown as a warning, **not** blocked — real
  invoices carry freight, tax and discounts that the line model does not
  represent, and refusing to record a real document because our arithmetic
  disagrees would push users to enter a fake total.
- **FR-10** A receipt may reference an invoice line. Where it does, the screen
  shows quantity received against quantity invoiced and the running difference.
- **FR-11** A receipt with no invoice is still valid. Goods arrive before
  paperwork; blocking that would stop the ledger recording reality.

### 4.3 Dispatch

- **FR-12** A dispatch records: date, shift, vehicle registration, driver name,
  destination (customer or place), waybill number, cartons per product, released
  by, optional remarks.
- **FR-13** At least one product quantity must be greater than zero. A dispatch
  of nothing is a data-entry accident.
- **FR-14** Waybill number, where given, is unique. It is the document number
  the business will search by.
- **FR-15** Dispatch history is filterable by date range, vehicle, driver and
  destination, and exportable.
- **FR-16** The stock dashboard shows dispatched cartons for the window per
  product, per vehicle and per destination.

### 4.4 Stock dashboard (the "professional stock system" view)

- **FR-17** Finished goods on hand per product (existing derived balance).
- **FR-18** Cartons produced in the window per product, per day.
- **FR-19** Cartons dispatched in the window per product, with vehicle, driver
  and destination breakdowns.
- **FR-20** Every material's remaining balance, burn rate, operating days left
  and run-out date, exactly as today, with its unit and its per-container
  equivalent.
- **FR-21** Receipts and issuance log for the window.
- **FR-22** Stock counts and variances.
- **FR-23** Invoice log for the window, with the received-versus-invoiced
  position of each line.

### 4.5 Non-functional

- **NFR-1** Every new table has RLS enabled with explicit policies per role, and
  a SQL behaviour test proving `procurement` cannot write and `stock` can.
- **NFR-2** Every derived figure has exactly one declaration, shared between the
  route that computes it and the UI that renders it. The `daysLeft` versus
  `operatingDaysLeft` incident is the reason this is a requirement.
- **NFR-3** Money is stored as `numeric`, never a float, and its currency is
  stored beside it.
- **NFR-4** Mobile-first. The store is run from a phone; every new table gets
  the `DataTable` card fallback, and no touch target is under 44px.
- **NFR-5** The existing gates stay green: unit tests, SQL behaviour tests,
  `tsc` at zero, eslint at zero errors, and a clean build.

## 5. What "professional stock system" means here, concretely

The user's phrasing was: *see the quantity of produced, input invoices and
quantity loaded or going out for delivery, which car, which driver, to where.*
Translated into the four questions the dashboard must answer at a glance:

1. **What did we make?** Cartons produced per product, per day, in the window.
2. **What came in, and does it match the paperwork?** Receipts, the invoice they
   belong to, and the difference.
3. **What went out, and to whom?** Every dispatch with vehicle, driver,
   destination and waybill.
4. **What are we about to run out of?** The existing days-left projection, which
   is already the strongest part of the system.

## 6. Data model summary

New tables:

- `invoices` — supplier, invoice number, date, currency, declared total.
  Unique on (supplier, invoice number).
- `invoice_lines` — invoice, material, quantity, unit, unit cost, generated line
  total.
- `dispatches` — date, shift, vehicle, driver, destination, waybill, released
  by, remarks.
- `dispatch_lines` — dispatch, product, cartons.

Changed:

- `user_role` enum gains `stock`.
- `raw_materials_received` gains a nullable `invoice_line_id`.
- Role helper functions in SQL split into "can write stock" and "can read
  stock".

Unchanged, deliberately: `stock_records`, `blowing_daily_records`,
`consumable_stock`, `stock_counts`, the balance functions, and
`packaging_daily_records` including `quantity_cartons_loaded`.

## 7. Phasing

Each phase ends at a review gate. Nothing in a later phase starts before the
previous phase's gate is green.

- **Phase 1 — Database.** New migration: enum value, role helper split, four new
  tables with RLS, the `invoice_line_id` column, and SQL behaviour tests
  covering the write matrix. Validated on a real Postgres 16 via the existing
  ephemeral harness.
- **Phase 2 — Domain and lib.** Types, the dispatch and invoice domain modules,
  guard helpers (`requireStockWrite`, `requireStockRead`), role labels and nav.
  Unit tests.
- **Phase 3 — API.** Routes for invoices, dispatches and the reshaped stock
  report. Existing write routes moved behind the write guard.
- **Phase 4 — UI.** Stock dashboard, dispatch entry and history, invoice entry
  and history, and the read-only procurement view.

## 8. Risks

| Risk | Mitigation |
|---|---|
| `procurement` accounts lose write access on deploy | §9 migration step, run before or with the deploy |
| Dispatch and packaging figures diverge visibly | Documented in §3.3 and stated in the UI, by design |
| Invoice totals disagree with line sums | Warned, never blocked (FR-9) |
| A new role means a new RLS surface to get wrong | Write matrix asserted in SQL tests, not just in guards |

## 9. Deployment steps

1. Apply the migration.
2. For each existing `procurement` account that physically handles stock, set
   `profiles.role = 'stock'`. Accounts that only read stay `procurement`.
3. Verify: a `stock` login can log a receipt; a `procurement` login sees the
   same screens with no write buttons and is refused by the API if it tries.

## 10. Open items, carried forward unchanged

- Supplier lead times and safety stock (days-left Level 2).
- Edit and delete of a submitted record, which the user has previously declined.
