import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests (npm test): pure logic only, no network and no database.
// `server-only` throws outside the Next.js server, so it is replaced with an empty module here.
export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\//, replacement: fileURLToPath(new URL("./src/", import.meta.url)) },
      { find: /^server-only$/, replacement: fileURLToPath(new URL("./tests/unit/server-only-stub.ts", import.meta.url)) },
    ],
  },
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
  },
});
