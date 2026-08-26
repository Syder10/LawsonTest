# Database — Lawson Production Management

The database is defined as **ordered, idempotent-friendly migrations** in
`supabase/migrations/`. This replaces the old single `scripts/schema.sql`, which
could not rebuild the database (it had no triggers, functions, or views even
though the app depended on them).

## Run order

Apply the files in numeric order. Each is self-contained and depends only on the
ones before it.

| File | Contents |
|------|----------|
| `0001_foundation.sql` | Extensions, enum types (`shift_type`, `user_role`, `product_type`), `set_updated_at()`, and the RLS role helpers (`current_user_role`, `is_staff`, `is_admin`, `is_procurement_staff`). |
| `0002_reference_data.sql` | Reference tables + seed: `departments`, `stock_materials`, `consumable_materials`, `herb_types`, `packaging_bom` (the stamp/carton rates the ledger derives consumption from). |
| `0003_identity.sql` | `profiles` (1:1 with `auth.users`), the resilient `handle_new_user()` auto-provision trigger, RLS, and the guard that stops a supervisor changing their own `role` / `department` / `group_number`. |
| `0004_records.sql` | Everything supervisors and procurement write to: the 7 typed production tables, consolidated `stock_records`, `no_work_records`, `consumable_stock` + `raw_materials_received`, `supervisor_streaks` / `supervisor_badges`, shared RLS/indexes/triggers, the PPE seed, and the one-record-per-shift unique indexes. Requires **PG15+** (`NULLS NOT DISTINCT`). |
| `0005_ledger_and_grants.sql` | The derived stock ledger — `stock_counts` + `shift_rank`, `stock_balance_core`, `stock_opening`, `stock_remaining_asof`, `stock_ledger`, `record_stock_count`, `finished_goods_stock()` — then the Data API grants. **Must run last.** |

> Consolidated from a previous 15-file set. The squash was verified schema-identical
> with `scripts/verify-squash.sh`, which diffs four independent projections
> (`pg_dump` structure, privileges/RLS/policies, seed rows, and an md5 of every
> function body) between the two sets. If you split or merge these files again,
> run that script.

> **If every request fails with `42501 permission denied for schema public`** while
> the SQL editor works fine, you dropped and recreated the `public` schema at some
> point. That destroys Supabase's default grants; the SQL editor still works
> because it connects as the schema *owner*. Apply `0005_ledger_and_grants.sql`.

### Option A — Supabase SQL Editor
Paste the contents of each file, in order, and run.

### Option B — psql
```bash
for f in supabase/migrations/*.sql; do
  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f "$f"
done
```

### Option C — Supabase CLI
The files follow the CLI's `supabase/migrations/` convention and can be applied
with `supabase db push` (or `supabase db reset` locally).

---

## First-time setup — create the first admin

User Management (`/dashboard/admin/users`) requires an admin account, but nothing
in the app can create the first one. Do it once in SQL:

1. Create the account under **Authentication → Users → Add user** (or sign up).
   `handle_new_user()` provisions a `profiles` row automatically, as a
   **supervisor** — the Auth dashboard sets no role metadata.
2. Open **`supabase/bootstrap-admin.sql`**, change the email near the top to your
   login, and run it in the SQL editor. It backfills any missing profile rows and
   promotes your account to `admin`.
3. Sign in through the admin form (click the small dot at the bottom-right of the
   login page three times to reveal it). Create everyone else in the app.

### `profiles.role` is the only source of truth

Authorization reads **`public.profiles.role`** and nothing else
(`app/dashboard/page.tsx`, `lib/auth/guards.ts`, `app/login/actions.ts`).

`handle_new_user()` is an **AFTER INSERT** trigger: it reads
`raw_user_meta_data->>'role'` exactly **once**, when the account is created.
Editing an auth user's metadata later has **no effect** — nothing re-reads it.
Change roles in User Management, or with SQL against `public.profiles`.

Run **`supabase/diagnose-roles.sql`** to see `profiles.role` next to the auth
metadata role for every account, with a verdict column.

### Common login errors

| Message | Cause | Fix |
|---|---|---|
| "This login exists but has no profile record yet." | An `auth.users` row with no `public.profiles` row. Usually the migrations were re-run, rebuilding `public` while `auth` survived. | Run `bootstrap-admin.sql` (step 1 backfills). |
| "Your profile could not be loaded because of a server configuration problem." | The profiles read errored — a bad `profiles_select` policy, or `SUPABASE_SERVICE_ROLE_KEY` unset. | Re-apply `0003_identity.sql`; check env vars. Server logs carry the exact error. |
| "This is a Supervisor account, so it cannot sign in here…" | The account's role is genuinely lower than the form requires. | Promote it, then sign out and back in. |

---

## Behaviour tests

`supabase/tests/` holds SQL suites that run against a throwaway Postgres with all
migrations applied. `scripts/validate-ledger.sh` runs them locally (then vitest,
tsc and the build); `.github/workflows/ci.yml` runs the same files in CI.

| File | Covers |
|---|---|
| `_shim.sql` | Test-only stand-in for Supabase's `auth` schema. Never applied to a real project. |
| `01_ledger.sql` | Out-of-order shift self-healing, reconciliation variance, preform/stamp/carton derived balances, no drift on edit. |
| `02_security.sql` | The profile privilege guard (incl. that admin + service-role paths still work), the duplicate-submission guards and their exemptions, and `handle_new_user`'s tolerance of bad metadata. |
| `03_api_grants.sql` | The Data API grants, the "every public table has RLS" invariant those grants depend on, and that `anon` cannot execute the SECURITY DEFINER stock functions. |

```bash
npm run validate     # everything
npm run test:run     # unit tests only
```

---

## ⚠️ ACTION REQUIRED — verify the reconstructed trigger

The old repo did not contain the DB triggers the running app relied on. One
remains reconstructed and worth confirming against your live DB:

1. **`apply_raw_material_received`** (`0004_records.sql`) — updates
   `consumable_stock` when a PPE delivery/issue is logged. *High confidence*
   (derived directly from the submit payload).

Resolved: tax-stamp/carton consumption is no longer a trigger. The rates
(Bitters 9, Ginger 6 stamps per carton; 1 carton box per carton) are
user-confirmed, and the balance is **derived on read** (received events +
cartons produced × rate, anchored to management stock counts) — see
`0005_ledger_and_grants.sql`. This self-corrects on edit/delete and cannot drift.

If you still want to cross-check the old hidden logic, dump the live definitions:

```sql
-- 1. Trigger functions
select p.proname as function_name, pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by p.proname;

-- 2. Triggers (which table, when, calling what)
select event_object_table, trigger_name, action_timing,
       event_manipulation, action_statement
from information_schema.triggers
where trigger_schema = 'public'
order by event_object_table, trigger_name;

-- 3. Views (e.g. leaderboard_weekly)
select table_name, view_definition
from information_schema.views
where table_schema = 'public'
order by table_name;
```

If nothing comes back for (1)/(2), the logic lived only in the app and the
reconstruction stands as the new source of truth.

---

## Notable design decisions

- **Consolidation.** `stock_records` replaces `alcohol_stock_level_records`,
  `caps_stock_records`, `labels_stock_records`, `caramel_stock_records`, and
  `herbs_stock_records` (keyed by `material`). `consumable_stock` replaces the
  six identical singleton balance tables (keyed by `material, product`).
- **Generated columns.** Derived values are computed by the DB and cannot drift:
  blowing `final_production`, blending/ginger `*_litres`, concentrate
  `total_alcohol_used_litres`. The app should stop sending these on insert.
- **Derived stock ledger.** Stock balances (alcohol/caps/labels/caramel/herb and
  blowing preforms) are NOT stored. Supervisors record only `received`/`used` per
  shift; opening/remaining are computed on read by chaining movements in
  chronological order (date → Morning → Afternoon → Night), anchored to the
  latest management `stock_count`. This makes out-of-order/late shift submissions
  self-heal. Baselines and physical-count corrections are management-only
  (`record_stock_count`), and each records a counted-vs-computed `variance`.
- **Real RLS.** Supervisors read/write their own rows; managers & admins see
  everything; procurement sees inventory. Enforced by the database, not by
  per-route checks.
- **`leaderboard_weekly` view is intentionally NOT recreated.** It duplicated the
  shift-rotation/on-time logic that lives in `lib/shift-config.ts`. The
  leaderboard is computed in the API layer (Phase 3) from that single source of
  truth instead of maintaining the same rules in SQL.
- **`user_id` is `ON DELETE SET NULL`** (was `CASCADE`, which deleted a user's
  entire production history). `supervisor_name` is kept as an audit snapshot.

## Environment variables

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...   # only used by the admin user-management path now
```
