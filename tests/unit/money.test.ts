import { describe, expect, it } from "vitest";
import { calculateMonthlyAmount, formatMajorMoney, formatMoney, minorUnitsFor } from "../../app/utils/money";

describe("application currency presentation", () => {
    it("formats every supported currency using its minor-unit scale", () => {
        const cases = [
            ["USD", 100, "1.00 USD"], ["EUR", 100, "1.00 EUR"],
            ["GBP", 100, "1.00 GBP"], ["AUD", 100, "1.00 AUD"],
            ["CAD", 100, "1.00 CAD"], ["SGD", 100, "1.00 SGD"],
            ["JPY", 1, "1 JPY"], ["VND", 1, "1 VND"],
        ] as const;
        for (const [currency, amount, expected] of cases) {
            expect(formatMoney(amount, currency)).toBe(expected);
        }
    });

    it("preserves zero, negative, large amounts and the unknown-currency fallback", () => {
        expect(formatMoney(0, "USD")).toBe("0.00 USD");
        expect(formatMoney(-1234, "USD")).toBe("-12.34 USD");
        expect(formatMoney(1_234_567_890_123, "USD")).toBe("12345678901.23 USD");
        expect(minorUnitsFor("XTS")).toBe(100);
        expect(minorUnitsFor("toString")).toBe(100);
        expect(formatMoney(12345, "XTS")).toBe("123.45 XTS");
        expect(formatMajorMoney(12.345, "USD")).toBe("12.35 USD");
        expect(formatMajorMoney(12.5, "JPY")).toBe("13 JPY");
    });

    it("keeps the existing nominal monthly frequency arithmetic for all billing cycles", () => {
        const expected: Record<string, number> = {
            weekly: 120 * (52 / 12), monthly: 120, quarterly: 120 / 3,
            biannual: 120 / 6, yearly: 120 / 12,
        };
        for (const [cycle, monthly] of Object.entries(expected)) {
            expect(calculateMonthlyAmount(12_000, "USD", cycle as keyof typeof expected)).toBeCloseTo(monthly);
        }
        expect(calculateMonthlyAmount(12_000, "JPY", "monthly")).toBe(12_000);
        expect(calculateMonthlyAmount(12_000, "XTS", "monthly")).toBe(120);
        expect(calculateMonthlyAmount(12_000, "USD", "unknown" as keyof typeof expected)).toBe(120);
    });
});
