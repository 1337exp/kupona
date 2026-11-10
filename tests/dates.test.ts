import { describe, expect, it } from 'vitest';
import { formatDate, parseDate, yearsBetween } from '@/core/dates';

describe('dates', () => {
    it('round-trips a date through the day number', () => {
        for (const iso of ['1970-01-01', '2026-11-10', '2040-05-16', '2028-02-29']) expect(formatDate(parseDate(iso))).toBe(iso);
    });

    it('counts days between dates, leap years included', () => {
        expect(parseDate('2026-11-11') - parseDate('2026-11-10')).toBe(1);
        expect(parseDate('2028-03-01') - parseDate('2028-02-28')).toBe(2);
        expect(parseDate('2027-03-01') - parseDate('2027-02-28')).toBe(1);
    });

    it('rejects bad and non-existent dates', () => {
        for (const bad of ['abc', '2026-13-01', '2026-02-30', '2027-02-29', '2026-04-31', '2026-03-00', '2026-00-10', '2026-2-3', '', '2026-11-10T00:00']) {
            expect(() => parseDate(bad), bad).toThrow(RangeError);
        }
    });

    it('turns days into years on act/365', () => {
        expect(yearsBetween(parseDate('2026-11-11'), parseDate('2027-11-11'))).toBe(1);
        expect(yearsBetween(100, 100)).toBe(0);
    });
});
