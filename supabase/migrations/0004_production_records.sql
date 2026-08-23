-- ============================================================================
-- 0004_production_records.sql
-- The 7 genuinely-distinct production record tables (kept typed & separate).
--
-- Key improvements vs old schema:
--   • Derived fields are GENERATED columns — the DB computes them, so the value
--     can never drift from its inputs and the frontend/API no longer duplicate
--     the arithmetic (old code computed these in 3 places):
--       blowing.final_production          = total_produced - waste_pcs
--       blending.*_litres                 = drums*250 / tanks*900
--       ginger.*_litres                   = tanks*300 / tanks*1000
--       concentrate.total_alcohol_used    = alcohol_70 + alcohol_80
--     (Blowing preform stock is NOT a generated column: it is a derived ledger —
--      received/used only, balance computed on read; see 0011_stock_counts.sql.)
--   • Numeric input columns are NOT NULL DEFAULT 0 (clean inputs for the
--     generated columns; no silent NULL arithmetic).
--   • user_id is ON DELETE SET NULL (was CASCADE — deleting a user destroyed
--     their production history). supervisor_name is retained as an audit
--     snapshot so a record stays attributable even if the profile is removed.
--   • date / shift / department are NOT NULL with proper types + FK.
--   • Shared RLS policies, indexes, and the updated_at trigger are applied to
--     all seven tables by the loop at the bottom of this file.
-- ============================================================================

-- ── Blowing: Daily Records (Preform Usage) ──────────────────────────────────
-- Preforms are a stock ledger like the stock_records materials: supervisors
-- record only received + used; the opening/closing balance is DERIVED on read
-- (material 'preform') by the balance functions in 0011_stock_counts.sql, and
-- the baseline is set via a management stock_count. So there is no stored
-- opening_stock_bags / closing_stock_bags here — only the movement columns.
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
-- Drives packaging_live_stocks + tax-stamp/carton deduction via triggers
-- defined in 0007_inventory.sql.
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
