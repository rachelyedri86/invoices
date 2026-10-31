import { describe, expect, it } from "vitest";
import { filtersToQuery, parseFilters } from "@/lib/accounting";

const from = (params: Record<string, string | string[]>) => parseFilters((k) => params[k]);
const uuid = "0f8fad5b-d9cb-469f-a165-70867728950e";

describe("parseFilters", () => {
  it("defaults to invoices waiting for payment, with no other filter", () => {
    expect(from({})).toEqual({ status: "approved", from: "", to: "", category: "", department: "" });
  });

  it("accepts valid values", () => {
    expect(from({ status: "paid", from: "2026-10-01", to: "2026-10-31", category: uuid, department: uuid })).toEqual({
      status: "paid",
      from: "2026-10-01",
      to: "2026-10-31",
      category: uuid,
      department: uuid,
    });
    expect(from({ status: "all" }).status).toBe("all");
  });

  it("drops anything malformed instead of passing it to the query", () => {
    expect(
      from({
        status: "draft",
        from: "1/10/2026",
        to: "2026-10-31'; drop table invoices;--",
        category: "not-a-uuid",
        department: "*",
      }),
    ).toEqual({ status: "approved", from: "", to: "", category: "", department: "" });
  });

  it("ignores repeated parameters (arrays)", () => {
    expect(from({ status: ["paid", "all"], from: ["2026-10-01"] })).toMatchObject({ status: "approved", from: "" });
  });
});

describe("filtersToQuery", () => {
  it("leaves out defaults and empty values", () => {
    expect(filtersToQuery(from({}))).toBe("");
  });

  it("round-trips through parseFilters", () => {
    const f = from({ status: "all", from: "2026-01-01", category: uuid });
    const query = filtersToQuery(f);
    expect(query).toBe(`status=all&from=2026-01-01&category=${uuid}`);
    const params = new URLSearchParams(query);
    expect(parseFilters((k) => params.get(k))).toEqual(f);
  });
});
