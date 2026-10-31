import { describe, expect, it } from "vitest";
import { extractionWarning, warningText } from "@/lib/upload-warnings";

describe("extractionWarning", () => {
  it("maps every extraction error code to its warning code", () => {
    expect(extractionWarning("busy")).toBe("extract_busy");
    expect(extractionWarning("auth")).toBe("extract_auth");
    expect(extractionWarning("unreadable")).toBe("extract_unreadable");
    expect(extractionWarning("unavailable")).toBe("extract_unavailable");
    expect(extractionWarning("image_too_large")).toBe("image_too_large");
  });

  it("treats an unexpected error as 'unavailable'", () => {
    expect(extractionWarning(undefined)).toBe("extract_unavailable");
  });
});

describe("warningText", () => {
  it("translates known codes", () => {
    expect(warningText("not_invoice", undefined)).toContain("לא נראה כמו חשבונית");
    expect(warningText("extract_busy", undefined)).toContain("עמוס");
  });

  it("names a valid currency code and falls back to generic wording otherwise", () => {
    expect(warningText("currency_unknown", "GBP")).toBe("המטבע GBP לא מוגדר במערכת. בדקו את המטבע לפני ההגשה.");
    expect(warningText("currency_unknown", "<b>x</b>")).toContain("המטבע שזוהה");
    expect(warningText("currency_unknown", "gbp")).toContain("המטבע שזוהה");
    expect(warningText("currency_unknown", ["GBP", "USD"])).toContain("המטבע שזוהה");
  });

  it("shows nothing for unknown or crafted codes", () => {
    expect(warningText("Your account is locked, call 03-1234567", undefined)).toBeUndefined();
    expect(warningText("toString", undefined)).toBeUndefined();
    expect(warningText("__proto__", undefined)).toBeUndefined();
    expect(warningText(["not_invoice"], undefined)).toBeUndefined();
    expect(warningText(undefined, undefined)).toBeUndefined();
  });
});
