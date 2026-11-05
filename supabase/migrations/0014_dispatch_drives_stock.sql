-- ============================================================================
-- 0014_dispatch_drives_stock.sql
--
-- REVERSES the decision recorded in PRD.md §3.3 / 0008: the finished-goods
-- balance now deducts what the STOCK DISPATCH LOG says went out, not the
-- "Quantity Of Cartons Loaded" typed on the packaging form.
--
--   available     = Σ produced (packaging) − Σ dispatch_lines.cartons + Σ returns
--   total_loaded  = Σ dispatch_lines.cartons
--
-- `packaging_daily_records.quantity_cartons_loaded` is NOT dropped and the form
-- still collects it — it simply no longer moves the balance.
--
-- CONSEQUENCES (read before applying)
--   * Packaging "loaded" figures filed before the dispatch log was in use stop
--     being deducted, so the balance of a product with historical packaging
--     loads but no dispatch rows will RISE by that amount. No backfill is done:
--     inventing dispatch rows from shift figures would fabricate delivery
--     records (no vehicle, driver or destination exist for them). If the
--     business wants an opening correction, record a stock adjustment/count.
--   * The result shape is unchanged, so every existing consumer keeps working.
--
-- SECURITY DEFINER (as before): callers such as managers/procurement get the
-- balance without needing row access to the dispatch tables themselves.
-- ============================================================================

create or replace function public.finished_goods_stock()
returns table (product public.product_type, available numeric, total_produced numeric, total_loaded numeric)
language sql
stable
security definer
set search_path = public
as $$
  -- Each source is aggregated on its own before joining; joining raw movements
  -- would multiply every figure when a product has several rows.
  with production as (
    select p.product, sum(p.quantity_cartons_produced) as produced
    from public.packaging_daily_records p
    group by p.product
  ), dispatched as (
    select l.product, sum(l.cartons) as cartons
    from public.dispatch_lines l
    group by l.product
  ), returned as (
    select r.product, sum(r.cartons) as cartons
    from public.product_returns r
    group by r.product
  )
  select products.product,
         coalesce(p.produced, 0) - coalesce(d.cartons, 0) + coalesce(r.cartons, 0),
         coalesce(p.produced, 0),
         coalesce(d.cartons, 0)
  from unnest(enum_range(null::public.product_type)) as products(product)
  left join production p on p.product = products.product
  left join dispatched d on d.product = products.product
  left join returned   r on r.product = products.product;
$$;

revoke execute on function public.finished_goods_stock() from public, anon;
grant execute on function public.finished_goods_stock() to authenticated, service_role;

comment on function public.finished_goods_stock() is
  'On-hand finished goods per product: Σ packaging produced − Σ dispatch_lines '
  'cartons + Σ returns. Loaded/deducted quantity comes from the stock dispatch '
  'log, not packaging_daily_records.quantity_cartons_loaded (0014).';

comment on table public.dispatches is
  'Outbound delivery log: which vehicle, which driver, to where, under which waybill. '
  'Its lines are the authoritative "loaded" quantity deducted by finished_goods_stock() (0014).';
