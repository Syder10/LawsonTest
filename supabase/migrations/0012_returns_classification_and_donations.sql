-- ============================================================================
-- 0012: Returns Classification (Repack vs Spoilage) and Donations Outflow
--
-- Enables complete monthly finished goods stock reconciliation:
--   1. product_returns tracks repack_cartons (restocked to warehouse) and
--      spoilage_cartons (breakage/loss written off).
--   2. donations logs cartons gifted or disbursed for promotions/sponsorships,
--      reducing closing stock without sales revenue.
-- ============================================================================

-- 1. Classify product_returns into repack_cartons and spoilage_cartons
alter table public.product_returns
  add column if not exists repack_cartons numeric(12, 2) not null default 0 check (repack_cartons >= 0 and repack_cartons <> 'NaN'::numeric),
  add column if not exists spoilage_cartons numeric(12, 2) not null default 0 check (spoilage_cartons >= 0 and spoilage_cartons <> 'NaN'::numeric);

-- Backfill existing rows: assume prior unclassified returns were repackable
update public.product_returns
set repack_cartons = cartons
where repack_cartons = 0 and spoilage_cartons = 0 and cartons > 0;

comment on column public.product_returns.repack_cartons is
  'Cartons returned intact or repacked to be returned to active inventory.';
comment on column public.product_returns.spoilage_cartons is
  'Cartons damaged or spoiled that cannot be sold, written off as loss.';

-- 2. Create donations table for promotional and CSR carton outflows
create table if not exists public.donations (
  id          uuid primary key default gen_random_uuid(),
  date        date not null,
  shift       public.shift_type not null,
  product     public.product_type not null,
  cartons     numeric(12, 2) not null check (cartons > 0 and cartons <> 'NaN'::numeric),
  recipient   text not null,
  remarks     text,
  user_id     uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now()
);

create index if not exists donations_date_idx on public.donations (date desc, created_at desc);
create index if not exists donations_product_idx on public.donations (product);

comment on table public.donations is
  'Finished product cartons disbursed as donations, marketing samples, or sponsorships. '
  'Deducts from warehouse stock balance without branch dispatch or revenue.';

alter table public.donations enable row level security;

-- Stock read policy
create policy donations_read on public.donations for select to authenticated
  using (public.can_read_stock());

-- Stock write policy
create policy donations_insert on public.donations for insert to authenticated
  with check (public.can_write_stock() and user_id = auth.uid());

-- Revoke default open privileges and grant explicitly
revoke all on table public.donations from public, anon, authenticated;
grant select, insert on table public.donations to authenticated;
grant all on table public.donations to service_role;
