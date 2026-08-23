-- ============================================================================
-- 0009_seed.sql
-- Initial rows for the balance tables so the procurement dashboard has
-- something to read on a fresh DB. Reference data (departments, materials,
-- BOM) is seeded inline in its own migration.
--
-- NOTE: herb_types starts empty on purpose — supervisors add herbs through the
-- app. Seed a few here if you want them pre-populated.
-- ============================================================================

-- One balance row per PPE consumable. tax_stamp + carton are NOT seeded here —
-- they are a derived ledger now (received events + packaging consumption,
-- anchored to management stock_counts), so there is no running-total row to seed.
insert into public.consumable_stock (material, product) values
  ('seal_tape', null),
  ('hair_net',  null),
  ('nose_mask', null),
  ('gloves',    null)
on conflict on constraint consumable_stock_material_product_key do nothing;

-- Finished-goods on-hand is derived on read (Σ produced − Σ loaded), so there
-- is no live-stock table to seed.
--
-- Stock-ledger balances (alcohol/caps/labels/caramel/herb/preform) also start at
-- zero: they are derived from movements + management stock_counts. Day-one
-- starting stock is entered as a 'baseline' stock_count via the reconcile screen
-- (app/api/stock/reconcile), not seeded here.
