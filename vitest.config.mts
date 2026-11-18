import { defineConfig } from "vitest/config"
import { fileURLToPath } from "node:url"

// Unit tests cover the pure domain logic in lib/ — shift rotation, on-time
// windows, streaks/gaps, the derived-ledger helpers and the record registry.
// Database behaviour (RLS, triggers, the balance functions) is covered
// separately by the SQL suites in supabase/tests, run by scripts/validate-ledger.sh.
export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
})
