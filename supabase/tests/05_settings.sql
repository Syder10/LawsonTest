-- ============================================================================
-- supabase/tests/05_settings.sql
--
-- Behaviour tests for 0006_app_settings.sql and
-- 0007_settings_conversions_recipes.sql — the admin-editable operational settings.
--
-- Two things here are load-bearing enough to be worth testing in the database
-- rather than only in the app:
--
--   1. A RECIPE MUST FILL ITS CARTON. That check caught the one real error in the
--      original bill of materials (Bitters concentrate divided by the 900 L batch
--      instead of the 1000 L concentrate tank, ~11% out). The app validates on
--      save for a readable message; the trigger is what makes it impossible from
--      the SQL editor too.
--
--   2. THE LEDGER MUST DEDUCT WHAT THE SETTINGS SAY. stock_balance_core derives
--      stamp consumption from packaging_bom, so if that table and app_settings
--      disagree, stamp balances and every stamp projection drift apart — which is
--      exactly the bug that shipped when the rate was believed to be 9 and 6 per
--      carton rather than one per bottle.
--
-- Runs as the table OWNER (RLS bypassed) except where a role is set explicitly,
-- so what is proved here is the TRIGGER and the FUNCTION, not a policy.
-- ============================================================================

-- ── The singleton, and the conversions 0007 adds ─────────────────────────────
do $$
declare n int; s record;
begin
  select count(*) into n from public.app_settings;
  assert n = 1, format('app_settings must hold exactly one row, got %s', n);

  select * into s from public.app_settings;
  assert s.id, 'the singleton row must be id = true';
  assert s.cartons_per_shift_bitters = 2500 and s.cartons_per_shift_ginger = 500,
    'the seeded forecast should be the confirmed 2,500 / 500 split';
  assert s.shifts_per_day = 3, 'three shifts a day';
  assert s.waste_allowance_pct = 0, 'no waste allowance until one is stated';
  assert s.alcohol_drums_per_day = 200, 'the business states 200 drums a day';

  assert s.bottles_per_carton = 12 and s.bottle_litres = 0.75,
    'a carton is 12 × 750 mL';
  assert s.stamps_per_bottle = 1, 'every bottle carries a tax stamp';
  assert s.drum_litres = 250 and s.gallon_litres = 20,
    'a drum is 250 L and a "gallon" is the 20 L drum the floor means by it';
  assert s.tank_litres = 1000 and s.rambo_litres = 2500, 'mixing tank 1000 L, Rambo 2500 L';
  assert s.caps_pcs_per_box = 4000 and s.label_pcs_per_roll = 4000 and s.preform_pcs_per_bag = 1008,
    'container contents as confirmed 2026-08-31 / 09-02';
  raise notice 'PASS app_settings singleton seeded with the confirmed figures';
end $$;

-- A second row must be impossible: every projection reads "the" settings.
do $$
declare blocked boolean := false;
begin
  begin
    insert into public.app_settings (id) values (false);
  exception when others then
    blocked := true;
  end;
  assert blocked, 'app_settings accepted a SECOND row — the singleton is not a singleton';
  raise notice 'PASS app_settings cannot hold a second row';
end $$;

-- ── The seeded recipes fill their cartons ────────────────────────────────────
do $$
declare target numeric; p public.product_type; total numeric;
begin
  select bottles_per_carton * bottle_litres into target from public.app_settings;
  assert target = 9, format('a carton should be 9 L, got %s', target);

  foreach p in array array['Bitters'::public.product_type, 'Ginger'::public.product_type] loop
    select sum(litres_per_carton) into total from public.product_recipes where product = p;
    assert round(total, 4) = round(target, 4),
      format('%s recipe sums to %s L, not %s', p, total, target);
  end loop;
  raise notice 'PASS both seeded recipes fill a 9 L carton exactly';
end $$;

-- The one real error the invariant caught: concentrate against the wrong vessel.
do $$
declare v numeric;
begin
  select litres_per_carton into v from public.product_recipes
   where product = 'Bitters' and ingredient = 'concentrate';
  -- 2 L per carton = 200 L per 100-carton batch, from the 1000 L concentrate tank.
  assert v = 2, format('Bitters concentrate should be 2 L per carton, got %s', v);
  raise notice 'PASS Bitters concentrate is 2 L per carton (1000 L tank, not the 900 L batch)';
end $$;

-- ── THE LEDGER AGREES WITH THE SETTINGS ──────────────────────────────────────
-- packaging_bom is what stock_balance_core deducts stamps with. If the seed here
-- and the seed in app_settings ever disagree, stamp balances stop matching every
-- projection — silently, because both numbers look plausible on their own.
do $$
declare expected numeric; b record;
begin
  select bottles_per_carton * stamps_per_bottle into expected from public.app_settings;
  for b in select product, stamps_per_carton from public.packaging_bom loop
    assert b.stamps_per_carton = expected, format(
      'packaging_bom deducts %s stamps per %s carton but the settings imply %s — the ledger and every projection would disagree',
      b.stamps_per_carton, b.product, expected);
  end loop;
  raise notice 'PASS packaging_bom deducts the settings'' stamp rate (% per carton)', expected;
end $$;

-- ── The invariant: a recipe cannot stop filling its carton ───────────────────
-- The constraint is DEFERRABLE INITIALLY DEFERRED, so it fires at COMMIT — which a
-- plpgsql EXCEPTION block cannot catch (a subtransaction's commit does not run
-- deferred triggers). SET CONSTRAINTS ALL IMMEDIATE moves the check to the end of
-- each statement, which is exactly what an app sending ONE bad update experiences.
begin;
set constraints all immediate;

do $$
declare blocked boolean := false; v numeric;
begin
  begin
    update public.product_recipes set litres_per_carton = 4
     where product = 'Bitters' and ingredient = 'water';
  exception when check_violation then
    blocked := true;
  end;
  assert blocked, 'a recipe was allowed to stop filling its carton';
  select litres_per_carton into v from public.product_recipes
   where product = 'Bitters' and ingredient = 'water';
  assert v = 4.36, format('the rejected edit must not have stuck, got %s', v);
  raise notice 'PASS a single edit that breaks the carton total is rejected';
end $$;

-- Deleting an ingredient breaks the total too, so it is rejected the same way.
do $$
declare blocked boolean := false;
begin
  begin
    delete from public.product_recipes where product = 'Ginger' and ingredient = 'spices';
  exception when check_violation then
    blocked := true;
  end;
  assert blocked, 'an ingredient was deleted without rebalancing the recipe';
  raise notice 'PASS removing an ingredient alone is rejected';
end $$;

rollback;

-- ...but a multi-row edit that KEEPS the total is fine, with the constraint left
-- DEFERRED as the migration declares it. That is the whole reason for deferring:
-- judged per statement, moving litres from one ingredient to another would be
-- rejected halfway through a perfectly valid change. psql autocommits, so this DO
-- block IS a transaction — if the deferral were wrong, this statement would fail.
do $$
declare total numeric;
begin
  update public.product_recipes set litres_per_carton = 0.6
   where product = 'Bitters' and ingredient = 'spices';
  update public.product_recipes set litres_per_carton = 3.86
   where product = 'Bitters' and ingredient = 'water';
  select sum(litres_per_carton) into total from public.product_recipes where product = 'Bitters';
  assert round(total, 4) = 9, format('Bitters should still sum to 9 L, got %s', total);
  raise notice 'PASS litres can be moved between ingredients in one transaction';
end $$;

-- Put the confirmed recipe back, in one transaction for the same reason.
do $$
begin
  update public.product_recipes set litres_per_carton = 0.1
   where product = 'Bitters' and ingredient = 'spices';
  update public.product_recipes set litres_per_carton = 4.36
   where product = 'Bitters' and ingredient = 'water';
end $$;

-- ════════════════════════ save_recipes ════════════════════════
-- Fixtures. Inserting into auth.users fires handle_new_user() (0003), which
-- provisions the matching profiles row from the metadata.
insert into auth.users (id, email, raw_user_meta_data) values
  ('5a5a5a5a-0007-4000-8000-000000000001', 'settings-admin@lawson.test',
   '{"full_name":"Settings Admin","role":"admin"}'::jsonb),
  ('5a5a5a5a-0007-4000-8000-000000000002', 'settings-super@lawson.test',
   '{"full_name":"Settings Supervisor","role":"supervisor","department":"Packaging","group_number":"1"}'::jsonb);

-- A supervisor must not be able to change a recipe. save_recipes is SECURITY
-- DEFINER — it bypasses RLS by design — so this check lives inside the function,
-- and it is the only thing standing between any signed-in user and every material
-- projection in the app.
set request.jwt.claim.sub = '5a5a5a5a-0007-4000-8000-000000000002';
do $$
declare blocked boolean := false;
begin
  begin
    perform 1 from public.save_recipes('[{"product":"Bitters","ingredient":"water","label":"Water","litres_per_carton":9}]'::jsonb);
  exception when insufficient_privilege then
    blocked := true;
  end;
  assert blocked, 'SECURITY: a supervisor was able to rewrite a product recipe';
  raise notice 'PASS save_recipes refuses a non-admin';
end $$;

-- As an admin: replacing a product's recipe INCLUDING removing an ingredient. This
-- is the case an upsert-then-delete over the Data API cannot do — two transactions,
-- and the state in between does not fill a carton.
set request.jwt.claim.sub = '5a5a5a5a-0007-4000-8000-000000000001';
do $$
declare n int; total numeric; w numeric;
begin
  perform 1 from public.save_recipes($json$[
    {"product":"Bitters","ingredient":"alcohol","label":"Raw ethanol","litres_per_carton":2.5,"display_order":1},
    {"product":"Bitters","ingredient":"concentrate","label":"Concentrate extract","litres_per_carton":2,"display_order":2},
    {"product":"Bitters","ingredient":"water","label":"Water","litres_per_carton":4.5,"display_order":3}
  ]$json$::jsonb);

  select count(*), sum(litres_per_carton) into n, total
    from public.product_recipes where product = 'Bitters';
  assert n = 3, format('Bitters should have 3 ingredients after the replace, got %s', n);
  assert round(total, 4) = 9, format('the replaced recipe must still fill the carton, got %s', total);
  select litres_per_carton into w from public.product_recipes
   where product = 'Bitters' and ingredient = 'water';
  assert w = 4.5, format('water should carry the remainder, got %s', w);

  -- The other product is untouched: only the products named in the payload are replaced.
  select count(*) into n from public.product_recipes where product = 'Ginger';
  assert n = 5, format('Ginger should be untouched with 5 ingredients, got %s', n);
  raise notice 'PASS save_recipes replaces one product atomically, removals included';
end $$;

-- A payload that does not fill the carton is refused, even though the function
-- deletes and inserts in one go.
begin;
set constraints all immediate;
do $$
declare blocked boolean := false;
begin
  begin
    perform 1 from public.save_recipes('[{"product":"Ginger","ingredient":"water","label":"Water","litres_per_carton":5}]'::jsonb);
  exception when check_violation then
    blocked := true;
  end;
  assert blocked, 'save_recipes accepted a recipe that does not fill its carton';
  raise notice 'PASS save_recipes is still bound by the carton invariant';
end $$;
rollback;

-- Restore the seeded Bitters recipe so the database is left as the migration made it.
set request.jwt.claim.sub = '5a5a5a5a-0007-4000-8000-000000000001';
do $$
begin
  perform 1 from public.save_recipes($json$[
    {"product":"Bitters","ingredient":"alcohol","label":"Raw ethanol","litres_per_carton":2.5,"display_order":1},
    {"product":"Bitters","ingredient":"concentrate","label":"Concentrate extract","litres_per_carton":2,"display_order":2},
    {"product":"Bitters","ingredient":"water","label":"Water","litres_per_carton":4.36,"display_order":3},
    {"product":"Bitters","ingredient":"spices","label":"Spices","litres_per_carton":0.1,"display_order":4},
    {"product":"Bitters","ingredient":"caramel","label":"Caramel","litres_per_carton":0.04,"display_order":5}
  ]$json$::jsonb);
end $$;
reset request.jwt.claim.sub;

-- ════════════════════════ grants ════════════════════════
-- PostgreSQL grants EXECUTE on every new function to PUBLIC, and anon belongs to
-- PUBLIC — so omitting anon from a GRANT does nothing. The anon key ships in the
-- browser bundle, and save_recipes bypasses RLS.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    raise notice 'SKIP grant assertions — API roles absent in this environment';
    return;
  end if;

  assert not has_function_privilege('anon', 'public.save_recipes(jsonb)', 'execute'),
    'SECURITY: anon can execute save_recipes — it bypasses RLS and the anon key is public';
  assert has_function_privilege('authenticated', 'public.save_recipes(jsonb)', 'execute'),
    'authenticated cannot execute save_recipes — the admin settings page could not save';
  assert has_table_privilege('authenticated', 'public.product_recipes', 'select'),
    'authenticated lacks SELECT on product_recipes — the reports could not read the recipe';
  assert has_table_privilege('authenticated', 'public.app_settings', 'update'),
    'authenticated lacks UPDATE on app_settings — RLS, not the grant, is what limits it to admins';
  raise notice 'PASS settings grants: anon locked out of save_recipes, authenticated allowed';
end $$;

-- RLS is what limits the settings to admins, and it must be ON for both tables —
-- the broad table grants above are only safe because of it.
do $$
declare n int;
begin
  select count(*) into n from pg_class c
    join pg_namespace ns on ns.oid = c.relnamespace
   where ns.nspname = 'public' and c.relname in ('app_settings', 'product_recipes')
     and c.relrowsecurity;
  assert n = 2, format('both settings tables must have RLS enabled, got %s', n);
  raise notice 'PASS RLS enabled on app_settings and product_recipes';
end $$;

