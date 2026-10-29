import type { NextConfig } from "next";

// Cache Components is off: almost every screen here depends on the signed-in user,
// so pages render per request (classic dynamic rendering).
const nextConfig: NextConfig = {
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
