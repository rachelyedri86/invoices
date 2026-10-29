// Applies supabase/migrations to the cloud database.
// Run: npm run db:push   (reads SUPABASE_DB_URL from .env.local; the password never appears on screen)
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const url = process.env.SUPABASE_DB_URL;
if (!url || url.includes("[YOUR-PASSWORD]")) {
  console.error("חסר SUPABASE_DB_URL תקין בקובץ .env.local");
  process.exit(1);
}

const cli = fileURLToPath(new URL("../node_modules/supabase/dist/supabase.js", import.meta.url));
const extra = process.argv.slice(2);
const result = spawnSync(process.execPath, [cli, "db", "push", "--db-url", url, "--yes", ...extra], {
  stdio: "inherit",
});
process.exit(result.status ?? 1);
