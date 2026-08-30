import nextCoreWebVitals from "eslint-config-next/core-web-vitals"
import nextTypeScript from "eslint-config-next/typescript"

// Flat config, ESLint 9. eslint-config-next 16 ships native flat arrays, so it is
// spread directly — routing it through @eslint/eslintrc's FlatCompat instead
// throws "Converting circular structure to JSON" on this version.
const config = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "next-env.d.ts",
      "*.tsbuildinfo",
      // Vendored shadcn primitives: third-party scaffolding kept close to
      // upstream so it can be re-generated. Linting it would mean either editing
      // generated code or carrying a wall of suppressions.
      "components/ui/**",
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypeScript,
  {
    rules: {
      // The codebase steps outside the typed Supabase client in a few places —
      // dynamic table names driven by the record-type registry, and recharts
      // tooltip payloads. Each site carries a comment explaining why.
      "@typescript-eslint/no-explicit-any": "warn",

      // ── React Compiler era rules, deliberately warnings ───────────────────
      // These two flag the app's data-loading pattern, not defects in it: every
      // dashboard fetches on mount and polls, so `setState` inside an effect is
      // the whole mechanism, and there is no lint-clean spelling of it without
      // adopting a data-fetching library. `useCallback` fetchers trip the
      // memoization check for the same reason.
      //
      // React Compiler is NOT enabled in next.config.mjs, so neither rule is
      // guarding a real compiler assumption today. They stay on as warnings so
      // the count is visible if that changes.
      //
      // The rules that DO catch real unsafety — react-hooks/purity (clock read
      // during render) and react-hooks/refs (ref written during render) — are
      // left at error, and the codebase is clean of both.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
    },
  },
]

export default config
