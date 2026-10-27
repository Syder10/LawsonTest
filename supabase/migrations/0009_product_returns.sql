-- Product returns are physical receipts of finished goods, counted in cartons.
-- Keep movements only: on hand is derived as produced - loaded + returned.
-- Dispatch remains a separate delivery log (PRD.md §3.3).

create table public.product_returns (
  id            uuid primary key default gen_random_uuid(),
  date          date not null,
  shift         public.shift_type not null,
  product       public.product_type not null,
  cartons       numeric(12, 2) not null check (cartons > 0 and cartons <> 'NaN'::numeric),
  returned_from text,
  remarks       text,
  received_by   text,
  user_id       uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now()
);

create index product_returns_date_idx on public.product_returns (date desc, created_at desc);
create index product_returns_product_idx on public.product_returns (product);

comment on table public.product_returns is
  'Finished product cartons physically returned to stock. Each row adds to finished_goods_stock(); '
  'date is the day the shift started. Balances are derived, never stored.';

alter table public.product_returns enable row level security;
create policy product_returns_read on public.product_returns for select to authenticated
  using (public.can_read_stock());
create policy product_returns_insert on public.product_returns for insert to authenticated
  with check (public.can_write_stock() and user_id = auth.uid());

-- 0005 grants UPDATE/DELETE through default privileges. Explicitly revoke them:
-- submitted returns follow the same append-only model as receipts and dispatch.
revoke all on table public.product_returns from public, anon, authenticated;
grant select, insert on table public.product_returns to authenticated;
grant all on table public.product_returns to service_role;

-- Preserve the existing RPC result shape so every current consumer keeps working.
-- Aggregate the two sources independently before joining: joining raw movements
-- would multiply both production and returns when a product has several rows.
-- Enumerate the products so a return counts even before any production was filed.
create or replace function public.finished_goods_stock()
returns table (product public.product_type, available numeric, total_produced numeric, total_loaded numeric)
language sql
stable
security definer
set search_path = public
as $$
  with production as (
    select p.product,
           sum(p.quantity_cartons_produced) as produced,
           sum(p.quantity_cartons_loaded) as loaded
    from public.packaging_daily_records p
    group by p.product
  ), returned as (
    select r.product, sum(r.cartons) as cartons
    from public.product_returns r
    group by r.product
  )
  select products.product,
         coalesce(p.produced, 0) - coalesce(p.loaded, 0) + coalesce(r.cartons, 0),
         coalesce(p.produced, 0),
         coalesce(p.loaded, 0)
  from unnest(enum_range(null::public.product_type)) as products(product)
  left join production p on p.product = products.product
  left join returned r on r.product = products.product;
$$;
revoke execute on function public.finished_goods_stock() from public, anon;
grant execute on function public.finished_goods_stock() to authenticated, service_role;

-- Totals cover the whole selected window even when the history list is limited.
-- SECURITY INVOKER keeps the same RLS boundary as the underlying return records.
create function public.product_return_totals(p_from date, p_to date)
returns table (product public.product_type, cartons numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select r.product, sum(r.cartons)
  from public.product_returns r
  where r.date between p_from and p_to
  group by r.product;
$$;
revoke execute on function public.product_return_totals(date, date) from public, anon;
grant execute on function public.product_return_totals(date, date) to authenticated, service_role;
