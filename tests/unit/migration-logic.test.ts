import { describe, expect, it } from "vitest";
import { assertClassified, contentHash, orderIamEntries, ownerDigest, row, sql } from "../../scripts/migrate/logic";

describe("migration pure logic", () => {
  it("quotes strings and preserves nulls", () => {
    expect(sql("O'Brien")).toBe("'O''Brien'");
    expect(sql(null)).toBe("NULL");
  });
  it("handles large values and deterministic owner digests", () => {
    const large = "x".repeat(2_000_000);
    expect(contentHash(large)).toHaveLength(64);
    const rows = [{ owner: "u", table: "users", canonical: "b" }, { owner: "u", table: "users", canonical: "a" }];
    expect(ownerDigest(rows)).toEqual(ownerDigest([...rows].reverse()));
  });
  it("formats rows safely and handles empty/expired export population", () => {
    expect(row("users", { id: "u", email: null })).toBe("INSERT OR REPLACE INTO users(id,email) VALUES('u',NULL);");
    expect(ownerDigest([])).toEqual({});
  });
  it("rejects unclassified prefixes and tolerates expired entries absent from the live export", () => {
    expect(() => assertClassified(["mystery"], [])).toThrow(/mystery/);
    expect(ownerDigest([])).toEqual({});
  });
  it("orders duplicate IAM rows so iam_sub wins", () => {
    const ordered = orderIamEntries([{ key: ["iam_sub", "u"] }, { key: ["iam_subject", "u"] }]);
    expect(ordered.at(-1)?.key[0]).toBe("iam_sub");
  });
});
