-- ============================================================================
-- supabase/tests/06_stock_separation.sql
--
-- Behaviour tests for 0008_stock_separation.sql: the stock/procurement role
-- split, supplier invoices, and the dispatch log.
--
-- THE CLAIM THESE TESTS EXIST TO PROVE
-- ------------------------------------
-- PRD.md §4.1 says `procurement` can READ every stock screen and can WRITE
-- nothing. That is an access-control claim, so it is asserted here against a real
-- database rather than inferred from the route guards or from what the navigation
-- happens to offer. A hidden button is not access control.
--
-- HOW THESE RUN, AND WHY IT DIFFERS FROM 02_security.sql
-- -----------------------------------------------------
-- 02_security.sql runs as the table OWNER on purpose, to prove its protections
-- come from a TRIGGER rather than a policy — an owner bypasses RLS entirely.
--
-- That would be useless here: RLS *is* the boundary being tested. So every write
-- assertion below runs as `authenticated` with the caller's JWT claim set, which is
-- exactly the path PostgREST takes. Without the role switch these tests would all
-- pass while the policies were wide open.
--
-- An RLS-blocked INSERT raises 42501 (insufficient_privilege); an RLS-blocked
-- SELECT returns ZERO ROWS with no error. Both shapes are asserted.
--
-- IDENTITY IS SET WITH set_config(), NOT `SET LOCAL`
-- -------------------------------------------------
-- `perform set_config('request.jwt.claim.sub', <uuid>, true)` — the `true` makes it
-- transaction-local, so it unwinds with the DO block exactly as SET LOCAL would.
-- It is used because it is an ordinary function call: a dotted custom GUC in a
-- plpgsql `SET LOCAL` is parsed as a plpgsql statement rather than passed through,
-- and the failure mode is a confusing syntax error rather than a wrong identity.
--
-- SHARED STATE
-- ------------
-- Every suite runs in sequence against ONE database, so this file sees every row
-- 01–05 left behind. Two consequences shaped the assertions below:
--
--   • Fixed dates in a private window (2026-11-10), never current_date.
--     packaging_daily_records is unique on (department, date, shift, product), and
--     02_security.sql already inserts Packaging/Morning/Bitters on 2026-09-06 —
--     today's date as of writing, so current_date would collide.
--   • Cumulative figures are asserted as DELTAS. finished_goods_stock() sums every
--     packaging row ever written and three earlier suites insert Bitters rows; the
--     ledger likewise carries 01's alcohol re-anchor. An absolute expectation here
--     would encode another suite's fixtures and break when one of them changes.
--
-- The dates are written out literally rather than held in a psql \set variable:
-- psql does not interpolate inside dollar-quoted strings, so `:d1` would arrive at
-- the server as the literal text ":d1" inside every DO block.
-- ============================================================================

-- ── Fixtures: one account per role ──────────────────────────────────────────
-- Inserting into auth.users fires handle_new_user() (0003), which provisions the
-- profile from the metadata.
insert into auth.users (id, email, raw_user_meta_data) values
  ('a0000000-0000-0000-0000-00000000000a', 'stockkeeper@lawson.test',
   '{"full_name":"Sena Stock","role":"stock"}'::jsonb),
  ('b0000000-0000-0000-0000-00000000000b', 'buyer@lawson.test',
   '{"full_name":"Paa Procurement","role":"procurement"}'::jsonb),
  ('c0000000-0000-0000-0000-00000000000c', 'boss@lawson.test',
   '{"full_name":"Mina Manager","role":"manager"}'::jsonb),
  ('d0000000-0000-0000-0000-00000000000d', 'floor@lawson.test',
   '{"full_name":"Yaw Supervisor","role":"supervisor","department":"Packaging","group_number":"1"}'::jsonb);

do $$
declare r public.user_role;
begin
  -- The `stock` role only provisions if 0008's enum value landed AND
  -- handle_new_user's defensive parse accepts it. That parse falls back to
  -- 'supervisor' on an unrecognised value, so without this assertion a missing enum
  -- value would make every "stock can write" test below fail in a way that looks
  -- like an RLS problem, and every "cannot write" test pass for the wrong reason.
  select role into r from public.profiles where id = 'a0000000-0000-0000-0000-00000000000a';
  assert r = 'stock', format('stock fixture must have role stock, got %s — did 0008 add the enum value?', r);
  select role into r from public.profiles where id = 'b0000000-0000-0000-0000-00000000000b';
  assert r = 'procurement', format('procurement fixture role expected procurement, got %s', r);
  raise notice 'PASS fixtures provisioned with the new stock role';
end $$;

-- ════════════════════════ the role predicates ════════════════════════

do $$
declare ok boolean;
begin
  set local role authenticated;

  perform set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000000a', true);
  select public.can_write_stock() into ok;
  assert ok, 'stock must be able to write stock';
  select public.can_read_stock() into ok;
  assert ok, 'stock must be able to read stock';

  perform set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-00000000000b', true);
  select public.can_write_stock() into ok;
  assert not ok, 'SECURITY: procurement must NOT be able to write stock';
  select public.can_read_stock() into ok;
  assert ok, 'procurement must still be able to read stock';

  perform set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-00000000000c', true);
  select public.can_write_stock() into ok;
  assert ok, 'manager must be able to write stock (management owns reconciliation)';

  perform set_config('request.jwt.claim.sub', 'd0000000-0000-0000-0000-00000000000d', true);
  select public.can_write_stock() into ok;
  assert not ok, 'SECURITY: a supervisor must NOT be able to write stock';
  select public.can_read_stock() into ok;
  assert not ok, 'SECURITY: a supervisor must NOT be able to read the stock office data';

  reset role;
  raise notice 'PASS can_write_stock / can_read_stock role matrix';
end $$;

-- is_procurement_staff() is kept as an ALIAS of the READ predicate so the five
-- policies written against it in 0004/0005 need no rewrite — a policy rewrite is
-- where an access-control regression hides. If it ever drifts from
-- can_read_stock(), those five policies silently change meaning.
do $$
declare a boolean; b boolean;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-00000000000b', true);
  select public.is_procurement_staff() into a;
  select public.can_read_stock()       into b;
  assert a = b, 'is_procurement_staff() must remain an alias of can_read_stock()';

  perform set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000000a', true);
  select public.is_procurement_staff() into a;
  assert a, 'the new stock role must satisfy the legacy is_procurement_staff() read alias';
  reset role;
  raise notice 'PASS is_procurement_staff is an alias of can_read_stock';
end $$;

-- ════════════════════════ receipts: the write path procurement LOSES ════════════════════════

-- This is the capability being removed. Before 0008 this INSERT succeeded.
do $$
declare blocked boolean := false;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-00000000000b', true);
  begin
    insert into public.raw_materials_received (date, material_type, stamp_total_pcs)
    values ('2026-11-10', 'tax_stamp', 90000);
  exception when insufficient_privilege then
    blocked := true;
  end;
  reset role;
  assert blocked, 'SECURITY: procurement was able to log a receipt — it is supposed to be read-only';
  raise notice 'PASS procurement cannot insert a receipt';
end $$;

-- …and the stock keeper can.
do $$
declare n int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000000a', true);
  insert into public.raw_materials_received (date, material_type, stamp_total_pcs)
  values ('2026-11-10', 'tax_stamp', 90000);
  -- Read it back through the same RLS path that wrote it.
  select count(*) into n from public.raw_materials_received where date = '2026-11-10';
  reset role;
  assert n = 1, format('the stock role must be able to log and read back a receipt, saw %s', n);
  raise notice 'PASS stock can insert a receipt';
end $$;

-- Procurement keeps SIGHT of it. An RLS-blocked SELECT returns zero rows rather
-- than erroring, so "can read" has to be asserted as a row count.
do $$
declare n int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-00000000000b', true);
  select count(*) into n from public.raw_materials_received;
  reset role;
  assert n >= 1, 'procurement must still be able to READ receipts (it lost writes, not sight)';
  raise notice 'PASS procurement can read receipts';
end $$;

-- A supervisor is outside the stock office entirely: zero rows, no error.
do $$
declare n int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'd0000000-0000-0000-0000-00000000000d', true);
  select count(*) into n from public.raw_materials_received;
  reset role;
  assert n = 0, format('SECURITY: a supervisor read %s receipt rows; expected 0', n);
  raise notice 'PASS a supervisor sees no receipts';
end $$;

-- ════════════════════════ stock counts re-anchor the ledger ════════════════════════

-- A count rewrites history, so it moved from is_procurement_staff() to
-- can_write_stock(). This is the highest-consequence permission in the split.
do $$
declare blocked boolean := false;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-00000000000b', true);
  begin
    perform public.record_stock_count('alcohol', '2026-11-10', 500);
  exception when insufficient_privilege then
    blocked := true;
  end;
  reset role;
  assert blocked, 'SECURITY: procurement recorded a stock count — a count RE-ANCHORS the ledger';
  raise notice 'PASS procurement cannot record a stock count';
end $$;

-- The variance is asserted as counted MINUS the balance the ledger already held,
-- read immediately before the count. 01_ledger.sql leaves alcohol re-anchored at
-- 100, so a hardcoded expectation would silently encode that suite's fixtures —
-- and what this test is about is the SNAPSHOT behaviour, not a particular balance.
do $$
declare v public.stock_counts; v_before numeric;
begin
  v_before := public.stock_remaining_asof('alcohol', '2026-11-10');

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000000a', true);
  v := public.record_stock_count('alcohol', '2026-11-10', 500, null, null, null, 'reconciliation', 'phase-1 test');
  reset role;

  assert v.counted_qty = 500, format('counted_qty expected 500, got %s', v.counted_qty);
  assert v.computed_qty = v_before, format(
    'computed_qty must snapshot the pre-count balance (%s), got %s', v_before, v.computed_qty);
  -- variance is a GENERATED column: counted − computed.
  assert v.variance = 500 - v_before, format(
    'variance expected %s (500 − %s), got %s', 500 - v_before, v_before, v.variance);
  -- And the count RE-ANCHORS the ledger, which is precisely why it is a write.
  assert public.stock_remaining_asof('alcohol', '2026-11-10') = 500,
    'the count must re-anchor the balance to 500';
  raise notice 'PASS stock can record a count; variance generated as counted − snapshot';
end $$;

-- ════════════════════════ invoices ════════════════════════

do $$
declare v public.invoices; n int; total numeric;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000000a', true);

  v := public.record_invoice(
    'Ghana Stamps Ltd', 'INV-1001', '2026-11-10',
    '[{"material_type":"tax_stamp","quantity":10,"unit":"boxes","unit_cost":250},
       {"material_type":"seal_tape","quantity":4,"unit":"boxes","unit_cost":80}]'::jsonb,
    'GHS', 2820
  );

  select count(*), sum(line_total) into n, total
    from public.invoice_lines where invoice_id = v.id;
  reset role;

  assert n = 2, format('expected 2 invoice lines, got %s', n);
  -- line_total is GENERATED: 10×250 + 4×80 = 2820.
  assert total = 2820, format('generated line totals expected 2820, got %s', total);
  assert v.currency = 'GHS', format('currency expected GHS, got %s', v.currency);
  raise notice 'PASS stock can record an invoice; line_total is generated';
end $$;

-- FR-9: a declared total that disagrees with the line sum is WARNED about in the
-- UI and must NOT be rejected here. Real invoices carry freight, tax and discounts
-- the line model does not represent, and refusing a real document makes users type
-- a fake total — at which point the record is worthless.
do $$
declare v public.invoices; total numeric;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000000a', true);
  v := public.record_invoice(
    'Ghana Stamps Ltd', 'INV-1002', '2026-11-10',
    '[{"material_type":"carton_bitters","quantity":100,"unit":"pcs","unit_cost":1}]'::jsonb,
    'GHS', 500                              -- declared 500, lines sum to 100
  );
  select sum(line_total) into total from public.invoice_lines where invoice_id = v.id;
  reset role;
  assert v.declared_total = 500, 'declared_total must be stored as given';
  assert total = 100, format('line sum expected 100, got %s', total);
  assert v.declared_total <> total, 'this fixture is meant to MISMATCH — see FR-9';
  raise notice 'PASS a declared total may disagree with the line sum (warn, never block)';
end $$;

-- Same number twice from ONE supplier is a duplicate; from two suppliers it is not.
do $$
declare dup boolean := false; v public.invoices;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000000a', true);
  begin
    perform public.record_invoice('Ghana Stamps Ltd', 'INV-1001', '2026-11-10',
      '[{"material_type":"tax_stamp","quantity":1,"unit":"boxes","unit_cost":1}]'::jsonb);
  exception when unique_violation then
    dup := true;
  end;
  assert dup, 'the same invoice number twice from one supplier must be rejected';

  -- The same number from a DIFFERENT supplier is legitimate.
  v := public.record_invoice('Accra Cartons', 'INV-1001', '2026-11-10',
    '[{"material_type":"carton_ginger","quantity":50,"unit":"pcs","unit_cost":2}]'::jsonb);
  reset role;
  assert v.id is not null, 'the same invoice number from a different supplier must be allowed';
  raise notice 'PASS invoice number is unique per supplier, not globally';
end $$;

-- An invoice with no usable line is not a record. The fixture uses a line with
-- quantity 0 rather than an empty array ON PURPOSE: an empty array is rejected
-- BEFORE the header is inserted, which proves nothing about atomicity. A zero
-- quantity gets past the array check, so the header is already written when the
-- rule fires — and the assertion that no header survives is what proves the RPC
-- rolls back as one unit.
do $$
declare bad boolean := false; n int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000000a', true);
  begin
    perform public.record_invoice('Empty Supplier', 'INV-EMPTY', '2026-11-10',
      '[{"material_type":"tax_stamp","quantity":0,"unit":"boxes","unit_cost":5}]'::jsonb);
  exception when others then
    bad := true;
  end;
  select count(*) into n from public.invoices where supplier = 'Empty Supplier';
  reset role;
  assert bad, 'an invoice whose only line has zero quantity must be rejected';
  assert n = 0, format('the rejected invoice left %s orphan header(s) behind — the RPC is not atomic', n);
  raise notice 'PASS an invoice with no usable line is rejected atomically';
end $$;

do $$
declare blocked boolean := false;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-00000000000b', true);
  begin
    perform public.record_invoice('Sneaky Supplier', 'INV-X', '2026-11-10',
      '[{"material_type":"tax_stamp","quantity":1,"unit":"boxes","unit_cost":1}]'::jsonb);
  exception when insufficient_privilege then
    blocked := true;
  end;
  reset role;
  assert blocked, 'SECURITY: procurement recorded an invoice';
  raise notice 'PASS procurement cannot record an invoice';
end $$;

-- Procurement reads invoices — that is the point of keeping the role at all.
do $$
declare n int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-00000000000b', true);
  select count(*) into n from public.invoices;
  reset role;
  assert n >= 3, format('procurement must read invoices, saw %s of the 3 recorded', n);
  raise notice 'PASS procurement can read invoices';
end $$;

-- ── A receipt links to an invoice line, and survives the invoice's deletion ──
-- FR-11: goods arrive before paperwork, so the link is nullable; and deleting an
-- invoice must never delete the fact that goods physically arrived.
do $$
declare v_line uuid; v_inv uuid; v_receipt uuid; v_after uuid; n int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000000a', true);
  select l.id, l.invoice_id into v_line, v_inv
    from public.invoice_lines l
    join public.invoices i on i.id = l.invoice_id
   where i.invoice_number = 'INV-1002' limit 1;
  assert v_line is not null, 'fixture lookup failed — INV-1002 should be readable by stock';

  insert into public.raw_materials_received (date, material_type, carton_total_pcs, invoice_line_id)
  values ('2026-11-10', 'carton_bitters', 100, v_line)
  returning id into v_receipt;
  reset role;

  -- Deleted as the OWNER: no UPDATE/DELETE policy exists for authenticated users,
  -- which is itself asserted in the structural section below.
  delete from public.invoices where id = v_inv;

  select count(*) into n from public.raw_materials_received where id = v_receipt;
  assert n = 1, 'deleting an invoice must NOT delete the receipt — the goods still arrived';
  select invoice_line_id into v_after from public.raw_materials_received where id = v_receipt;
  assert v_after is null, 'the receipt''s invoice_line_id must be SET NULL, not left dangling';
  raise notice 'PASS a receipt outlives its invoice with invoice_line_id set null';
end $$;

-- ════════════════════════ dispatch ════════════════════════

do $$
declare v public.dispatches; n int; c numeric;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000000a', true);
  v := public.record_dispatch(
    '2026-11-10', 'Morning', 'GT-4821-22', 'Kwame Mensah', 'Kumasi Depot',
    '[{"product":"Bitters","cartons":120},{"product":"Ginger","cartons":40}]'::jsonb,
    'WB-5501', 'full load'
  );
  select count(*), sum(cartons) into n, c from public.dispatch_lines where dispatch_id = v.id;
  reset role;
  assert n = 2, format('expected 2 dispatch lines, got %s', n);
  assert c = 160, format('expected 160 cartons, got %s', c);
  assert v.vehicle_reg = 'GT-4821-22', 'vehicle must be recorded';
  assert v.released_by = 'Sena Stock', format('released_by should come from the profile, got %s', v.released_by);
  raise notice 'PASS stock can record a dispatch with lines';
end $$;

-- A zero for the product that was not loaded is normal form input, not an error:
-- it is skipped. FR-13 is enforced by requiring at least one POSITIVE line.
do $$
declare v public.dispatches; n int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000000a', true);
  v := public.record_dispatch(
    '2026-11-10', 'Afternoon', 'GT-1111-20', 'Ama Boateng', 'Takoradi',
    '[{"product":"Bitters","cartons":75},{"product":"Ginger","cartons":0}]'::jsonb
  );
  select count(*) into n from public.dispatch_lines where dispatch_id = v.id;
  reset role;
  assert n = 1, format('a zero line must be skipped, not stored — got %s lines', n);
  raise notice 'PASS a zero-carton line is skipped';
end $$;

-- …but an all-zero dispatch is a delivery of nothing, and must not survive as a
-- header with no lines (FR-13). Atomicity is the real assertion here: the header is
-- inserted before the rule fires, so a non-atomic RPC would leave it behind.
do $$
declare bad boolean := false; n int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000000a', true);
  begin
    perform public.record_dispatch(
      '2026-11-10', 'Night', 'GT-0000-00', 'Nobody', 'Nowhere',
      '[{"product":"Bitters","cartons":0},{"product":"Ginger","cartons":0}]'::jsonb);
  exception when others then
    bad := true;
  end;
  select count(*) into n from public.dispatches where vehicle_reg = 'GT-0000-00';
  reset role;
  assert bad, 'an all-zero dispatch must be rejected';
  assert n = 0, format('the rejected dispatch left %s orphan header(s) — the RPC is not atomic', n);
  raise notice 'PASS an all-zero dispatch is rejected atomically, leaving no header';
end $$;

-- The waybill index is PARTIAL: duplicates rejected, but many nulls allowed.
do $$
declare dup boolean := false; v public.dispatches; n int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000000a', true);
  begin
    perform public.record_dispatch('2026-11-10', 'Morning', 'GT-2222-21', 'Kojo', 'Tema',
      '[{"product":"Bitters","cartons":10}]'::jsonb, 'WB-5501');
  exception when unique_violation then
    dup := true;
  end;
  assert dup, 'a duplicate waybill number must be rejected';

  -- Two dispatches with NO waybill are not duplicates of each other. A plain UNIQUE
  -- constraint would be semantically wrong here, hence the partial index.
  perform public.record_dispatch('2026-11-10', 'Morning', 'GT-3333-21', 'Adjoa', 'Cape Coast',
    '[{"product":"Ginger","cartons":15}]'::jsonb, null);
  v := public.record_dispatch('2026-11-10', 'Morning', 'GT-4444-21', 'Kofi', 'Ho',
    '[{"product":"Ginger","cartons":25}]'::jsonb, null);
  select count(*) into n from public.dispatches where waybill_number is null;
  reset role;
  assert v.id is not null and n >= 2, 'multiple dispatches with no waybill must be allowed';
  raise notice 'PASS waybill uniqueness is partial (nulls unconstrained)';
end $$;

-- One line per product per load, so a quantity cannot be double-entered.
do $$
declare v_id uuid; dup boolean := false;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000000a', true);
  select id into v_id from public.dispatches where waybill_number = 'WB-5501';
  begin
    insert into public.dispatch_lines (dispatch_id, product, cartons) values (v_id, 'Bitters', 5);
  exception when unique_violation then
    dup := true;
  end;
  reset role;
  assert dup, 'a second line for the same product on one dispatch must be rejected';
  raise notice 'PASS dispatch_lines is unique per (dispatch, product)';
end $$;

do $$
declare blocked boolean := false;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-00000000000b', true);
  begin
    perform public.record_dispatch('2026-11-10', 'Morning', 'GT-9999-99', 'Ghost', 'Elsewhere',
      '[{"product":"Bitters","cartons":10}]'::jsonb);
  exception when insufficient_privilege then
    blocked := true;
  end;
  reset role;
  assert blocked, 'SECURITY: procurement recorded a dispatch';
  raise notice 'PASS procurement cannot record a dispatch';
end $$;

-- ── Aggregation, and the reason it is a function rather than a view ──────────
-- dispatch_totals is SECURITY INVOKER, so the caller's own RLS applies. A view
-- would bypass base-table RLS unless security_invoker were set — which is exactly
-- what the grants safety gate in 0005 warns about.
do $$
declare c_bitters numeric; c_ginger numeric;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-00000000000b', true);  -- read-only role
  select cartons into c_bitters
    from public.dispatch_totals('2026-11-10', '2026-11-10') where product = 'Bitters';
  select cartons into c_ginger
    from public.dispatch_totals('2026-11-10', '2026-11-10') where product = 'Ginger';
  reset role;
  -- Bitters: 120 + 75. The duplicate-waybill attempt (10) raised and rolled back.
  assert c_bitters = 195, format('Bitters dispatched expected 195, got %s', c_bitters);
  -- Ginger: 40 + 15 + 25.
  assert c_ginger = 80, format('Ginger dispatched expected 80, got %s', c_ginger);
  raise notice 'PASS dispatch_totals aggregates for a read-only caller';
end $$;

-- The supervisor cannot read dispatches, so the SAME function must return nothing
-- for them. This is the assertion that proves the aggregation respects RLS rather
-- than quietly bypassing it.
do $$
declare n int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'd0000000-0000-0000-0000-00000000000d', true);
  select count(*) into n from public.dispatch_totals('2026-11-10', '2026-11-10');
  reset role;
  assert n = 0, format('SECURITY: dispatch_totals leaked %s rows to a supervisor — it is bypassing RLS', n);
  raise notice 'PASS dispatch_totals respects the caller''s RLS';
end $$;

do $$
declare v_label text; v_cartons numeric; bad boolean := false;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000000a', true);
  select label, cartons into v_label, v_cartons
    from public.dispatch_breakdown('2026-11-10', '2026-11-10', 'destination')
   where label = 'Kumasi Depot';
  assert v_cartons = 160, format('Kumasi Depot expected 160 cartons, got %s', v_cartons);

  select label into v_label
    from public.dispatch_breakdown('2026-11-10', '2026-11-10', 'driver')
   where label = 'Kwame Mensah';
  assert v_label is not null, 'driver breakdown must include the recorded driver';

  -- The dimension is whitelisted, not interpolated. An arbitrary string must be
  -- refused rather than reaching a dynamically built statement.
  --
  -- `perform count(*) from …`, not `perform * from …`: PERFORM takes what would
  -- follow SELECT, so `perform *` is a syntax error — and this very EXCEPTION
  -- handler would have swallowed it and reported a PASS for the wrong reason.
  begin
    perform count(*) from public.dispatch_breakdown('2026-11-10', '2026-11-10', 'vehicle_reg; drop table x');
  exception when others then
    bad := true;
  end;
  reset role;
  assert bad, 'an unknown breakdown dimension must be rejected';
  raise notice 'PASS dispatch_breakdown groups by vehicle/driver/destination and whitelists the dimension';
end $$;

-- ════════════════════════ structural invariants ════════════════════════

-- Table grants are broad on the explicit assumption that RLS is the boundary
-- (03_api_grants.sql asserts this globally). Restated for the new tables, because
-- a table added without RLS is fully readable by anyone holding the anon key — and
-- the anon key ships in the browser bundle.
do $$
declare t text; n int;
begin
  foreach t in array array['invoices','invoice_lines','dispatches','dispatch_lines'] loop
    select count(*) into n from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
     where ns.nspname = 'public' and c.relname = t and c.relrowsecurity;
    assert n = 1, format('table %s has no RLS enabled but is granted to authenticated', t);

    select count(*) into n from pg_policies where schemaname = 'public' and tablename = t;
    assert n >= 2, format('table %s has only %s policy/policies — expected read + write at minimum', t, n);
  end loop;
  raise notice 'PASS all four new tables have RLS with explicit policies';
end $$;

-- No UPDATE or DELETE for authenticated users. Edit/delete of a submitted record is
-- not a feature of this system (PRD.md §3.2); a mistake is corrected by a
-- compensating entry.
--
-- THIS ASSERTION IS WHY 0008 ENDS WITH EXPLICIT REVOKES. 0005 sets
--   alter default privileges in schema public
--     grant select, insert, update, delete on tables to anon, authenticated, service_role;
-- so every table created after it inherits UPDATE and DELETE automatically. A
-- migration that merely granted select+insert would read like a restriction and
-- change nothing. Asserting the PRIVILEGE rather than trusting the GRANT is what
-- catches that.
do $$
declare t text;
begin
  foreach t in array array['invoices','invoice_lines','dispatches','dispatch_lines'] loop
    assert has_table_privilege('authenticated', 'public.' || t, 'select'),
      format('authenticated needs SELECT on %s', t);
    assert has_table_privilege('authenticated', 'public.' || t, 'insert'),
      format('authenticated needs INSERT on %s', t);
    assert not has_table_privilege('authenticated', 'public.' || t, 'update'),
      format('authenticated must NOT hold UPDATE on %s (0005 default privileges grant it — 0008 must revoke)', t);
    assert not has_table_privilege('authenticated', 'public.' || t, 'delete'),
      format('authenticated must NOT hold DELETE on %s (0005 default privileges grant it — 0008 must revoke)', t);
  end loop;
  raise notice 'PASS the new tables are append-only for authenticated users';
end $$;

-- anon inherits from the same default-privileges block. Every policy on these
-- tables is `to authenticated`, so RLS already yields anon nothing — but a
-- privilege that is only harmless because a policy happens to be written correctly
-- is one policy edit away from being a hole, and none of this data is public.
do $$
declare t text;
begin
  foreach t in array array['invoices','invoice_lines','dispatches','dispatch_lines'] loop
    assert not has_table_privilege('anon', 'public.' || t, 'select'),
      format('SECURITY: anon holds SELECT on %s — the anon key ships in the browser bundle', t);
    assert not has_table_privilege('anon', 'public.' || t, 'insert'),
      format('SECURITY: anon holds INSERT on %s', t);
  end loop;
  raise notice 'PASS anon holds no privileges on the new tables';
end $$;

-- Postgres grants EXECUTE to PUBLIC on every new function, and anon is in PUBLIC,
-- so merely omitting anon from a GRANT does nothing. The SECURITY DEFINER RPCs
-- here would otherwise be callable by anyone holding the anon key.
--
-- Type names are SCHEMA-QUALIFIED in these signatures: has_function_privilege
-- resolves them through search_path, and an unqualified `shift_type` would fail to
-- resolve rather than report a missing privilege.
do $$
declare fn text;
begin
  foreach fn in array array[
    'public.record_dispatch(date, public.shift_type, text, text, text, jsonb, text, text)',
    'public.record_invoice(text, text, date, jsonb, text, numeric, text)',
    'public.can_write_stock()',
    'public.can_read_stock()'
  ] loop
    assert not has_function_privilege('anon', fn, 'execute'),
      format('SECURITY: anon can execute %s — the anon key ships in the browser bundle', fn);
    assert has_function_privilege('authenticated', fn, 'execute'),
      format('authenticated cannot execute %s', fn);
  end loop;
  raise notice 'PASS the new functions are revoked from anon and granted to authenticated';
end $$;

-- The two write RPCs must be SECURITY DEFINER (they insert on behalf of a caller
-- who holds no direct write path), and the two aggregations must NOT be, or they
-- would bypass the caller's RLS.
do $$
declare v boolean;
begin
  select p.prosecdef into v from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'record_dispatch';
  assert v, 'record_dispatch must be SECURITY DEFINER';

  select p.prosecdef into v from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'record_invoice';
  assert v, 'record_invoice must be SECURITY DEFINER';

  select p.prosecdef into v from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'dispatch_totals';
  assert not v, 'dispatch_totals must be SECURITY INVOKER so the caller''s RLS applies';

  select p.prosecdef into v from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'dispatch_breakdown';
  assert not v, 'dispatch_breakdown must be SECURITY INVOKER so the caller''s RLS applies';
  raise notice 'PASS security context is correct on all four new functions';
end $$;

-- ════════════════════════ the decision that must NOT be "fixed" ════════════════════════
--
-- Dispatch is deliberately NOT wired into the finished-goods balance, and there is
-- no variance report (PRD.md §3.3). finished_goods_stock() keeps deriving from
-- packaging_daily_records.quantity_cartons_loaded.
--
-- This test asserts the DIVERGENCE, so anyone who later "fixes" it by making
-- dispatch feed the balance gets a failing test pointing at the decision rather
-- than a silent change in what the finished-goods number means.
--
-- Measured as a DELTA: finished_goods_stock() is cumulative over every packaging
-- row ever written, and three earlier suites insert Bitters rows.
do $$
declare v_before numeric; v_after numeric; v_dispatched numeric;
begin
  select available into v_before from public.finished_goods_stock() where product = 'Bitters';
  v_before := coalesce(v_before, 0);

  -- 300 produced, 50 of them recorded as loaded on the packaging record.
  insert into public.packaging_daily_records
    (date, shift, department, product, quantity_cartons_produced, quantity_cartons_loaded, user_id)
  values ('2026-11-10', 'Night', 'Packaging', 'Bitters', 300, 50,
          'd0000000-0000-0000-0000-00000000000d');

  select available into v_after from public.finished_goods_stock() where product = 'Bitters';
  select cartons  into v_dispatched
    from public.dispatch_totals('2026-11-10', '2026-11-10') where product = 'Bitters';

  -- The balance moves by produced − loaded = 250, from the packaging field ALONE.
  -- The 195 Bitters cartons in the dispatch log do not enter this figure at all.
  assert v_after - v_before = 250, format(
    'finished_goods_stock must move by produced − quantity_cartons_loaded only '
    '(expected +250, got %s). If dispatch now feeds the balance, that is a scope '
    'change — see PRD.md §3.3.', v_after - v_before);
  assert v_dispatched = 195, format('dispatch log expected 195 Bitters, got %s', v_dispatched);
  assert v_after - v_before <> 300 - v_dispatched,
    'the two figures are expected to DIVERGE by design';
  raise notice 'PASS dispatch does not feed the finished-goods balance (deliberate — PRD.md §3.3)';
end $$;

select '✓ 06_stock_separation.sql — role split, invoices and dispatch behaviour tests passed' as result;
