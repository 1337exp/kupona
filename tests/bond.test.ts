import { describe, expect, it } from 'vitest';
import {
    type Bond,
    accruedInterest,
    bondProblems,
    bondQuote,
    couponFromRate,
    couponSchedule,
    dirtyValue,
    periodDaysFromFrequency,
    reinvestedValue,
} from '@/core/bond';
import { formatDate, parseDate } from '@/core/dates';
import { OFZ_26248 as OFZ } from '@/core/presets';

const buyDay = parseDate(OFZ.buy.date);

describe('couponSchedule', () => {
    const schedule = couponSchedule(OFZ.bond, buyDay);

    it('lists the 28 payments left, counted back from maturity in 182-day steps', () => {
        expect(schedule).toHaveLength(OFZ.reference.paymentsLeft);
        expect(formatDate(schedule[0]!.day)).toBe('2026-12-02');
        expect(formatDate(schedule[27]!.day)).toBe('2040-05-16');
        for (let i = 1; i < schedule.length; i++) expect(schedule[i]!.day - schedule[i - 1]!.day).toBe(182);
    });

    it('matches coupon dates printed on the page', () => {
        const printed = ['2027-06-02', '2027-12-01', '2028-05-31', '2030-05-29', '2039-11-16'];
        const dates = schedule.map((p) => formatDate(p.day));
        for (const d of printed) expect(dates).toContain(d);
    });

    it('pays the face value only with the last coupon', () => {
        expect(schedule.map((p) => p.redemption).filter((r) => r > 0)).toEqual([1000]);
        expect(schedule[27]!.redemption).toBe(1000);
        expect(schedule.every((p) => p.coupon === 61.08)).toBe(true);
    });

    it('measures time in years from the purchase', () => {
        expect(schedule[0]!.t).toBeCloseTo(21 / 365, 12);
        expect(schedule[27]!.t).toBeCloseTo((parseDate('2040-05-16') - buyDay) / 365, 12);
    });

    it('leaves out a payment that falls on the purchase day', () => {
        const onCoupon = couponSchedule(OFZ.bond, parseDate('2026-12-02'));
        expect(formatDate(onCoupon[0]!.day)).toBe('2027-06-02');
        expect(onCoupon).toHaveLength(27);
    });

    it('refuses a matured bond and a bad period', () => {
        expect(() => couponSchedule(OFZ.bond, parseDate('2040-05-16'))).toThrow(RangeError);
        expect(() => couponSchedule({ ...OFZ.bond, periodDays: 0 }, buyDay)).toThrow(RangeError);
    });
});

describe('coupon helpers', () => {
    it('turns a yearly rate into the coupon the exchange pays', () => {
        expect(couponFromRate(1000, 0.1225, 182)).toBeCloseTo(61.08, 2);
    });

    it('gives the usual period for a number of payments a year', () => {
        expect(periodDaysFromFrequency(2)).toBe(182);
        expect(periodDaysFromFrequency(4)).toBe(91);
        expect(periodDaysFromFrequency(1)).toBe(365);
    });
});

describe('accruedInterest', () => {
    it('gives the 54.03 the page showed', () => {
        expect(accruedInterest(OFZ.bond, buyDay)).toBeCloseTo(OFZ.reference.accrued, 2);
    });

    it('is one day of coupon right after a payment and zero on a payment day', () => {
        expect(accruedInterest(OFZ.bond, parseDate('2026-12-03'))).toBeCloseTo(61.08 / 182, 9);
        expect(accruedInterest(OFZ.bond, parseDate('2026-12-02'))).toBe(0);
    });
});

describe('bondQuote', () => {
    const q = bondQuote(OFZ.bond, OFZ.buy);

    it('prices what we pay: clean price plus accrued interest', () => {
        expect(q.cleanPrice).toBeCloseTo(793.97, 2);
        expect(q.dirtyPrice).toBeCloseTo(793.97 + 54.03, 2);
    });

    it('reproduces the yield to maturity of the page', () => {
        expect(q.ytm).not.toBeNull();
        expect(Math.abs(q.ytm! - OFZ.reference.ytm)).toBeLessThan(0.0002);
    });

    it('reproduces the current yield of the page', () => {
        expect(Math.abs(q.currentYield - OFZ.reference.currentYield)).toBeLessThan(0.0002);
    });

    it('lands near the duration of the page (the exchange counts it a day or two differently)', () => {
        expect(Math.abs(q.macaulayYears! * 365 - OFZ.reference.macaulayDays)).toBeLessThan(5);
        expect(q.modifiedYears!).toBeLessThan(q.macaulayYears!);
    });

    it('discounts the payments back to exactly the price we pay', () => {
        const schedule = couponSchedule(OFZ.bond, buyDay);
        expect(dirtyValue(schedule, 0, q.ytm!)).toBeCloseTo(q.dirtyPrice, 8);
    });

    it('solves a one-payment bond by hand: 900 now for 1000 in a year is 11.1%', () => {
        const zero: Bond = { nominal: 1000, couponRub: 0, periodDays: 365, maturity: '2027-11-11' };
        const quote = bondQuote(zero, { date: '2026-11-11', cleanPricePercent: 90 });
        expect(quote.accrued).toBe(0);
        expect(quote.ytm).toBeCloseTo(1 / 0.9 - 1, 9);
        expect(quote.macaulayYears).toBeCloseTo(1, 9);
        expect(quote.paymentsLeft).toBe(1);
    });

    it('has no yield when the price cannot be reached', () => {
        expect(bondQuote(OFZ.bond, { ...OFZ.buy, cleanPricePercent: 1e9 }).ytm).toBeNull();
    });

    it('refuses bad input', () => {
        expect(() => bondQuote(OFZ.bond, { ...OFZ.buy, cleanPricePercent: 0 })).toThrow(RangeError);
    });
});

describe('dirtyValue and reinvestedValue', () => {
    const schedule = couponSchedule(OFZ.bond, buyDay);

    it('the price falls when the yield rises', () => {
        let prev = Infinity;
        for (const y of [0.05, 0.1, 0.15, 0.2, 0.3]) {
            const v = dirtyValue(schedule, 0, y);
            expect(v).toBeLessThan(prev);
            prev = v;
        }
    });

    it('is worth the face value plus coupons without discounting at zero yield', () => {
        expect(dirtyValue(schedule, 0, 0)).toBeCloseTo(28 * 61.08 + 1000, 9);
    });

    it('discounts only the time left: just before the end the price is the last payment less a hair', () => {
        const last = schedule[27]!.t;
        const y = 0.1665;
        expect(dirtyValue(schedule, last - 0.01, y)).toBeCloseTo(1061.08 / (1 + y) ** 0.01, 9);
        expect(dirtyValue(schedule, last, y)).toBe(0);
    });

    it('does not count a payment that falls exactly on the moment', () => {
        const t1 = schedule[0]!.t;
        expect(dirtyValue(schedule, t1, 0.1)).toBeCloseTo(dirtyValue(schedule.slice(1), t1, 0.1), 12);
        expect(reinvestedValue(schedule, t1, 0.1)).toBeCloseTo(61.08, 12);
    });

    it('with reinvestment at the same yield, money at the end is the price times (1 + y)^T: the idea behind the yield', () => {
        const T = schedule[27]!.t;
        for (const y of [0.05, 0.1665, 0.3]) {
            expect(reinvestedValue(schedule, T, y) / (dirtyValue(schedule, 0, y) * (1 + y) ** T)).toBeCloseTo(1, 10);
        }
    });

    it('is just the sum of payments when they lie idle', () => {
        expect(reinvestedValue(schedule, schedule[27]!.t, 0)).toBeCloseTo(28 * 61.08 + 1000, 9);
        expect(reinvestedValue(schedule, 0, 0.1)).toBe(0);
    });
});

describe('bondProblems', () => {
    it('is empty for a good bond', () => {
        expect(bondProblems(OFZ.bond, OFZ.buy)).toEqual([]);
    });

    it('names what is wrong', () => {
        expect(bondProblems({ ...OFZ.bond, nominal: 0 }, OFZ.buy)).toContain('nominal');
        expect(bondProblems({ ...OFZ.bond, couponRub: -1 }, OFZ.buy)).toContain('coupon');
        expect(bondProblems({ ...OFZ.bond, periodDays: 1.5 }, OFZ.buy)).toContain('period');
        expect(bondProblems(OFZ.bond, { ...OFZ.buy, cleanPricePercent: -5 })).toContain('price');
        expect(bondProblems(OFZ.bond, { ...OFZ.buy, date: '2026-02-30' })).toContain('date');
        expect(bondProblems({ ...OFZ.bond, maturity: 'soon' }, OFZ.buy)).toContain('date');
        expect(bondProblems(OFZ.bond, { ...OFZ.buy, date: '2040-05-16' })).toContain('matured');
    });
});
