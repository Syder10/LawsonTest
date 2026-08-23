-- ============================================================================
-- 0007_inventory.sql
-- Raw-material / finished-goods inventory + the balance-maintenance triggers.
--
-- ⚠️  RECONSTRUCTED LOGIC. The old repo's schema.sql contained NO triggers, yet
--     the running app relied on hidden ones. apply_raw_material_received (the
--     procurement received/issue balance for PPE) is high-confidence.
--     Stamp/carton consumption per carton produced (Bitters 9, Ginger 6; 1
--     carton box each) is now user-confirmed and is DERIVED on read (not a
--     trigger) — see stock_balance_core in 0011_stock_counts.sql.
--
-- CONSOLIDATION: consumable_stock replaces SIX identical singleton tables
--   (tax_stamp_stock, carton_stock, seal_tape_stock, hair_net_stock,
--    nose_mask_stock, gloves_stock). It now holds ONLY the PPE running totals;
--    tax_stamp + carton moved to the derived ledger (stock_counts + on-read
--    balance), so edits/deletes self-correct and balances can't drift negative.
-- ============================================================================

-- ── consumable_stock: running balances for raw materials / PPE ───────────────
create table public.consumable_stock (
  id                 uuid primary key default gen_random_uuid(),
  material           text not null references public.consumable_materials(code),
  product            public.product_type,          -- only cartons are per-product
  remaining_pcs      bigint not null default 0,
  total_received_pcs bigint not null default 0,
  total_used_pcs     bigint not null default 0,
  last_updated_at    timestamptz not null default now(),
  constraint consumable_stock_material_product_key unique nulls not distinct (material, product)
);

-- ── packaging_bom: materials consumed per carton produced ────────────────────
-- NOTE on finished-goods stock: there is deliberately NO packaging_live_stocks
-- table. Finished-goods on-hand is a pure function of the packaging records
-- (Σ produced − Σ loaded) and is computed on read via finished_goods_stock()
-- in 0010_functions.sql. Storing it as a running total (the old approach) drifts
-- when records are edited/deleted and can go negative; deriving it cannot.
-- Single source of truth for the stamp/carton consumption rates that were
-- previously hardcoded in the procurement route (9 stamps/Bitters, 6/Ginger).
create table public.packaging_bom (
  product            public.product_type primary key,
  stamps_per_carton  integer not null,
  cartons_per_carton integer not null default 1
);
insert into public.packaging_bom (product, stamps_per_carton, cartons_per_carton) values
  ('Bitters', 9, 1),
  ('Ginger',  6, 1);

-- ── raw_materials_received: append-only event log of deliveries / issues ─────
create table public.raw_materials_received (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references public.profiles(id) on delete set null,
  received_by       text,
  date              date not null,
  material_type     text not null check (material_type in
                      ('tax_stamp','carton_bitters','carton_ginger','seal_tape','hair_net','nose_mask','gloves')),
  stamp_boxes       integer not null default 0,
  stamp_total_coils integer not null default 0,
  stamp_total_pcs   bigint  not null default 0,
  carton_total_pcs  integer not null default 0,
  ppe_boxes_in      integer not null default 0,
  ppe_pcs_in        integer not null default 0,
  ppe_given_out     integer not null default 0,
  ppe_given_unit    text    not null default 'Boxes',
  ppe_given_pcs     integer not null default 0,
  ppe_given_to      text,
  remarks           text,
  created_at        timestamptz not null default now()
);

create index raw_materials_received_date_idx     on public.raw_materials_received (date);
create index raw_materials_received_material_idx  on public.raw_materials_received (material_type);

-- ── Trigger: apply a received/issued event to the running balance ────────────
-- SECURITY DEFINER so the balance update bypasses RLS (the submitter has no
-- direct write grant on consumable_stock — only this trigger maintains it).
--
-- Only PPE keeps a stored running total here. tax_stamp and carton are now a
-- DERIVED ledger (received here + consumed from packaging × BOM, balanced on
-- read by stock_balance_core in 0011) — their received events are still logged
-- in raw_materials_received, but no consumable_stock total is maintained for them.
create or replace function public.apply_raw_material_received()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.material_type in ('seal_tape','hair_net','nose_mask','gloves') then
    insert into public.consumable_stock
        (material, product, remaining_pcs, total_received_pcs, total_used_pcs, last_updated_at)
    values (new.material_type, null, new.ppe_pcs_in - new.ppe_given_pcs, new.ppe_pcs_in, new.ppe_given_pcs, now())
    on conflict on constraint consumable_stock_material_product_key do update
      set remaining_pcs      = consumable_stock.remaining_pcs      + excluded.remaining_pcs,
          total_received_pcs = consumable_stock.total_received_pcs + excluded.total_received_pcs,
          total_used_pcs     = consumable_stock.total_used_pcs     + excluded.total_used_pcs,
          last_updated_at    = now();
  end if;
  -- tax_stamp / carton_bitters / carton_ginger: derived ledger, nothing to do.
  return new;
end;
$$;

create trigger raw_materials_received_apply
  after insert on public.raw_materials_received
  for each row execute function public.apply_raw_material_received();

-- Stamp/carton consumption is DERIVED on read (packaging × packaging_bom, see
-- stock_balance_core in 0011_stock_counts.sql) — like finished-goods stock, so
-- it self-corrects when packaging records are edited/deleted and can't drift
-- negative. There is deliberately NO packaging-production balance trigger.

-- ── RLS ──────────────────────────────────────────────────────────────────
alter table public.consumable_stock       enable row level security;
alter table public.packaging_bom          enable row level security;
alter table public.raw_materials_received enable row level security;

-- Balances: readable by procurement/manager/admin. Writes happen only through
-- the SECURITY DEFINER triggers above (+ admin for manual fixes).
create policy "consumable_stock_read"  on public.consumable_stock for select to authenticated using (public.is_procurement_staff());
create policy "consumable_stock_admin" on public.consumable_stock for all    to authenticated using (public.is_admin()) with check (public.is_admin());

-- BOM is reference data.
create policy "packaging_bom_read"  on public.packaging_bom for select to authenticated using (true);
create policy "packaging_bom_admin" on public.packaging_bom for all    to authenticated using (public.is_admin()) with check (public.is_admin());

-- Received log: procurement staff read & append.
create policy "raw_materials_read"   on public.raw_materials_received for select to authenticated using (public.is_procurement_staff());
create policy "raw_materials_insert" on public.raw_materials_received for insert to authenticated with check (public.is_procurement_staff());
