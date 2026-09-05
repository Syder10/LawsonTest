-- ============================================================================
-- 0006_app_settings.sql
-- Operational settings the business changes without a deploy.
--
-- Runs AFTER 0005 (which grants the rest of the schema), so this file carries its
-- own grants — it is self-contained and can be applied to an already-migrated
-- database on its own.
--
-- WHY A TABLE AND NOT CONSTANTS. The production forecast drives every days-left
-- projection: with only a few days of records a measured burn rate means nothing, so
-- the projection falls back to "what should this plant consume per day", which is
-- derived from cartons produced. That figure changes with the business, and it should
-- not need a developer.
--
-- SINGLETON. One row, enforced by a boolean primary key with a CHECK — the app always
-- reads "the" settings, and there is no meaningful second row. Cheaper and far easier
-- to type than a key/value table, and a typo in a column name fails at compile time
-- instead of silently reading null.
-- ============================================================================

create table public.app_settings (
  id boolean primary key default true check (id),

  -- Forecast: cartons produced per shift, per product. The mix is not even
  -- (2,500 Bitters / 500 Ginger per shift as of 2026-09-03), and using an average
  -- would understate one product's labels and overstate the other's.
  cartons_per_shift_bitters integer  not null default 2500 check (cartons_per_shift_bitters >= 0),
  cartons_per_shift_ginger  integer  not null default 500  check (cartons_per_shift_ginger  >= 0),
  shifts_per_day            smallint not null default 3    check (shifts_per_day between 1 and 3),

  -- Extra bottle-level material for breakage and rejects, as a percentage. Applies to
  -- preforms, caps and labels. Zero until the business reads a real figure off its own
  -- waste records — a plausible-looking guess would move every reorder point.
  waste_allowance_pct numeric(5,2) not null default 0 check (waste_allowance_pct between 0 and 50),

  -- Alcohol is the one material NOT derived from cartons: the ledger also covers
  -- alcohol drawn for concentrate extraction and ginger production, which a per-carton
  -- recipe cannot see. The business states the daily figure directly.
  alcohol_drums_per_day numeric(10,2) not null default 200 check (alcohol_drums_per_day >= 0),

  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

comment on table public.app_settings is
  'Singleton row of operational settings. Read by the analytics and procurement report routes to derive expected daily consumption.';

insert into public.app_settings (id) values (true);

-- ── RLS: any signed-in user may READ (the report routes run on the user's own
-- RLS-bound client); only admins may write. ──────────────────────────────────
alter table public.app_settings enable row level security;

create policy "settings_read" on public.app_settings
  for select to authenticated using (true);

-- Deliberately UPDATE-only: the singleton row exists from this migration, so there is
-- no legitimate insert or delete, and forbidding them means a bug cannot leave the
-- table empty and every projection reading defaults.
create policy "settings_admin_update" on public.app_settings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

grant select on public.app_settings to authenticated;
grant update on public.app_settings to authenticated;
grant select, update on public.app_settings to service_role;
