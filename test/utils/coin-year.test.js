import { describe, it, expect } from 'vitest';
import { getDefaultCoinYear, getSelectableCoinYears, EARLIEST_COIN_YEAR } from '../../src/utils/coin-year.js';

describe('getDefaultCoinYear', () => {
    it('defaults to the previous year from January through October', () => {
        expect(getDefaultCoinYear(new Date(2026, 0, 1))).toBe(2025);
        expect(getDefaultCoinYear(new Date(2026, 5, 15))).toBe(2025);
        expect(getDefaultCoinYear(new Date(2026, 9, 31, 23, 59))).toBe(2025);
    });

    it('rolls over to the current year from November 1st', () => {
        expect(getDefaultCoinYear(new Date(2026, 10, 1))).toBe(2026);
        expect(getDefaultCoinYear(new Date(2026, 11, 31))).toBe(2026);
    });

    it('keeps the prior year as default until the following November', () => {
        expect(getDefaultCoinYear(new Date(2027, 9, 31))).toBe(2026);
        expect(getDefaultCoinYear(new Date(2027, 10, 1))).toBe(2027);
    });
});

describe('getSelectableCoinYears', () => {
    it('lists the current year first, descending to the earliest supported year', () => {
        const years = getSelectableCoinYears(new Date(2026, 10, 7));
        expect(years[0]).toBe(2026);
        expect(years[1]).toBe(2025);
        expect(years[years.length - 1]).toBe(EARLIEST_COIN_YEAR);
        expect(years).toHaveLength(2026 - EARLIEST_COIN_YEAR + 1);
    });

    it('always includes the default year', () => {
        const now = new Date(2026, 3, 1);
        expect(getSelectableCoinYears(now)).toContain(getDefaultCoinYear(now));
    });
});
