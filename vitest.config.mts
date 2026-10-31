import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Two test projects:
// - unit (npm test): pure logic only, no network and no database.
// - integration (npm run test:integration): RLS and workflow checks against a real Supabase
//   project (see tests/env.ts).
// `server-only` throws outside the Next.js server, so it is replaced with an empty module here.
const resolve = {
  alias: [
    { find: /^@\//, replacement: fileURLToPath(new URL("./src/", import.meta.url)) },
    { find: /^server-only$/, replacement: fileURLToPath(new URL("./tests/unit/server-only-stub.ts", import.meta.url)) },
  ],
};

export default defineConfig({
  test: {
    projects: [
      { resolve, test: { name: "unit", include: ["tests/unit/**/*.test.ts"], environment: "node" } },
      {
        resolve,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          testTimeout: 300_000,
          hookTimeout: 300_000,
          fileParallelism: false,
        },
      },
    ],
  },
});
