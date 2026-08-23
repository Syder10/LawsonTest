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
| `0001_extensions_types_helpers.sql` | Extensions, enum types (`shift_type`, `user_role`, `product_type`), `set_updated_at()`, and the RLS role helpers (`is_staff`, `is_admin`, `is_procurement_staff`). |
| `0002_reference_data.sql` | Reference tables + seed: `departments`, `stock_materials`, `consumable_materials`, `herb_types`. |
| `0003_profiles.sql` | `profiles` (1:1 with `auth.users`) + `handle_new_user()` auto-provision trigger + RLS. |
| `0004_production_records.sql` | The 7 typed production tables + shared RLS/indexes/triggers. |
| `0005_stock_records.sql` | Consolidated `stock_records` (replaces 5 old stock tables). |
| `0006_no_work_records.sql` | `no_work_records`. |
| `0007_inventory.sql` | `consumable_stock` (replaces 6 balance tables), `packaging_live_stocks`, `packaging_bom`, `raw_materials_received`, and the balance triggers. |
| `0008_gamification.sql` | `supervisor_streaks`, `supervisor_badges`. |
| `0009_seed.sql` | Initial balance/live-stock rows. |
| `0010_functions.sql` | `finished_goods_stock()` (derived finished-goods on-hand). |
| `0011_stock_counts.sql` | Derived stock ledger: `stock_counts` (baseline/reconciliation anchors) + `shift_rank`, `stock_balance_core`, `stock_opening`, `stock_remaining_asof`, `stock_ledger`, `record_stock_count`. |

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

## ⚠️ ACTION REQUIRED — verify the reconstructed trigger

The old repo did not contain the DB triggers the running app relied on. One
remains reconstructed and worth confirming against your live DB:

1. **`apply_raw_material_received`** (`0007_inventory.sql`) — updates
   `consumable_stock` when a PPE delivery/issue is logged. *High confidence*
   (derived directly from the submit payload).

Resolved: tax-stamp/carton consumption is no longer a trigger. The rates
(Bitters 9, Ginger 6 stamps per carton; 1 carton box per carton) are
user-confirmed, and the balance is **derived on read** (received events +
cartons produced × rate, anchored to management stock counts) — see
`0011_stock_counts.sql`. This self-corrects on edit/delete and cannot drift.

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
