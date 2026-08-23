-- ============================================================================
-- 0006_no_work_records.sql
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
