import type { NextRequest } from "next/server";

/**
 * Absolute URL on the host the visitor actually used. Behind xhostd's proxy, request.url
 * carries the container's own address (0.0.0.0:port), so read the forwarded host instead.
 */
export function absoluteUrl(request: NextRequest, path: string): URL {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!host) return new URL(path, request.url);
  const proto = request.headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return new URL(path, `${proto.split(",")[0].trim()}://${host.split(",")[0].trim()}`);
}
