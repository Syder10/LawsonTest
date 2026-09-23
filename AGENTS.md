# AGENTS.md

Instructions for AI coding agents working in this repository.

Read `architecture-essentials.md` first. It is short and it contains the rules
that, when broken, produce bugs that look like working software.

---

## Before you write anything

1. **Read the schema, not your memory of it.** `supabase/migrations/` is the
   source of truth for every table, column, constraint and policy. Column names
   in this project are long and specific (`quantity_cartons_produced`,
   `preforms_used_bags`, `alcohol_transferred_drums`) and guessing them produces
   code that compiles and returns nothing.
2. **Check whether a domain module already owns the rule.** `lib/domain/` exists
   because the same rule was previously written three times and drifted. Before
   adding a constant, a threshold, a unit or a conversion, grep for it.
3. **Read the file you are about to edit, in full**, if it is under ~400 lines.
   Several files in here carry comments explaining why something counter-intuitive
   is correct. Those comments are load-bearing.

## Commands

```bash
npm run test:run      # unit tests (vitest)
npm run typecheck     # tsc --noEmit, must be 0 errors
npm run lint          # eslint, must be 0 errors (warnings tolerated)
npm run build         # next build
npm run validate      # everything above + SQL behaviour tests on ephemeral PG16
```

`npm run validate` is the real gate. It needs a local Postgres 16; on macOS
Homebrew it needs `LC_ALL=C` or the postmaster aborts with "became
multithreaded".

Keep shell invocations short — put logic in a script file under `scripts/`
rather than in a long inline command.

## Non-negotiables

### Declare a rule once

A business rule lives in `lib/domain/`, is exported once, and is imported by both
the route that computes it and the component that renders it. Never re-declare a
type or a constant on the client side.

The reason: stock alerting was silently dead for weeks because the route emitted
`daysLeft` while the UI read `operatingDaysLeft`. Because `undefined !== null`,
every "Days left" cell rendered `NaN` and the urgency sort became a no-op. One
route used the right name, so a screen worked and the bug hid in plain sight.

### Never store what you can derive

Balances, remaining quantities, totals and litres are **derived**, either as
Postgres generated columns or by chaining the movement log on read. Do not add a
running-total column. `packaging_live_stocks` was exactly that and was dropped:
it drifted on every edit and could go negative.

### `Number()` every scalar RPC result

PostgREST serialises `numeric` as a **string**. Without the coercion,
`variance === 0` is false for `"0"`, and `a + b` concatenates. This has bitten
this codebase more than once.

### RLS is the boundary; guards and nav are not

Every new table gets RLS enabled with explicit policies, plus a SQL behaviour
test proving who can and cannot write. A route guard is a second layer. A hidden
nav item is presentation.

Every new `SECURITY DEFINER` function must
`revoke execute on function … from public, anon` before granting to
`authenticated`. Postgres grants `EXECUTE` to `PUBLIC` by default and `anon` is
in `PUBLIC`, so omitting `anon` from a grant does nothing — and the anon key
ships in the browser bundle.

### Units before formulas

Every ledger material is counted in a container (drums, boxes, rolls, gallons,
sacks, bags), never in pieces. Resolve units with `ledgerUnitFor()`. Where the
per-container count has not been stated by the business, **show nothing** — an
invented factor is worse than a bare count.

If a number looks implausible, check what unit it is in before concluding the
number is wrong. Four correct BOM ingredients were nearly flagged as broken
because their denominators were vessel capacities, not errors.

### Dates come from `shiftDateFor()`

A record is dated by the day its shift **started**. Never use `new Date()` for a
record date. A Night shift starting 21:00 on the 31st is dated the 31st, and its
on-time window closes 05:30 the next morning.

### Never guess a business figure

If a rate, capacity, conversion or price has not been stated by the user, do not
invent a plausible-looking one. `WASTE_ALLOWANCE` is 0 with a test asserting it
stays 0, precisely because a plausible 2% would quietly move every reorder point.
Leave the hook, leave it empty, and say so.

## Style

- Match the surrounding file. Comment density here is higher than typical: where
  a decision is counter-intuitive, the comment says **why**, and it stays.
- No `any` in new code. The existing `any` sites are documented eslint warnings,
  not a precedent.
- Semantic colour tokens only (`text-ink-primary`, `bg-surface-card`,
  `--series-*`). No literal Tailwind palette classes outside `components/ui/`.
- 12px type floor, 44px touch targets, 16px minimum input text (below 16px iOS
  zooms on focus).
- Use `components/primitives/`. Do not hand-roll a modal — the hand-rolled ones
  had no focus trap, no Escape and no scroll lock, and one held a password field.
- `truncate` is not a safe default: it implies `nowrap`, so any stacked or
  generated cell overflows and silently deletes information. Use `break-words`.
- `min-w-0` beside `shrink-0` is the squeeze pattern behind every "text goes
  vertical on mobile" bug in this repo. Let the container **wrap**.

## Testing

- A new domain rule needs unit tests. A new table, policy, generated column or
  trigger needs a SQL behaviour test in `supabase/tests/`.
- When a test fails after your change, **work out which one is wrong** before
  editing either. Fourteen label tests failed once and the suite was right — the
  fix was to stop hardcoding labels in the tests, not to update the expectations.
- A test that depends on something *not* having a property needs a subject that
  structurally never will. Four tests used `caps` as "the material with no
  expected rate" and broke the moment caps got one.
- Do not dismiss an intermittent failure as transient. One was diagnosed only
  after being waved off twice, and it was a real ordering bug in the test's own
  assumption.

## SQL specifics

- `EXCEPTION` in plpgsql **cannot catch a deferred constraint** — it fires at
  commit, and a subtransaction's commit does not run deferred triggers. Test
  deferred rejection with `set constraints all immediate` inside a rolled-back
  transaction, and prove the deferral separately.
- An enum-to-text cast is only `STABLE`, not `IMMUTABLE`, so
  `coalesce(product::text,'')` cannot be used in an expression index. Use
  `NULLS NOT DISTINCT` (PG15+).
- New migrations should be self-contained (their own RLS and grants) so they can
  be applied alone to a live database, following `0006` and `0007`.
- `0005_ledger_and_grants.sql` must run last of `0001`–`0005`.

## Shell

- zsh does **not** word-split `for f in $FILES`. Use
  `printf '%s\n' "$FILES" | while IFS= read -r f`.
- A git pathspec of `app/**/*.tsx` does not match top-level `app/page.tsx`. Use
  `git ls-files '*.ts' '*.tsx'`.
- Before deleting an "unused" export, grep for its use in JSX far below the
  import, and count same-file references. Two imports were removed on a bad grep
  and their component files deleted with them.

## Current work

`PRD.md` specifies the stock and procurement separation: a new `stock` role that
owns all physical movement, `procurement` reduced to read-only, plus supplier
invoices and a dispatch log. It is designed and approved, not built.

Phases, each ending at a review gate: **1** database · **2** domain and lib ·
**3** API · **4** UI. Do not start a phase before the previous gate is green.

Two decisions in that spec are easy to "fix" by mistake:

1. **Dispatch does not feed the finished-goods balance, and there is no variance
   report.** The balance keeps deriving from
   `packaging_daily_records.quantity_cartons_loaded`. Dispatched totals may differ
   from cartons loaded and the system will not flag it. See PRD.md §3.3.
2. **An invoice's `declared_total` may disagree with the sum of its lines.** Warn,
   never block. Real invoices carry freight, tax and discounts the line model does
   not represent.

## Reporting

State what you verified and what you did not. If you could not run the SQL suite,
say so rather than implying the migration was tested. If a gate failed, show the
output.
