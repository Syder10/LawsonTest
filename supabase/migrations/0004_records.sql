-- ============================================================================
-- 0004_records.sql
-- Every table supervisors and procurement write to: the 7 typed production
-- tables, the consolidated stock ledger, no-work records, consumable/PPE
-- inventory, and the gamification tables — plus their RLS, indexes and the
-- one-record-per-shift guards.
--
-- Key improvements vs the original schema:
--   • Derived fields are GENERATED columns — the DB computes them, so the value
--     can never drift from its inputs and the frontend/API no longer duplicate
--     the arithmetic (old code computed these in 3 places):
--       blowing.final_production          = total_produced - waste_pcs
--       blending.*_litres                 = drums*250 / tanks*900
--       ginger.*_litres                   = tanks*300 / tanks*1000
--       concentrate.total_alcohol_used    = alcohol_70 + alcohol_80
--     (Blowing preform stock is NOT a generated column: it is a derived ledger —
--      received/used only, balance computed on read; see 0005.)
--   • Numeric input columns are NOT NULL DEFAULT 0 (clean inputs for the
--     generated columns; no silent NULL arithmetic).
--   • user_id is ON DELETE SET NULL (was CASCADE — deleting a user destroyed
--     their production history). supervisor_name is retained as an audit
--     snapshot so a record stays attributable even if the profile is removed.
--   • date / shift / department are NOT NULL with proper types + FK.
-- ============================================================================

-- ── Blowing: Daily Records (Preform Usage) ──────────────────────────────────
-- Preforms are a stock ledger like the stock_records materials: supervisors
-- record only received + used; the opening/closing balance is DERIVED on read
-- (material 'preform') by the balance functions in 0005, and the baseline is set
-- via a management stock_count. So there is no stored opening_stock_bags /
-- closing_stock_bags here — only the movement columns.
create table public.blowing_daily_records (
  id                     uuid primary key default gen_random_uuid(),
  date                   date not null,
  shift                  public.shift_type not null,
  group_number           smallint check (group_number between 1 and 3),
  department             text not null references public.departments(name),
  supervisor_name        text,
  quantity_received_bags numeric not null default 0 check (quantity_received_bags >= 0),
  preforms_used_bags     numeric not null default 0 check (preforms_used_bags >= 0),
  total_produced         numeric not null default 0 check (total_produced >= 0),
  waste_pcs              numeric not null default 0 check (waste_pcs >= 0),
  final_production       numeric generated always as (total_produced - waste_pcs) stored,
  bottles_given_out      numeric not null default 0 check (bottles_given_out >= 0),
  remarks                text,
  user_id                uuid references public.profiles(id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- ── Alcohol and Blending: Daily Records for Alcohol and Blending ─────────────
create table public.alcohol_blending_daily_records (
  id                                    uuid primary key default gen_random_uuid(),
  date                                  date not null,
  shift                                 public.shift_type not null,
  group_number                          smallint check (group_number between 1 and 3),
  department                            text not null references public.departments(name),
  product                               public.product_type,
  supervisor_name                       text,
  alcohol_transferred_drums             numeric not null default 0 check (alcohol_transferred_drums >= 0),
  alcohol_transferred_litres            numeric generated always as (alcohol_transferred_drums * 250) stored,
  finished_products_transferred_tanks   numeric not null default 0 check (finished_products_transferred_tanks >= 0),
  finished_products_transferred_litres  numeric generated always as (finished_products_transferred_tanks * 900) stored,
  number_of_staff                       integer check (number_of_staff >= 0),
  hourly_work                           text,
  remarks                               text,
  user_id                               uuid references public.profiles(id) on delete set null,
  created_at                            timestamptz not null default now(),
  updated_at                            timestamptz not null default now()
);

-- ── Alcohol and Blending: Ginger Production ──────────────────────────────────
create table public.ginger_production_records (
  id                       uuid primary key default gen_random_uuid(),
  date                     date not null,
  shift                    public.shift_type not null,
  group_number             smallint check (group_number between 1 and 3),
  department               text not null references public.departments(name),
  supervisor_name          text,
  quantity_raw_ginger_bags numeric not null default 0 check (quantity_raw_ginger_bags >= 0),
  quantity_grinded_ginger  numeric not null default 0 check (quantity_grinded_ginger >= 0),
  alcohol_used_tanks       numeric not null default 0 check (alcohol_used_tanks >= 0),
  alcohol_used_litres      numeric generated always as (alcohol_used_tanks * 300) stored,
  finished_product_tanks   numeric not null default 0 check (finished_product_tanks >= 0),
  finished_product_litres  numeric generated always as (finished_product_tanks * 1000) stored,
  remarks                  text,
  user_id                  uuid references public.profiles(id) on delete set null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- ── Alcohol and Blending: Extraction Monitoring Records ──────────────────────
create table public.extraction_monitoring_records (
  id                    uuid primary key default gen_random_uuid(),
  date                  date not null,
  shift                 public.shift_type not null,
  group_number          smallint check (group_number between 1 and 3),
  department            text not null references public.departments(name),
  product               public.product_type,
  supervisor_name       text,
  tank_number           text,
  beginning_date        date,
  time                  time,
  alcohol_percentage    text,
  expected_maturity_date date,
  prepared_by           text,
  remarks               text,
  user_id               uuid references public.profiles(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ── Filling Line: Filling Line Daily Records ─────────────────────────────────
create table public.filling_line_daily_records (
  id               uuid primary key default gen_random_uuid(),
  date             date not null,
  shift            public.shift_type not null,
  group_number     smallint check (group_number between 1 and 3),
  department       text not null references public.departments(name),
  product          public.product_type,
  supervisor_name  text,
  bottles_wasted   numeric not null default 0 check (bottles_wasted >= 0),
  bottles_rejected numeric not null default 0 check (bottles_rejected >= 0),
  total_production numeric not null default 0 check (total_production >= 0),
  number_of_staff  integer check (number_of_staff >= 0),
  hourly_work      text,
  remarks          text,
  user_id          uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ── Packaging: Packaging Daily Records ───────────────────────────────────────
-- Tax-stamp and carton consumption is DERIVED from these rows × packaging_bom
-- (see stock_balance_core in 0005) rather than maintained by a trigger, so it
-- self-corrects when a record is edited or deleted.
create table public.packaging_daily_records (
  id                        uuid primary key default gen_random_uuid(),
  date                      date not null,
  shift                     public.shift_type not null,
  group_number              smallint check (group_number between 1 and 3),
  department                text not null references public.departments(name),
  product                   public.product_type not null,
  supervisor_name           text,
  quantity_cartons_produced numeric not null default 0 check (quantity_cartons_produced >= 0),
  number_cartons_wasted     numeric not null default 0 check (number_cartons_wasted >= 0),
  quantity_cartons_loaded   numeric not null default 0 check (quantity_cartons_loaded >= 0),
  number_of_staff           integer check (number_of_staff >= 0),
  hourly_work               text,
  remarks                   text,
  user_id                   uuid references public.profiles(id) on delete set null,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

-- ── Concentrate: Daily Records Alcohol For Concentrate ───────────────────────
create table public.concentrate_alcohol_records (
  id                       uuid primary key default gen_random_uuid(),
  date                     date not null,
  shift                    public.shift_type not null,
  group_number             smallint check (group_number between 1 and 3),
  department               text not null references public.departments(name),
  supervisor_name          text,
  number_tanks_70          numeric not null default 0 check (number_tanks_70 >= 0),
  alcohol_used_70_litres   numeric not null default 0 check (alcohol_used_70_litres >= 0),
  water_70_litres          numeric not null default 0 check (water_70_litres >= 0),
  number_tanks_80          numeric not null default 0 check (number_tanks_80 >= 0),
  alcohol_used_80_litres   numeric not null default 0 check (alcohol_used_80_litres >= 0),
  water_80_litres          numeric not null default 0 check (water_80_litres >= 0),
  total_alcohol_used_litres numeric generated always as
                             (alcohol_used_70_litres + alcohol_used_80_litres) stored,
  remarks                  text,
  user_id                  uuid references public.profiles(id) on delete set null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- ── Shared machinery: RLS + indexes + updated_at, applied to all 7 tables ────
-- Every production table gets the same access model:
--   SELECT/INSERT/UPDATE own rows; managers & admins see/act on everything.
-- Indexes target the three hot query paths:
--   (user_id,date,shift)         "have I already submitted this shift?"
--   (date)                        KPI / date-range aggregation
--   (department,group_number,date) leaderboard / MVP grouping
do $$
declare
  t text;
  production_tables text[] := array[
    'blowing_daily_records',
    'alcohol_blending_daily_records',
    'ginger_production_records',
    'extraction_monitoring_records',
    'filling_line_daily_records',
    'packaging_daily_records',
    'concentrate_alcohol_records'
  ];
begin
  foreach t in array production_tables loop
    execute format('alter table public.%I enable row level security;', t);

    execute format($f$
      create policy "select_own_or_staff" on public.%I for select to authenticated
      using (user_id = auth.uid() or public.is_staff());
    $f$, t);

    execute format($f$
      create policy "insert_own_or_staff" on public.%I for insert to authenticated
      with check (user_id = auth.uid() or public.is_staff());
    $f$, t);

    execute format($f$
      create policy "update_own_or_staff" on public.%I for update to authenticated
      using (user_id = auth.uid() or public.is_staff())
      with check (user_id = auth.uid() or public.is_staff());
    $f$, t);

    execute format('create index %I on public.%I (user_id, date, shift);',        t || '_user_date_shift_idx', t);
    execute format('create index %I on public.%I (date);',                        t || '_date_idx', t);
    execute format('create index %I on public.%I (department, group_number, date);', t || '_dept_group_date_idx', t);

    execute format($f$
      create trigger %I before update on public.%I
      for each row execute function public.set_updated_at();
    $f$, t || '_set_updated_at', t);
  end loop;
end $$;

-- ============================================================================
-- stock_records
-- CONSOLIDATION: one table replaces FIVE near-identical stock ledgers from the
-- old schema:
--   alcohol_stock_level_records  -> material = 'alcohol'
--   caps_stock_records           -> material = 'caps'
--   labels_stock_records         -> material = 'labels'  (per product)
--   caramel_stock_records        -> material = 'caramel' (per product)
--   herbs_stock_records          -> material = 'herb'    (per variant + checked_by)
--
-- LEDGER MODEL: supervisors record ONLY the movements they actually observed on
-- their shift — quantity_received and quantity_used. There is NO stored opening
-- or remaining. Opening and remaining are DERIVED on read by chaining every
-- shift's movements in true chronological order (date -> Morning -> Afternoon ->
-- Night), anchored to the latest management stock_count. See 0005.
--
-- Why derived, not stored: a frozen opening copied from "whichever row was
-- submitted last" corrupts the chain whenever shifts are entered out of order,
-- and cannot self-heal. Deriving from the ordered movement log means a late
-- Afternoon submission automatically corrects itself AND every later shift.
-- ============================================================================
create table public.stock_records (
  id                uuid primary key default gen_random_uuid(),
  date              date not null,
  shift             public.shift_type not null,
  group_number      smallint check (group_number between 1 and 3),
  department        text not null references public.departments(name),
  material          text not null references public.stock_materials(code),
  product           public.product_type,                 -- labels, caramel
  variant           text references public.herb_types(name) on update cascade, -- herb type
  supervisor_name   text,
  quantity_received numeric not null default 0 check (quantity_received >= 0),
  quantity_used     numeric not null default 0 check (quantity_used >= 0),
  destination       text,      -- alcohol / caps / labels / caramel
  checked_by        text,      -- herbs
  remarks           text,
  user_id           uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Hot paths:
--   ledger derivation (all movements for a material/product/variant, chained by date)
create index stock_records_continuity_idx
  on public.stock_records (material, product, variant, date, created_at);
--   "already submitted this shift?" + KPI/date + leaderboard grouping
create index stock_records_user_date_shift_idx on public.stock_records (user_id, date, shift);
create index stock_records_date_idx            on public.stock_records (date);
create index stock_records_dept_group_date_idx on public.stock_records (department, group_number, date);

create trigger stock_records_set_updated_at
  before update on public.stock_records
  for each row execute function public.set_updated_at();

alter table public.stock_records enable row level security;

create policy "select_own_or_staff" on public.stock_records for select to authenticated
  using (user_id = auth.uid() or public.is_staff());

create policy "insert_own_or_staff" on public.stock_records for insert to authenticated
  with check (user_id = auth.uid() or public.is_staff());

create policy "update_own_or_staff" on public.stock_records for update to authenticated
  using (user_id = auth.uid() or public.is_staff())
  with check (user_id = auth.uid() or public.is_staff());

-- ============================================================================
-- no_work_records
-- Logged when a department/shift did not operate. Counts toward streak/
-- leaderboard as a valid (on-time) shift outcome, so it carries the same
-- date/shift/group/department envelope as a production record.
-- ============================================================================
create table public.no_work_records (
  id              uuid primary key default gen_random_uuid(),
  date            date not null,
  shift           public.shift_type not null,
  group_number    smallint check (group_number between 1 and 3),
  department      text not null references public.departments(name),
  supervisor_name text,
  reason          text not null,
  user_id         uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index no_work_records_user_date_shift_idx on public.no_work_records (user_id, date, shift);
create index no_work_records_date_idx            on public.no_work_records (date);

alter table public.no_work_records enable row level security;

create policy "select_own_or_staff" on public.no_work_records for select to authenticated
  using (user_id = auth.uid() or public.is_staff());

create policy "insert_own_or_staff" on public.no_work_records for insert to authenticated
  with check (user_id = auth.uid() or public.is_staff());

create policy "update_own_or_staff" on public.no_work_records for update to authenticated
  using (user_id = auth.uid() or public.is_staff())
  with check (user_id = auth.uid() or public.is_staff());

-- ============================================================================
-- Consumable / PPE inventory
--
-- CONSOLIDATION: consumable_stock replaces SIX identical singleton tables
--   (tax_stamp_stock, carton_stock, seal_tape_stock, hair_net_stock,
--    nose_mask_stock, gloves_stock). It holds ONLY the PPE running totals;
--    tax_stamp + carton moved to the derived ledger (stock_counts + on-read
--    balance), so edits/deletes self-correct and balances can't drift negative.
-- ============================================================================
create table public.consumable_stock (
  id                 uuid primary key default gen_random_uuid(),
  material           text not null references public.consumable_materials(code),
  product            public.product_type,          -- only cartons are per-product
  remaining_pcs      bigint not null default 0,
  total_received_pcs bigint not null default 0,
  total_used_pcs     bigint not null default 0,
  last_updated_at    timestamptz not null default now(),
  constraint consumable_stock_material_product_key unique nulls not distinct (material, product)
);

-- ── raw_materials_received: append-only event log of deliveries / issues ─────
create table public.raw_materials_received (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references public.profiles(id) on delete set null,
  received_by       text,
  date              date not null,
  material_type     text not null check (material_type in
                      ('tax_stamp','carton_bitters','carton_ginger','seal_tape','hair_net','nose_mask','gloves')),
  stamp_boxes       integer not null default 0,
  stamp_total_coils integer not null default 0,
  stamp_total_pcs   bigint  not null default 0,
  carton_total_pcs  integer not null default 0,
  ppe_boxes_in      integer not null default 0,
  ppe_pcs_in        integer not null default 0,
  ppe_given_out     integer not null default 0,
  ppe_given_unit    text    not null default 'Boxes',
  ppe_given_pcs     integer not null default 0,
  ppe_given_to      text,
  remarks           text,
  created_at        timestamptz not null default now()
);

create index raw_materials_received_date_idx     on public.raw_materials_received (date);
create index raw_materials_received_material_idx  on public.raw_materials_received (material_type);

-- ── Trigger: apply a received/issued event to the running balance ────────────
-- SECURITY DEFINER so the balance update bypasses RLS (the submitter has no
-- direct write grant on consumable_stock — only this trigger maintains it).
--
-- Only PPE keeps a stored running total here. tax_stamp and carton are a DERIVED
-- ledger (received here + consumed from packaging × BOM, balanced on read by
-- stock_balance_core in 0005) — their received events are still logged in
-- raw_materials_received, but no consumable_stock total is maintained for them.
create or replace function public.apply_raw_material_received()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.material_type in ('seal_tape','hair_net','nose_mask','gloves') then
    insert into public.consumable_stock
        (material, product, remaining_pcs, total_received_pcs, total_used_pcs, last_updated_at)
    values (new.material_type, null, new.ppe_pcs_in - new.ppe_given_pcs, new.ppe_pcs_in, new.ppe_given_pcs, now())
    on conflict on constraint consumable_stock_material_product_key do update
      set remaining_pcs      = consumable_stock.remaining_pcs      + excluded.remaining_pcs,
          total_received_pcs = consumable_stock.total_received_pcs + excluded.total_received_pcs,
          total_used_pcs     = consumable_stock.total_used_pcs     + excluded.total_used_pcs,
          last_updated_at    = now();
  end if;
  -- tax_stamp / carton_bitters / carton_ginger: derived ledger, nothing to do.
  return new;
end;
$$;

create trigger raw_materials_received_apply
  after insert on public.raw_materials_received
  for each row execute function public.apply_raw_material_received();

alter table public.consumable_stock       enable row level security;
alter table public.raw_materials_received enable row level security;

-- Balances: readable by procurement/manager/admin. Writes happen only through
-- the SECURITY DEFINER trigger above (+ admin for manual fixes).
create policy "consumable_stock_read"  on public.consumable_stock for select to authenticated using (public.is_procurement_staff());
create policy "consumable_stock_admin" on public.consumable_stock for all    to authenticated using (public.is_admin()) with check (public.is_admin());

-- Received log: procurement staff read & append.
create policy "raw_materials_read"   on public.raw_materials_received for select to authenticated using (public.is_procurement_staff());
create policy "raw_materials_insert" on public.raw_materials_received for insert to authenticated with check (public.is_procurement_staff());

-- ============================================================================
-- Gamification: supervisor streaks & badges
--
-- Fixes vs old schema:
--   • supervisor_badges gains UNIQUE(user_id, badge_type) — the app upserts
--     badges with onConflict "user_id,badge_type", which could not have worked
--     without this constraint.
--   • shift type columns use the shift_type enum.
--   • user_id is the primary key of supervisor_streaks (1 row per user).
--
-- Streak/badge WRITES go through the privileged service path; RLS grants reads.
-- ============================================================================
create table public.supervisor_streaks (
  user_id         uuid primary key references public.profiles(id) on delete cascade,
  current_streak  integer not null default 0 check (current_streak >= 0),
  longest_streak  integer not null default 0 check (longest_streak >= 0),
  last_shift_date date,
  last_shift_type public.shift_type,
  updated_at      timestamptz not null default now()
);

create trigger supervisor_streaks_set_updated_at
  before update on public.supervisor_streaks
  for each row execute function public.set_updated_at();

create table public.supervisor_badges (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  badge_type text not null,
  earned_at  timestamptz not null default now(),
  unique (user_id, badge_type)
);

create index supervisor_badges_user_idx on public.supervisor_badges (user_id);

alter table public.supervisor_streaks enable row level security;
alter table public.supervisor_badges  enable row level security;

create policy "streaks_select" on public.supervisor_streaks for select to authenticated
  using (user_id = auth.uid() or public.is_staff());
create policy "badges_select"  on public.supervisor_badges  for select to authenticated
  using (user_id = auth.uid() or public.is_staff());

-- Admin manual management (normal writes come from the privileged service path).
create policy "streaks_admin" on public.supervisor_streaks for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "badges_admin"  on public.supervisor_badges  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ============================================================================
-- Seed: one balance row per PPE consumable
--
-- tax_stamp + carton are NOT seeded — they are a derived ledger now (received
-- events + packaging consumption, anchored to management stock_counts), so there
-- is no running-total row to seed.
--
-- Finished-goods on-hand is also derived on read (Σ produced − Σ loaded), so
-- there is no live-stock table to seed. Stock-ledger balances
-- (alcohol/caps/labels/caramel/herb/preform) start at zero: day-one starting
-- stock is entered as a 'baseline' stock_count via the reconcile screen, not here.
-- ============================================================================
insert into public.consumable_stock (material, product) values
  ('seal_tape', null),
  ('hair_net',  null),
  ('nose_mask', null),
  ('gloves',    null)
on conflict on constraint consumable_stock_material_product_key do nothing;

-- ============================================================================
-- One record per (record type, date, shift, product/variant)
--
-- Nothing stopped a supervisor submitting the same record twice for one
-- (date, shift). Gamification tolerated it (it de-duplicates by building set
-- keys of `date|shift`), but the STOCK LEDGER does not: stock_balance_core()
-- sums quantity_received / quantity_used over every matching movement row, so an
-- accidental double-submit silently double-counts received and used stock and
-- corrupts every downstream balance, variance, burn rate and days-left figure.
--
-- Enforced in the database, on purpose. The API is not the boundary: a retried
-- fetch, a double-tapped Submit button on a slow phone connection, or a direct
-- PostgREST call all bypass any app-level check. A second submission raises
-- unique_violation (23505), which app/api/records/submit maps to HTTP 409.
--
-- KEY DESIGN NOTES
--   • stock_records is keyed WITHOUT department/user_id, by (material, date,
--     shift, product, variant). The ledger aggregates purely by material, so two
--     rows for the same material+shift double-count no matter who filed them or
--     under which department.
--   • Production tables ARE keyed by department, because
--     concentrate_alcohol_records is shared by two departments (Concentrate and
--     Alcohol and Blending — see RECORD_TYPES in lib/domain/record-types.ts) and
--     each legitimately files its own row for the same date+shift.
--   • NULLS NOT DISTINCT is required, not cosmetic. Postgres treats NULLs as
--     DISTINCT in a unique index by default, so without it two rows with
--     product IS NULL (alcohol, caps, preform…) would BOTH be accepted and the
--     index would protect nothing for exactly the materials that need it most.
--     Needs PG15+; Supabase and the test harness both run PG16. (A
--     coalesce(product::text,'') expression index is impossible: casting an enum
--     to text is only STABLE, not IMMUTABLE, so Postgres rejects it in an index.)
--   • extraction_monitoring_records is DELIBERATELY EXEMPT: it records one row
--     per tank per shift (the form submits up to 20), so duplicates are the
--     expected shape, not an error.
-- ============================================================================
create unique index stock_records_one_per_shift_uidx
  on public.stock_records (material, date, shift, product, variant)
  nulls not distinct;

comment on index public.stock_records_one_per_shift_uidx is
  'One movement row per material+product/variant per shift: a duplicate would '
  'double-count received/used in the derived ledger (stock_balance_core).';

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

-- A department/shift either operated or it didn't; one declaration is enough.
create unique index no_work_records_one_per_shift_uidx
  on public.no_work_records (department, date, shift);

-- NOTE: no index on extraction_monitoring_records — multi-tank by design.
