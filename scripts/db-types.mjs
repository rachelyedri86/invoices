// Regenerates src/lib/database.types.ts from the cloud database schema.
// Run after every new migration: npm run db:types
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../node_modules/supabase/dist/supabase.js", import.meta.url));
const result = spawnSync(
  process.execPath,
  [cli, "gen", "types", "typescript", "--db-url", process.env.SUPABASE_DB_URL, "--schema", "public"],
  { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
);
if (result.status !== 0) {
  console.error(result.stderr);
  process.exit(1);
}
writeFileSync(new URL("../src/lib/database.types.ts", import.meta.url), result.stdout);
console.log("✔ src/lib/database.types.ts עודכן");
