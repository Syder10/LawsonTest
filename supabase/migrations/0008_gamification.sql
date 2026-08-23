-- ============================================================================
-- 0008_gamification.sql
-- Supervisor streaks & badges.
--
-- Fixes vs old schema:
--   • supervisor_badges gains UNIQUE(user_id, badge_type) — the app upserts
--     badges with onConflict "user_id,badge_type", which could not have worked
--     without this constraint.
--   • shift type columns use the shift_type enum.
--   • user_id is the primary key of supervisor_streaks (1 row per user).
--
-- Streak/badge WRITES are performed by the gamification service (Phase 3).
-- RLS here grants read access; writes go through a privileged path.
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

-- ── RLS ──────────────────────────────────────────────────────────────────
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
