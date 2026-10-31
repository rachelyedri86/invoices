import { describe, expect, it } from "vitest";
import { csvCell } from "@/lib/csv";

describe("csvCell", () => {
  it("writes plain values unchanged", () => {
    expect(csvCell("סופר-פארם")).toBe("סופר-פארם");
    expect(csvCell(920.4)).toBe("920.4");
    expect(csvCell(0)).toBe("0");
  });

  it("writes null and undefined as an empty cell", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });

  it("quotes cells with commas, quotes or line breaks", () => {
    expect(csvCell("א.ב., ציוד")).toBe('"א.ב., ציוד"');
    expect(csvCell('ציוד "משרדי"')).toBe('"ציוד ""משרדי"""');
    expect(csvCell("שורה\nשנייה")).toBe('"שורה\nשנייה"');
    expect(csvCell("a\rb")).toBe('"a\rb"');
  });

  it("defuses text that a spreadsheet would run as a formula", () => {
    expect(csvCell("=HYPERLINK(\"http://evil\")")).toBe("\"'=HYPERLINK(\"\"http://evil\"\")\"");
    expect(csvCell("+972501234567")).toBe("'+972501234567");
    expect(csvCell("-2+3")).toBe("'-2+3");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
  });

  it("does not touch negative numbers (only text is defused)", () => {
    expect(csvCell(-120.5)).toBe("-120.5");
  });
});
