-- ============================================================================
-- 0010_functions.sql
-- SECURITY DEFINER helper functions callable from the app via RPC.
--
-- Stock continuity / balance functions used to live here (previous_blowing_close,
-- previous_stock_remaining). They have been REPLACED by the derived-ledger model
-- in 0011_stock_counts.sql (stock_opening / stock_remaining_asof / stock_ledger),
-- which chains movements in true chronological order instead of reading a frozen
-- "most recently created" close. This file now holds only finished_goods_stock.
-- ============================================================================

-- Finished-goods on-hand per product, DERIVED from the packaging records
-- (Σ produced − Σ loaded). Replaces the old stored packaging_live_stocks running
-- total, which drifted on edits and could go negative. Cumulative / all-time
-- (a warehouse balance), independent of any dashboard date filter.
create or replace function public.finished_goods_stock()
returns table (product public.product_type, available numeric, total_produced numeric, total_loaded numeric)
language sql
stable
security definer
set search_path = public
as $$
  select p.product,
         coalesce(sum(p.quantity_cartons_produced), 0) - coalesce(sum(p.quantity_cartons_loaded), 0) as available,
         coalesce(sum(p.quantity_cartons_produced), 0) as total_produced,
         coalesce(sum(p.quantity_cartons_loaded), 0)   as total_loaded
  from public.packaging_daily_records p
  group by p.product;
$$;

grant execute on function public.finished_goods_stock() to authenticated;

