-- ============================================================================
-- 0005_stock_records.sql
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
-- Night), anchored to the latest management stock_count. See the
-- stock_balance_core / stock_opening / stock_remaining_asof / stock_ledger
-- functions in 0011_stock_counts.sql.
--
-- Why derived, not stored: a frozen opening copied from "whichever row was
-- submitted last" corrupts the chain whenever shifts are entered out of order,
-- and cannot self-heal. Deriving from the ordered movement log means a late
-- Afternoon submission automatically corrects itself AND every later shift.
-- Setting/correcting the baseline is a management-only stock_count (which also
-- records the counted-vs-computed variance).
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

-- ── RLS ──────────────────────────────────────────────────────────────────
alter table public.stock_records enable row level security;

create policy "select_own_or_staff" on public.stock_records for select to authenticated
  using (user_id = auth.uid() or public.is_staff());

create policy "insert_own_or_staff" on public.stock_records for insert to authenticated
  with check (user_id = auth.uid() or public.is_staff());

create policy "update_own_or_staff" on public.stock_records for update to authenticated
  using (user_id = auth.uid() or public.is_staff())
  with check (user_id = auth.uid() or public.is_staff());
