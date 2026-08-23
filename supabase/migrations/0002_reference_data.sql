-- ============================================================================
-- 0002_reference_data.sql
-- Reference / lookup tables: departments, stock materials, consumable materials,
-- herb types. These carry domain metadata that was previously hardcoded and
-- duplicated across 5+ code locations (department lists, conversion constants,
-- material maps). Now there is one source of truth.
--
-- Readable by any authenticated user; writable only by admins.
-- ============================================================================

-- ── departments ────────────────────────────────────────────────────────────
-- num_groups differs by department (Alcohol and Blending runs 2 rotation
-- groups; the rest run 3). The shift-rotation ANCHOR/cycle logic still lives
-- in lib/shift-config.ts (it is pure date math), but the group count and
-- canonical department names live here.
create table public.departments (
  name          text primary key,                       -- canonical display name, FK target
  code          text not null unique,                   -- stable slug for code references
  num_groups    smallint not null default 3 check (num_groups between 1 and 3),
  display_order smallint not null default 0
);

insert into public.departments (name, code, num_groups, display_order) values
  ('Blowing',              'blowing',          3, 1),
  ('Alcohol and Blending', 'alcohol_blending', 2, 2),
  ('Filling Line',         'filling_line',     3, 3),
  ('Packaging',            'packaging',        3, 4),
  ('Concentrate',          'concentrate',      3, 5);

-- ── stock_materials ─────────────────────────────────────────────────────────
-- The material types whose stock is tracked as a derived ledger (balances are
-- computed by chaining received/used movements in chronological order — see the
-- stock_balance_core / stock_opening / stock_remaining_asof functions).
--   tracks_product : whether records carry a product_type (Bitters/Ginger)
--   is_herb        : whether records carry a herb "variant" + checked_by
--
-- Most materials store their movements in the consolidated stock_records table.
-- The exceptions store their movements elsewhere but are registered here so the
-- balance functions + stock_counts (baseline/reconciliation) key everything
-- uniformly:
--   'preform'          → movements in blowing_daily_records
--   'tax_stamp','carton'→ received via raw_materials_received; consumed via
--                          packaging_daily_records × packaging_bom (derived)
create table public.stock_materials (
  code          text primary key,
  name          text not null,
  unit          text not null default 'units',
  tracks_product boolean not null default false,
  is_herb       boolean not null default false,
  display_order smallint not null default 0
);

insert into public.stock_materials (code, name, unit, tracks_product, is_herb, display_order) values
  ('alcohol',   'Alcohol',   'litres', false, false, 1),
  ('caps',      'Caps',      'pcs',    false, false, 2),
  ('labels',    'Labels',    'pcs',    true,  false, 3),
  ('caramel',   'Caramel',   'units',  true,  false, 4),
  ('herb',      'Herb',      'units',  false, true,  5),
  ('preform',   'Preform',   'bags',   false, false, 6),
  ('tax_stamp', 'Tax Stamp', 'pcs',    false, false, 7),
  ('carton',    'Carton',    'pcs',    true,  false, 8);

-- ── consumable_materials ──────────────────────────────────────────────────
-- Raw materials / PPE whose running balance is tracked in consumable_stock.
-- Conversion constants (previously copy-pasted in 3 JS files) live here.
--   pcs_per_box   : units per received box (PPE + seal tape)
--   pcs_per_coil  : tax-stamp coils only (box = 6 coils = 90,000 pcs)
--   has_product   : keyed per product (cartons: Bitters/Ginger)
--   has_given_out : supports a "given out" deduction (PPE)
create table public.consumable_materials (
  code          text primary key,
  name          text not null,
  unit          text not null default 'pcs',
  pcs_per_box   integer,
  pcs_per_coil  integer,
  has_product   boolean not null default false,
  has_given_out boolean not null default false,
  display_order smallint not null default 0
);

insert into public.consumable_materials
  (code, name, unit, pcs_per_box, pcs_per_coil, has_product, has_given_out, display_order) values
  ('tax_stamp', 'Tax Stamp', 'pcs',   90000, 15000, false, false, 1),
  ('carton',    'Carton',    'pcs',   null,  null,  true,  false, 2),
  ('seal_tape', 'Seal Tape', 'pcs',   24,    null,  false, true,  3),
  ('hair_net',  'Hair Net',  'packs', 10,    null,  false, true,  4),
  ('nose_mask', 'Nose Mask', 'packs', 40,    null,  false, true,  5),
  ('gloves',    'Gloves',    'packs', 10,    null,  false, true,  6);

-- ── herb_types ──────────────────────────────────────────────────────────────
-- The list of valid herbs. stock_records.variant references this by name.
-- Supervisors can add new herbs through the app (see herbs API).
create table public.herb_types (
  name       text primary key,
  created_at timestamptz not null default now()
);

-- ── RLS: reference data is world-readable (authenticated), admin-writable ────
alter table public.departments          enable row level security;
alter table public.stock_materials       enable row level security;
alter table public.consumable_materials  enable row level security;
alter table public.herb_types            enable row level security;

create policy "reference_read_departments"          on public.departments          for select to authenticated using (true);
create policy "reference_read_stock_materials"       on public.stock_materials       for select to authenticated using (true);
create policy "reference_read_consumable_materials"  on public.consumable_materials  for select to authenticated using (true);
create policy "reference_read_herb_types"            on public.herb_types            for select to authenticated using (true);

create policy "admin_write_departments"          on public.departments          for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin_write_stock_materials"       on public.stock_materials       for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin_write_consumable_materials"  on public.consumable_materials  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- herb_types: any supervisor+ may add a herb (matches current app behaviour),
-- but only through an authenticated session (closes the old public-write hole).
create policy "herb_types_insert" on public.herb_types for insert to authenticated with check (true);
create policy "herb_types_admin_delete" on public.herb_types for delete to authenticated using (public.is_admin());
