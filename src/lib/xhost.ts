import "server-only";
import { createRemoteJWKSet, jwtVerify } from "jose";

// xhostd sign-in (SSO): xhostd runs Google sign-in at /xhost-auth/login and sets the
// __Host-xhost_id cookie, an RS256 JWT. We verify it here and then open a Supabase session
// for the matching user (see /auth/xhost), so RLS keeps working unchanged.
// Docs: https://docs.xhostd.com/oauth

export const XHOST_COOKIE = "__Host-xhost_id";
const ISSUER = "https://auth.xhostd.com";
const JWKS = createRemoteJWKSet(new URL(`${ISSUER}/xhost-auth/jwks`));

/** SSO is available only when running on xhostd (the platform injects XHOSTD_HOSTNAME). */
export function xhostEnabled(): boolean {
  return !!process.env.XHOSTD_HOSTNAME;
}

/** Hostnames this deployment answers on; the token's audience must be one of them. */
function audiences(): string[] {
  const list = (process.env.XHOSTD_DOMAINS ?? "").split(",").map((d) => d.trim()).filter(Boolean);
  if (process.env.XHOSTD_HOSTNAME) list.push(process.env.XHOSTD_HOSTNAME);
  return [...new Set(list)];
}

export type XhostIdentity = { sub: string; email: string; name: string | null };

/** Verifies the xhostd sign-in cookie. Returns null if missing, expired or invalid. */
export async function verifyXhostToken(token: string | undefined): Promise<XhostIdentity | null> {
  if (!token || !xhostEnabled()) return null;
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: ISSUER,
      audience: audiences(),
      algorithms: ["RS256"],
    });
    if (typeof payload.sub !== "string" || typeof payload.email !== "string") return null;
    return {
      sub: payload.sub,
      email: payload.email.toLowerCase(),
      name: typeof payload.name === "string" ? payload.name : null,
    };
  } catch {
    return null;
  }
}

export const xhostLoginUrl = (returnTo: string) => `/xhost-auth/login?return_to=${encodeURIComponent(returnTo)}`;
export const xhostLogoutUrl = (returnTo: string) => `/xhost-auth/logout?return_to=${encodeURIComponent(returnTo)}`;
