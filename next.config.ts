import type { NextConfig } from "next";

// Security headers for every response. HSTS is added by the xhostd (Caddy) proxy, so it is not set here.
// A full Content-Security-Policy with script-src is deferred: Next.js injects inline scripts that would
// need nonces. For now the CSP only forbids framing (clickjacking protection for the approve screen).
// Permissions-Policy leaves the camera allowed, because the upload form uses <input capture>.
const securityHeaders = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Permissions-Policy", value: "geolocation=(), microphone=()" },
];

// Cache Components is off: almost every screen here depends on the signed-in user,
// so pages render per request (classic dynamic rendering).
const nextConfig: NextConfig = {
  // A self-contained server in .next/standalone, so the production image stays small (see Dockerfile).
  output: "standalone",
  poweredByHeader: false,
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
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
