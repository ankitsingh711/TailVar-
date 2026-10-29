import { describe, expect, it } from "vitest";
import { fromPaise, parseAmount, toPaise } from "@/lib/money";
import { parseDate, parseId } from "@/lib/validation";
import { AppError } from "@/lib/errors";

const rejects = (fn: () => unknown) => expect(fn).toThrow(AppError);

describe("parseAmount", () => {
  it("normalises valid amounts to 2 decimals", () => {
    expect(parseAmount("1000000", "x")).toBe("1000000.00");
    expect(parseAmount(600000, "x")).toBe("600000.00");
    expect(parseAmount("0.01", "x")).toBe("0.01");
    expect(parseAmount("12.5", "x")).toBe("12.50");
    expect(parseAmount(" 42.10 ", "x")).toBe("42.10");
    expect(parseAmount("999999999999.99", "x")).toBe("999999999999.99");
  });

  it("rejects zero, negative and malformed amounts", () => {
    for (const bad of [0, "0", "0.00", -5, "-5", "-0.01", "", "abc", "1e5", 1e21, "1.234", "1,000", NaN, Infinity, null, undefined, {}, true]) {
      rejects(() => parseAmount(bad, "Amount"));
    }
  });

  it("rejects values beyond NUMERIC(14,2)", () => {
    rejects(() => parseAmount("1000000000000", "x"));
  });
});

describe("paise conversion", () => {
  it("round-trips without floating point error", () => {
    expect(toPaise("0.10") + toPaise("0.20")).toBe(30n);
    expect(fromPaise(toPaise("1000000.00") - toPaise("600000.00"))).toBe("400000.00");
    expect(fromPaise(-5n)).toBe("-0.05");
  });
});

describe("parseDate", () => {
  it("accepts real calendar dates", () => {
    expect(parseDate("2026-01-31", "d")).toBe("2026-01-31");
    expect(parseDate("2028-02-29", "d")).toBe("2028-02-29");
  });

  it("rejects impossible or badly formatted dates", () => {
    for (const bad of ["2026-02-30", "2027-02-29", "2026-13-01", "2026-1-1", "01-01-2026", "2026-01-01T00:00:00Z", "", 20260101, null, "1800-01-01"]) {
      rejects(() => parseDate(bad, "Date"));
    }
  });
});

describe("parseId", () => {
  it("accepts positive integers and numeric strings", () => {
    expect(parseId(7, "id")).toBe(7);
    expect(parseId("12", "id")).toBe(12);
  });
  it("rejects anything else", () => {
    for (const bad of [0, -1, 1.5, "1.5", "abc", "1 OR 1=1", null, undefined, "", 2 ** 60]) rejects(() => parseId(bad, "id"));
  });
});
