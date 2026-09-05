-- ============================================================================
-- 0007_settings_conversions_recipes.sql
-- Makes the unit conversions and the BOM recipes editable, completing what 0006
-- started. Self-contained (own RLS + grants), so it can be applied on its own.
--
-- WHAT IS EDITABLE AND WHAT IS NOT. Every NUMBER that feeds a calculation moves
-- here. The unit WORDS ("drums", "boxes", "rolls") deliberately stay in code:
-- they appear in entry-form labels, and those labels are the KEYS a submission is
-- posted under (see lib/domain/records-io). Renaming a unit from a settings page
-- would silently orphan in-flight drafts and change what the submit route reads —
-- that is a code change with a data migration, not a preference.
--
-- THE RECIPE INVARIANT IS ENFORCED HERE, NOT ONLY IN THE APP. A recipe whose
-- ingredients do not fill a carton is wrong by construction: it is the check that
-- caught a real error (Bitters concentrate was 2/900 instead of 2/1000, ~11% out).
-- The app validates on save for a readable message; this trigger makes it
-- impossible to break from the SQL editor either.
-- ============================================================================

-- ── Conversions on the settings singleton ───────────────────────────────────
alter table public.app_settings
  -- A carton is 12 × 750 mL bottles. Everything per-bottle and the recipe total
  -- derive from these two.
  add column bottles_per_carton smallint      not null default 12   check (bottles_per_carton between 1 and 96),
  add column bottle_litres      numeric(6,3)  not null default 0.75 check (bottle_litres > 0),

  -- Per-bottle material counts (user-confirmed 2026-09-03: one of each).
  add column caps_per_bottle     numeric(6,3) not null default 1 check (caps_per_bottle     >= 0),
  add column labels_per_bottle   numeric(6,3) not null default 1 check (labels_per_bottle   >= 0),
  add column stamps_per_bottle   numeric(6,3) not null default 1 check (stamps_per_bottle   >= 0),
  add column preforms_per_bottle numeric(6,3) not null default 1 check (preforms_per_bottle >= 0),

  -- What one container holds. `stock_materials.unit` names the container; these say
  -- how much is in it. The two tank capacities only affect how the bill of materials
  -- DISPLAYS a quantity (procurement orders vessels, the recipe specifies litres), but
  -- they are editable for the same reason as the rest: a plant that re-tanks should not
  -- need a deploy.
  add column drum_litres         numeric(10,2) not null default 250  check (drum_litres         > 0),
  add column gallon_litres       numeric(10,2) not null default 20   check (gallon_litres       > 0),
  add column tank_litres         numeric(10,2) not null default 1000 check (tank_litres         > 0),
  add column rambo_litres        numeric(10,2) not null default 2500 check (rambo_litres        > 0),
  add column caps_pcs_per_box    integer       not null default 4000 check (caps_pcs_per_box    > 0),
  add column label_pcs_per_roll  integer       not null default 4000 check (label_pcs_per_roll  > 0),
  add column preform_pcs_per_bag integer       not null default 1008 check (preform_pcs_per_bag > 0),

  -- Procurement pack sizes (received goods).
  add column stamp_pcs_per_coil     integer not null default 15000 check (stamp_pcs_per_coil     > 0),
  add column stamp_coils_per_box    integer not null default 6     check (stamp_coils_per_box    > 0),
  add column tape_pcs_per_box       integer not null default 24    check (tape_pcs_per_box       > 0),
  add column hairnet_packs_per_box  integer not null default 10    check (hairnet_packs_per_box  > 0),
  add column nosemask_packs_per_box integer not null default 40    check (nosemask_packs_per_box > 0),
  add column gloves_packs_per_box   integer not null default 10    check (gloves_packs_per_box   > 0);

-- ── product_recipes: litres of each ingredient per carton ───────────────────
-- A row per (product, ingredient). `litres_per_carton` is AUTHORITATIVE — the
-- vessel a thing is stored in (drum / tank / Rambo / gallon) only affects how the
-- figure is DISPLAYED, which is why it stays in code. Conflating the two is what
-- mislabelled four ingredients as litres when they held vessel fractions.
create table public.product_recipes (
  product           public.product_type not null,
  ingredient        text                not null,
  label             text                not null,
  litres_per_carton numeric(10,4)       not null check (litres_per_carton >= 0),
  display_order     smallint            not null default 0,
  primary key (product, ingredient)
);

comment on table public.product_recipes is
  'Per-carton recipe. The ingredients of each product must sum to bottles_per_carton × bottle_litres — enforced by recipe_must_fill_carton().';

insert into public.product_recipes (product, ingredient, label, litres_per_carton, display_order) values
  ('Bitters', 'alcohol',     'Raw ethanol',          2.5000, 1),
  ('Bitters', 'concentrate', 'Concentrate extract',  2.0000, 2),
  ('Bitters', 'water',       'Water',                4.3600, 3),
  ('Bitters', 'spices',      'Spices',               0.1000, 4),
  ('Bitters', 'caramel',     'Caramel',              0.0400, 5),
  ('Ginger',  'alcohol',     'Raw ethanol',          2.7000, 1),
  ('Ginger',  'gt_juice',    'Ginger / Tiger Nut juice', 1.0800, 2),
  ('Ginger',  'water',       'Water',                5.1165, 3),
  ('Ginger',  'spices',      'Spices',               0.0900, 4),
  ('Ginger',  'caramel',     'Caramel',              0.0135, 5);

-- ── The invariant: a recipe must fill its carton ─────────────────────────────
-- Deferred to statement end so a multi-row edit (which is how a recipe is saved)
-- is judged on its result, not mid-way through.
create or replace function public.recipe_must_fill_carton() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  carton_litres numeric;
  p             public.product_type;
  total         numeric;
begin
  select bottles_per_carton * bottle_litres into carton_litres from public.app_settings limit 1;
  if carton_litres is null then return null; end if;

  foreach p in array array['Bitters'::public.product_type, 'Ginger'::public.product_type] loop
    select coalesce(sum(litres_per_carton), 0) into total
      from public.product_recipes where product = p;
    -- Skip a product with no rows: that is "not configured", not "wrong".
    if total > 0 and round(total, 4) <> round(carton_litres, 4) then
      raise exception
        'recipe for % sums to % L per carton but a carton is % L — a recipe that does not fill its carton is wrong by construction',
        p, round(total, 4), round(carton_litres, 4)
        using errcode = 'check_violation';
    end if;
  end loop;
  return null;
end $$;

create constraint trigger recipe_fills_carton
  after insert or update or delete on public.product_recipes
  deferrable initially deferred
  for each row execute function public.recipe_must_fill_carton();

-- ── Saving a recipe is ONE transaction, not two calls ────────────────────────
-- An ingredient can be removed, renamed or re-balanced, so a save is "replace this
-- product's rows". Doing that as an upsert followed by a delete over the Data API
-- means TWO transactions, and the intermediate state — new rows plus the rows about to
-- be deleted — does not fill a carton, so the deferred trigger correctly rejects a
-- perfectly valid edit. Inside this function both statements share one transaction and
-- the check runs once, on the result.
create or replace function public.save_recipes(payload jsonb)
returns setof public.product_recipes
language plpgsql security definer set search_path = public as $$
begin
  -- SECURITY DEFINER bypasses RLS, so the admin check has to be here. Note it is NOT
  -- relaxed for a null auth.uid(): anon has no uid either, and the anon key ships in
  -- the browser bundle.
  if not public.is_admin() then
    raise exception 'only an administrator may change the recipes'
      using errcode = 'insufficient_privilege';
  end if;

  if payload is null or jsonb_typeof(payload) <> 'array' then
    raise exception 'save_recipes expects a JSON array of ingredient rows'
      using errcode = 'invalid_parameter_value';
  end if;

  -- Only the products present in the payload are replaced; one may be saved alone.
  delete from public.product_recipes
   where product in (
     select distinct (e->>'product')::public.product_type from jsonb_array_elements(payload) e
   );

  insert into public.product_recipes (product, ingredient, label, litres_per_carton, display_order)
  select (e->>'product')::public.product_type,
         e->>'ingredient',
         e->>'label',
         (e->>'litres_per_carton')::numeric,
         coalesce((e->>'display_order')::smallint, 0)
    from jsonb_array_elements(payload) e;

  return query
    select * from public.product_recipes order by product, display_order, ingredient;
end $$;

comment on function public.save_recipes(jsonb) is
  'Replaces the recipes for the products named in the payload, atomically, so the deferred carton check judges only the final state. Admin only.';

-- ── RLS + grants: read by any signed-in user, written by admins ──────────────
alter table public.product_recipes enable row level security;

create policy "recipes_read" on public.product_recipes
  for select to authenticated using (true);

create policy "recipes_admin_write" on public.product_recipes
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.product_recipes to authenticated;
grant select, insert, update, delete on public.product_recipes to service_role;

-- PostgreSQL grants EXECUTE on every new function to PUBLIC, and `anon` belongs to
-- PUBLIC — so omitting anon from a GRANT achieves nothing. save_recipes is SECURITY
-- DEFINER and therefore bypasses RLS, and the anon key ships in the browser bundle.
-- (Its own is_admin() check would refuse an anon caller, but a reachable writer that
-- happens to refuse is not the same as one that cannot be called at all.)
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    raise notice '0007: Supabase API roles absent — skipping function grants.';
    return;
  end if;
  revoke execute on function public.save_recipes(jsonb) from public;
  revoke execute on function public.save_recipes(jsonb) from anon;
  grant execute on function public.save_recipes(jsonb) to authenticated, service_role;
end $$;

