import type { BillingPeriod, CurrencyCode } from "@core/domain";

export const MINOR_UNITS: Readonly<Record<CurrencyCode, number>> = {
    USD: 100, EUR: 100, GBP: 100, AUD: 100,
    CAD: 100, SGD: 100, JPY: 1, VND: 1,
};

const MONTHLY_FREQUENCY: Readonly<Record<BillingPeriod, number>> = {
    weekly: 52 / 12,
    monthly: 1,
    quarterly: 1 / 3,
    biannual: 1 / 6,
    yearly: 1 / 12,
};

export function minorUnitsFor(currency: string): number {
    return Object.hasOwn(MINOR_UNITS, currency) ? MINOR_UNITS[currency as CurrencyCode] : 100;
}

export function formatMajorMoney(amount: number, currency: string): string {
    const units = minorUnitsFor(currency);
    return `${amount.toFixed(units === 1 ? 0 : 2)} ${currency}`;
}

export function formatMoney(amountMinor: number, currency: string): string {
    return formatMajorMoney(amountMinor / minorUnitsFor(currency), currency);
}

/** Existing nominal-cycle dashboard calculation, kept local to the application. */
export function calculateMonthlyAmount(amountMinor: number, currency: string, cycle: BillingPeriod): number {
    return (amountMinor / minorUnitsFor(currency)) * (MONTHLY_FREQUENCY[cycle] ?? 1);
}
