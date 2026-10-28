-- ============================================================================
-- 0013: Quality Control (QC) Module and Part-Time Shift Support
--
-- Implements Lawson QC Module Development Requirements v1.0:
--   1. Adds 'qc_officer' and 'qc_manager' roles to public.user_role enum.
--   2. Adds is_part_time boolean to packaging_daily_records for Table 1 reporting.
--   3. Tables for qc_standards (with 8 initial seeded reference ranges),
--      qc_records, qc_record_results, qc_standard_changes, and qc_record_amendments.
--   4. Explicit RLS policies and grants.
-- ============================================================================

-- 1. Extend user_role enum
alter type public.user_role add value if not exists 'qc_officer';
alter type public.user_role add value if not exists 'qc_manager';

-- 2. Add is_part_time flag to supervisor production records & stock records
alter table public.packaging_daily_records
  add column if not exists is_part_time boolean not null default false;
alter table public.blowing_daily_records
  add column if not exists is_part_time boolean not null default false;
alter table public.alcohol_blending_daily_records
  add column if not exists is_part_time boolean not null default false;
alter table public.ginger_production_records
  add column if not exists is_part_time boolean not null default false;
alter table public.extraction_monitoring_records
  add column if not exists is_part_time boolean not null default false;
alter table public.filling_line_daily_records
  add column if not exists is_part_time boolean not null default false;
alter table public.concentrate_alcohol_records
  add column if not exists is_part_time boolean not null default false;
alter table public.stock_records
  add column if not exists is_part_time boolean not null default false;

comment on column public.packaging_daily_records.is_part_time is
  'True if this shift was run by part-time or casual workers (feeds Part Time column in Table 1).';

-- 3. QC Role access functions
create or replace function public.can_access_qc()
returns boolean
language sql
stable
security definer
set search_path = public
as $$ select coalesce(public.current_user_role() in ('qc_officer', 'qc_manager', 'admin'), false); $$;
revoke execute on function public.can_access_qc() from public, anon;
grant execute on function public.can_access_qc() to authenticated, service_role;

create or replace function public.can_manage_qc()
returns boolean
language sql
stable
security definer
set search_path = public
as $$ select coalesce(public.current_user_role() in ('qc_manager', 'admin'), false); $$;
revoke execute on function public.can_manage_qc() from public, anon;
grant execute on function public.can_manage_qc() to authenticated, service_role;

-- 4. QC Standards Table
create table if not exists public.qc_standards (
  id              uuid primary key default gen_random_uuid(),
  record_type     text not null,
  parameter_key   text not null,
  parameter_label text not null,
  unit            text,
  lower_limit     numeric,
  upper_limit     numeric,
  is_inclusive    boolean not null default true,
  expression      text,
  effective_from  timestamptz not null default now(),
  effective_to    timestamptz,
  is_active       boolean not null default true,
  created_by      uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at      timestamptz not null default now()
);

create index if not exists qc_standards_type_param_idx
  on public.qc_standards (record_type, parameter_key) where is_active = true;

alter table public.qc_standards enable row level security;
create policy qc_standards_read on public.qc_standards for select to authenticated
  using (public.can_access_qc());
create policy qc_standards_write on public.qc_standards for all to authenticated
  using (public.can_manage_qc()) with check (public.can_manage_qc());

revoke all on table public.qc_standards from public, anon, authenticated;
grant select, insert, update on table public.qc_standards to authenticated;
grant all on table public.qc_standards to service_role;

-- 5. QC Standard Change Log
create table if not exists public.qc_standard_changes (
  id              uuid primary key default gen_random_uuid(),
  standard_id     uuid not null references public.qc_standards(id) on delete cascade,
  previous_values jsonb,
  new_values      jsonb not null,
  reason          text not null,
  changed_by      uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at      timestamptz not null default now()
);

alter table public.qc_standard_changes enable row level security;
create policy qc_standard_changes_read on public.qc_standard_changes for select to authenticated
  using (public.can_access_qc());
create policy qc_standard_changes_insert on public.qc_standard_changes for insert to authenticated
  with check (public.can_manage_qc() and changed_by = auth.uid());

revoke all on table public.qc_standard_changes from public, anon, authenticated;
grant select, insert on table public.qc_standard_changes to authenticated;
grant all on table public.qc_standard_changes to service_role;

-- 6. QC Records Table
create table if not exists public.qc_records (
  id                uuid primary key default gen_random_uuid(),
  record_reference  text not null unique,
  category          text not null check (category in ('water', 'product', 'raw_materials')),
  record_type       text not null,
  test_date         date not null,
  test_time         text not null,
  day_name          text,
  batch_no          text,
  product_name      text,
  supplier          text,
  origin            text,
  checked_by        text,
  record_status     text not null default 'in_range'
    check (record_status in ('in_range', 'below_range', 'above_range', 'out_of_range', 'standard_not_configured', 'not_evaluated', 'incomplete')),
  parameters        jsonb not null default '{}'::jsonb,
  submitted_by      text not null,
  user_id           uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists qc_records_date_idx on public.qc_records (test_date desc, created_at desc);
create index if not exists qc_records_type_idx on public.qc_records (record_type);
create index if not exists qc_records_status_idx on public.qc_records (record_status);
create index if not exists qc_records_batch_idx on public.qc_records (batch_no) where batch_no is not null;

alter table public.qc_records enable row level security;
create policy qc_records_read on public.qc_records for select to authenticated
  using (public.can_access_qc());
create policy qc_records_insert on public.qc_records for insert to authenticated
  with check (public.can_access_qc() and user_id = auth.uid());

revoke all on table public.qc_records from public, anon, authenticated;
grant select, insert, update on table public.qc_records to authenticated;
grant all on table public.qc_records to service_role;

-- 7. QC Record Results (Evaluated Parameter Level)
create table if not exists public.qc_record_results (
  id                uuid primary key default gen_random_uuid(),
  qc_record_id      uuid not null references public.qc_records(id) on delete cascade,
  parameter_key     text not null,
  parameter_label   text not null,
  numeric_value     numeric,
  text_value        text,
  unit              text,
  standard_id       uuid references public.qc_standards(id) on delete set null,
  evaluated_status  text not null
    check (evaluated_status in ('in_range', 'below_range', 'above_range', 'out_of_range', 'standard_not_configured', 'not_evaluated', 'incomplete')),
  evaluation_note   text,
  evaluated_at      timestamptz not null default now()
);

create index if not exists qc_record_results_record_idx on public.qc_record_results (qc_record_id);
create index if not exists qc_record_results_status_idx on public.qc_record_results (evaluated_status);

alter table public.qc_record_results enable row level security;
create policy qc_record_results_read on public.qc_record_results for select to authenticated
  using (public.can_access_qc());
create policy qc_record_results_insert on public.qc_record_results for insert to authenticated
  with check (public.can_access_qc());

revoke all on table public.qc_record_results from public, anon, authenticated;
grant select, insert on table public.qc_record_results to authenticated;
grant all on table public.qc_record_results to service_role;

-- 8. QC Record Amendments (Audit Trail)
create table if not exists public.qc_record_amendments (
  id              uuid primary key default gen_random_uuid(),
  qc_record_id    uuid not null references public.qc_records(id) on delete cascade,
  field_name      text not null,
  old_value       text,
  new_value       text not null,
  reason          text not null,
  amended_by      uuid references public.profiles(id) on delete set null default auth.uid(),
  amended_at      timestamptz not null default now()
);

alter table public.qc_record_amendments enable row level security;
create policy qc_record_amendments_read on public.qc_record_amendments for select to authenticated
  using (public.can_access_qc());
create policy qc_record_amendments_insert on public.qc_record_amendments for insert to authenticated
  with check (public.can_access_qc() and amended_by = auth.uid());

revoke all on table public.qc_record_amendments from public, anon, authenticated;
grant select, insert on table public.qc_record_amendments to authenticated;
grant all on table public.qc_record_amendments to service_role;

-- 9. Seed the 8 Initial Approved Reference Ranges (§6 of Specification)
insert into public.qc_standards (record_type, parameter_key, parameter_label, unit, lower_limit, upper_limit, is_inclusive, expression)
values
  ('raw_ethanol', 'alcohol_percentage', 'Alcohol percentage', '%', 95.0, 96.0, true, '95%–96%'),
  ('raw_ethanol', 'ph', 'pH', null, 6.5, 7.5, true, '6.5–7.5'),
  ('treated_water_ro', 'ph', 'pH', null, 5.0, 6.5, true, '5.0–6.5'),
  ('treated_water_blending', 'ph', 'pH', null, 5.5, 7.5, true, '5.5–7.5'),
  ('bitters', 'alcohol_percentage', 'Alcohol percentage', '%', 40.0, 44.0, true, '42% ± 2 (40%–44%)'),
  ('bitters', 'ph', 'pH', null, 4.0, 6.0, true, '4.0–6.0'),
  ('ginger_liquor', 'alcohol_percentage', 'Alcohol percentage', '%', 35.0, 40.0, true, '35%–40%'),
  ('ginger_liquor', 'ph', 'pH', null, 4.0, 6.0, true, '4.0–6.0')
on conflict do nothing;
