# CLAUDE.md

Guidance for Claude Code in this repository.

**Read `AGENTS.md`.** It holds the full working rules for agents in this repo and
this file does not repeat them. `architecture-essentials.md` is the short
architecture reference; `architecture.md` is the long form with the reasoning;
`PRD.md` is the current approved-but-unbuilt scope.

---

## What this project is

A production and stock management app for a beverage plant (Bitters and Ginger)
in Ghana. Supervisors file shift records from phones, a stock office receives and
dispatches goods, managers read analytics, an admin owns users and the production
settings every projection derives from.

Next.js 16 · React 19 · TypeScript · Tailwind v4 · Supabase (Postgres 16).

## Commands

```bash
npm run test:run     npm run typecheck     npm run lint
npm run build        npm run validate      # validate = all of it + SQL tests on PG16
```

`npm run validate` is the gate. On macOS Homebrew Postgres it needs `LC_ALL=C`.

## The five things most likely to catch you out

1. **Read `supabase/migrations/` for column names.** They are long and specific
   (`quantity_cartons_produced`, `preforms_used_bags`). A guessed name compiles
   and returns nothing.
2. **`Number()` every scalar RPC result.** PostgREST returns `numeric` as a
   string, so `variance === 0` is false for `"0"` and `+` concatenates.
3. **Declare each rule once in `lib/domain/`** and import it on both sides of the
   wire. A client-side copy of a server-computed field is how the stock alerting
   died silently for weeks.
4. **Balances are derived, never stored.** Do not add a running-total column.
5. **Dates come from `shiftDateFor()`**, never `new Date()` — a record is dated by
   the day its shift *started*.

## How to work here

Plan before implementing anything that touches the schema, RLS, or a figure the
business reads. Phase the work and stop at gates; this project has been built in
reviewed phases throughout and that is the expectation.

Do not invent a business figure. If a rate, capacity or conversion has not been
stated, leave it unset and say so — a plausible-looking number is worse than a
missing one, because nobody questions it.

Report honestly. Say what you ran and what you could not run. If you could not
execute the SQL suite, do not imply a migration was tested.

## Current work

`PRD.md`: separate stock from procurement — a new `stock` role owning all physical
movement, `procurement` reduced to read-only, plus supplier invoices and a
dispatch log with vehicle, driver and destination. Approved, not built. Phases:
database → domain/lib → API → UI, with a review gate after each.

Two decisions in that spec look like bugs and are not:

- **Dispatch does not feed the finished-goods balance and there is no variance
  report** (PRD.md §3.3). Dispatched totals may differ from
  `quantity_cartons_loaded` and nothing flags it.
- **An invoice's declared total may disagree with its line sum.** Warn, never
  block.
