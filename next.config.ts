import type { NextConfig } from "next";

// Cache Components is off: almost every screen here depends on the signed-in user,
// so pages render per request (classic dynamic rendering).
const nextConfig: NextConfig = {
  // A self-contained server in .next/standalone, so the production image stays small (see Dockerfile).
  output: "standalone",
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
