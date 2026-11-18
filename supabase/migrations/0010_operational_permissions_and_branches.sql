-- User decision (2026-10-22): Stock Keeper alone records stock movements;
-- managers view dashboards; admins manage the system, not operational records.
create or replace function public.can_write_stock()
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce(public.current_user_role() = 'stock', false); $$;
revoke execute on function public.can_write_stock() from public, anon;
grant execute on function public.can_write_stock() to authenticated, service_role;
comment on function public.can_write_stock() is 'Only Stock Keeper records physical stock movements.';

create or replace function public.can_read_stock()
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce(public.current_user_role() in ('stock', 'procurement', 'manager'), false); $$;
revoke execute on function public.can_read_stock() from public, anon;
grant execute on function public.can_read_stock() to authenticated, service_role;
comment on function public.can_read_stock() is 'Stock Keeper, Procurement and Manager view stock. Admin manages the system.';

-- The old admin ALL policies also granted SELECT/INSERT alongside corrections.
-- System administration is no longer an operational-data permission.
drop policy if exists invoices_admin on public.invoices;
drop policy if exists invoice_lines_admin on public.invoice_lines;
drop policy if exists dispatches_admin on public.dispatches;
drop policy if exists dispatch_lines_admin on public.dispatch_lines;
drop policy if exists stock_counts_admin_write on public.stock_counts;
drop policy if exists consumable_stock_admin on public.consumable_stock;

-- Production submission belongs to supervisors. Keep their existing own-row
-- editing policy, while removing managers/admins from every production write.
-- Stock reports require packaging, blowing and material movements across users.
do $$
declare t text; read_rule text;
begin
  foreach t in array array[
    'blowing_daily_records', 'alcohol_blending_daily_records', 'ginger_production_records',
    'extraction_monitoring_records', 'filling_line_daily_records', 'packaging_daily_records',
    'concentrate_alcohol_records', 'stock_records', 'no_work_records'
  ] loop
    read_rule := '(public.current_user_role() = ''manager'' or '
      || '(public.current_user_role() = ''supervisor'' and user_id = auth.uid()))';
    if t in ('blowing_daily_records', 'packaging_daily_records', 'stock_records') then
      read_rule := read_rule || ' or public.can_read_stock()';
    end if;
    execute format('drop policy if exists select_own_or_staff on public.%I', t);
    execute format('create policy select_own_or_staff on public.%I for select to authenticated using (%s)', t, read_rule);
    execute format('drop policy if exists insert_own_or_staff on public.%I', t);
    execute format('create policy insert_own_or_staff on public.%I for insert to authenticated '
      || 'with check (public.current_user_role() = ''supervisor'' and user_id = auth.uid())', t);
    execute format('drop policy if exists update_own_or_staff on public.%I', t);
    execute format('create policy update_own_or_staff on public.%I for update to authenticated '
      || 'using (public.current_user_role() = ''supervisor'' and user_id = auth.uid()) '
      || 'with check (public.current_user_role() = ''supervisor'' and user_id = auth.uid())', t);
  end loop;
end $$;

-- Existing destinations are historical facts. NOT VALID preserves them while
-- enforcing the user's branch list for new dispatches. Mirror of DISPATCH_BRANCHES
-- in lib/domain/dispatch.ts, where the form and API share their validation rule.
alter table public.dispatches add constraint dispatches_destination_branch_check
  check (destination in (
    'Head Office', 'Accra', 'Bolgatanga', 'Cape Coast', 'Ho & Togo',
    'Koforidua', 'Takoradi', 'Tarkwa', 'Techiman', 'Wa'
  )) not valid;
