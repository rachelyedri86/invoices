import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { absoluteUrl } from "@/lib/redirect-url";

const request = (url: string, headers: Record<string, string> = {}) => new NextRequest(url, { headers });

afterEach(() => vi.unstubAllEnvs());

describe("absoluteUrl", () => {
  it("uses APP_URL and ignores forged headers", () => {
    vi.stubEnv("APP_URL", "https://invoices.example.org");
    const r = request("http://0.0.0.0:8080/auth/xhost", { host: "evil.example", "x-forwarded-host": "evil.example" });
    expect(absoluteUrl(r, "/approvals").href).toBe("https://invoices.example.org/approvals");
  });

  it("keeps the query string of the path", () => {
    vi.stubEnv("APP_URL", "https://invoices.example.org/");
    expect(absoluteUrl(request("http://0.0.0.0:8080/"), "/login?error=link").href).toBe(
      "https://invoices.example.org/login?error=link",
    );
  });

  it("without APP_URL, behind a proxy, uses the forwarded host and protocol", () => {
    vi.stubEnv("APP_URL", "");
    const r = request("http://0.0.0.0:8080/x", {
      host: "0.0.0.0:8080",
      "x-forwarded-host": "app.example.org, proxy.internal",
      "x-forwarded-proto": "https, http",
    });
    expect(absoluteUrl(r, "/").href).toBe("https://app.example.org/");
  });

  it("without APP_URL, uses http for localhost and https for other hosts", () => {
    vi.stubEnv("APP_URL", "");
    expect(absoluteUrl(request("http://localhost:3000/a", { host: "localhost:3000" }), "/b").href).toBe("http://localhost:3000/b");
    expect(absoluteUrl(request("http://10.0.0.5/a", { host: "app.example.org" }), "/b").href).toBe("https://app.example.org/b");
  });
});
