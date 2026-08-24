-- ============================================================================
-- 0013_prevent_duplicate_submissions.sql
--
-- One record per (record type, date, shift, product/variant).
--
-- The problem
-- -----------
-- Nothing stopped a supervisor submitting the same record twice for one
-- (date, shift). Gamification tolerated it (it de-duplicates by building set
-- keys of `date|shift`), but the STOCK LEDGER does not: stock_balance_core()
-- sums quantity_received / quantity_used over every matching movement row, so an
-- accidental double-submit silently double-counts received and used stock and
-- corrupts every downstream balance, variance, burn rate and days-left figure.
--
-- Enforced in the database, on purpose. As with 0012, the API is not the
-- boundary: a retried fetch, a double-tapped Submit button on a slow phone
-- connection, or a direct PostgREST call all bypass any app-level check.
--
-- Chosen behaviour: HARD BLOCK. A second submission raises unique_violation
-- (23505), which app/api/records/submit maps to HTTP 409 with a readable
-- message. (The alternative — overwrite the earlier row — was considered and
-- rejected: it silently rewrites history with no audit trail.)
--
-- KEY DESIGN NOTES
-- ----------------
-- • stock_records is keyed WITHOUT department/user_id, by (material, date,
--   shift, product, variant). The ledger aggregates purely by material, so two
--   rows for the same material+shift double-count no matter who filed them or
--   under which department.
--
-- • Production tables ARE keyed by department, because
--   concentrate_alcohol_records is shared by two departments (Concentrate and
--   Alcohol and Blending — see RECORD_TYPES in lib/domain/record-types.ts), and
--   each legitimately files its own row for the same date+shift.
--
-- • NULLS NOT DISTINCT is required, not cosmetic. Postgres treats NULLs as
--   DISTINCT in a unique index by default, so without it two rows with
--   product IS NULL (alcohol, caps, preform…) would BOTH be accepted and the
--   index would protect nothing for exactly the materials that need it most.
--   It needs PG15+; Supabase and this repo's test harness both run PG16.
--   (The obvious alternative — a coalesce(product::text,'') expression index —
--   is impossible: casting an enum to text is only STABLE, not IMMUTABLE, so
--   Postgres rejects it in an index expression.)
--
-- • extraction_monitoring_records is DELIBERATELY EXEMPT: it records one row
--   per tank per shift (the form submits up to 20), so duplicates are the
--   expected shape, not an error.
-- ============================================================================

-- ── Consolidated stock ledger (alcohol / caps / labels / caramel / herb) ─────
-- labels + caramel are per product; herb is per variant; the rest use neither.
create unique index stock_records_one_per_shift_uidx
  on public.stock_records (material, date, shift, product, variant)
  nulls not distinct;

comment on index public.stock_records_one_per_shift_uidx is
  'One movement row per material+product/variant per shift: a duplicate would '
  'double-count received/used in the derived ledger (stock_balance_core).';

-- ── Production tables ────────────────────────────────────────────────────────
create unique index blowing_daily_records_one_per_shift_uidx
  on public.blowing_daily_records (department, date, shift);

create unique index alcohol_blending_daily_records_one_per_shift_uidx
  on public.alcohol_blending_daily_records (department, date, shift, product)
  nulls not distinct;

create unique index ginger_production_records_one_per_shift_uidx
  on public.ginger_production_records (department, date, shift);

create unique index filling_line_daily_records_one_per_shift_uidx
  on public.filling_line_daily_records (department, date, shift, product)
  nulls not distinct;

-- packaging.product is NOT NULL, so plain uniqueness suffices.
create unique index packaging_daily_records_one_per_shift_uidx
  on public.packaging_daily_records (department, date, shift, product);

create unique index concentrate_alcohol_records_one_per_shift_uidx
  on public.concentrate_alcohol_records (department, date, shift);

-- ── No-work records ──────────────────────────────────────────────────────────
-- A department/shift either operated or it didn't; one declaration is enough.
create unique index no_work_records_one_per_shift_uidx
  on public.no_work_records (department, date, shift);

-- NOTE: no index on extraction_monitoring_records — multi-tank by design.
