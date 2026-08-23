-- ============================================================================
-- 0001_extensions_types_helpers.sql
-- Extensions, enum types, and shared helper functions (RLS + updated_at).
-- Run order: FIRST. Everything else depends on the types and helpers here.
-- ============================================================================

-- ── Extensions ──────────────────────────────────────────────────────────────
create extension if not exists pgcrypto;   -- gen_random_uuid()

-- ── Enum types ────────────────────────────────────────────────────────────
-- Centralised, DB-enforced domains. Replaces the ad-hoc CHECK-on-varchar the
-- old schema repeated on every table.
do $$ begin
  create type public.shift_type as enum ('Morning', 'Afternoon', 'Night');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.user_role as enum ('admin', 'manager', 'supervisor', 'procurement');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.product_type as enum ('Bitters', 'Ginger');
exception when duplicate_object then null; end $$;

-- ── updated_at trigger ──────────────────────────────────────────────────────
-- The old schema defaulted updated_at to now() but never maintained it.
-- This trigger keeps it accurate on every UPDATE. Attached per-table below.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ── Role helpers (SECURITY DEFINER to avoid RLS recursion on profiles) ───────
-- These read the caller's role from profiles WITHOUT triggering profiles' own
-- RLS policies (which would recurse). Used throughout the RLS policies below.
--
-- Written in plpgsql (not sql) ON PURPOSE: plpgsql defers resolution of the
-- profiles reference to runtime, so these can be created here — before the
-- profiles table exists (0003) — and still be referenced by the reference-table
-- policies in 0002. By query time, profiles always exists.
create or replace function public.current_user_role()
returns public.user_role
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role public.user_role;
begin
  select role into v_role from public.profiles where id = auth.uid();
  return v_role;
end;
$$;

-- manager or admin — the "can see everything" staff roles
create or replace function public.is_staff()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return coalesce(
    (select role in ('manager', 'admin') from public.profiles where id = auth.uid()),
    false
  );
end;
$$;

create or replace function public.is_admin()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return coalesce(
    (select role = 'admin' from public.profiles where id = auth.uid()),
    false
  );
end;
$$;

-- procurement, manager, or admin — the roles allowed to touch materials/inventory
create or replace function public.is_procurement_staff()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return coalesce(
    (select role in ('procurement', 'manager', 'admin') from public.profiles where id = auth.uid()),
    false
  );
end;
$$;
