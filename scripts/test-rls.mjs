// Checks permissions (RLS) and the approval workflow against the real database, as each demo user.
// The checks live in src/lib/selftest/checks.ts, shared with `npm run test:integration` and the
// admin "self-test" button. Run after the seed: npm run db:test
// (creates tagged test invoices and deletes them at the end)
import { formatCheck, runSelfTest } from "../src/lib/selftest/checks.ts";
import { env } from "./lib.mjs";

const supabaseUrl = env("SUPABASE_URL");
console.log(`יעד: ${new URL(supabaseUrl).host}\n`);

const report = await runSelfTest({
  supabaseUrl,
  publishableKey: env("SUPABASE_PUBLISHABLE_KEY"),
  secretKey: env("SUPABASE_SECRET_KEY"),
  seedEmail: env("SEED_EMAIL"),
  timeoutMs: 180_000,
  includeSignup: true,
  actor: "npm run db:test",
  onResult: (result) => console.log(formatCheck(result)),
});

if (report.error) console.error(`\n${report.error}`);
console.log(`\n${report.passed} עברו, ${report.failed} נכשלו${report.skipped ? `, ${report.skipped} דולגו` : ""} (${(report.durationMs / 1000).toFixed(1)} שניות)`);
process.exit(report.failed || report.error ? 1 : 0);
