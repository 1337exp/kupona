import { describe, expect, it } from 'vitest';
import { defaultInputs, evaluate, lifeYears, sanitizeInputs, type Inputs } from '@/app/model';

const withInputs = (patch: (i: Inputs) => void): Inputs => {
    const i = defaultInputs();
    patch(i);
    return i;
};

describe('evaluate', () => {
    it('runs the example through the core: the exchange numbers come out', () => {
        const r = evaluate(defaultInputs());
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(Math.abs(r.value.quote.ytm! - 0.1666)).toBeLessThan(0.0002);
        expect(r.value.quote.accrued).toBeCloseTo(54.03, 2);
        expect(r.value.lifeYears).toBeCloseTo(13.52, 2);
        expect(r.value.comparison.bond.pieces).toBe(117);
    });

    it('turns percent typed by a person into fractions for the core', () => {
        const r = evaluate(
            withInputs((i) => {
                i.deposit.ratePercent = 12;
                i.scenario.reinvestPercent = 7.5;
                i.scenario.marketYieldPercent = 14;
            }),
        );
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.value.deposit.rate).toBeCloseTo(0.12, 12);
        expect(r.value.scenario.reinvestRate).toBeCloseTo(0.075, 12);
        expect(r.value.scenario.marketYield).toBeCloseTo(0.14, 12);
    });

    it('keeps "the market does not move" as null, not as zero', () => {
        const r = evaluate(defaultInputs());
        expect(r.ok && r.value.scenario.marketYield).toBeNull();
    });

    it('derives the period from payments a year: 2 gives 182 days, 4 gives 91', () => {
        const two = evaluate(defaultInputs());
        const four = evaluate(withInputs((i) => (i.bond.paymentsPerYear = 4)));
        expect(two.ok && two.value.bond.periodDays).toBe(182);
        expect(four.ok && four.value.bond.periodDays).toBe(91);
    });

    it('ties the bond to the deposit amount: one sum for both', () => {
        const r = evaluate(withInputs((i) => (i.scenario.amount = 250_000)));
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.value.deposit.amount).toBe(250_000);
        expect(r.value.comparison.bond.spent + r.value.comparison.bond.leftover).toBeCloseTo(250_000, 6);
    });

    it('with coupons put at the yield and held to the end, the bond gives about the yield a year', () => {
        const r = evaluate(
            withInputs((i) => {
                i.scenario.horizonYears = 99;
                i.scenario.reinvestPercent = 16.65;
            }),
        );
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(Math.abs(r.value.comparison.bond.cagr - r.value.quote.ytm!)).toBeLessThan(0.001);
    });
});

describe('evaluate: problems', () => {
    const problems = (patch: (i: Inputs) => void) => {
        const r = evaluate(withInputs(patch));
        return r.ok ? [] : r.problems;
    };

    it('names the field that is empty or wrong', () => {
        expect(problems((i) => (i.scenario.amount = null))).toContain('amount');
        expect(problems((i) => (i.scenario.amount = 0))).toContain('amount');
        expect(problems((i) => (i.deposit.ratePercent = null))).toContain('rate');
        expect(problems((i) => (i.deposit.ratePercent = -1))).toContain('rate');
        expect(problems((i) => (i.deposit.termMonths = 0))).toContain('term');
        expect(problems((i) => (i.deposit.termMonths = 1.5))).toContain('term');
        expect(problems((i) => (i.scenario.reinvestPercent = null))).toContain('reinvest');
        expect(problems((i) => (i.scenario.marketYieldPercent = -80))).toContain('marketYield');
        expect(problems((i) => (i.scenario.horizonYears = 0))).toContain('horizon');
    });

    it('passes bond problems through', () => {
        expect(problems((i) => (i.bond.cleanPricePercent = null))).toContain('price');
        expect(problems((i) => (i.bond.nominal = null))).toContain('nominal');
        expect(problems((i) => (i.bond.couponRub = null))).toContain('coupon');
        expect(problems((i) => (i.bond.buyDate = null))).toContain('date');
        expect(problems((i) => (i.bond.maturity = '2020-01-01'))).toContain('matured');
    });

    it('lists every problem at once, not just the first', () => {
        const p = problems((i) => {
            i.scenario.amount = null;
            i.deposit.ratePercent = null;
            i.bond.cleanPricePercent = null;
        });
        expect(p).toEqual(expect.arrayContaining(['amount', 'rate', 'price']));
    });

    it('allows a zero deposit rate and zero reinvestment', () => {
        expect(problems((i) => (i.deposit.ratePercent = 0))).toEqual([]);
        expect(problems((i) => (i.scenario.reinvestPercent = 0))).toEqual([]);
    });
});

describe('lifeYears', () => {
    it('counts years to maturity from the settlement date', () => {
        expect(lifeYears(defaultInputs())).toBeCloseTo(13.52, 2);
    });

    it('is null when the dates make no sense', () => {
        expect(lifeYears(withInputs((i) => (i.bond.buyDate = null)))).toBeNull();
        expect(lifeYears(withInputs((i) => (i.bond.maturity = '2020-01-01')))).toBeNull();
        expect(lifeYears(withInputs((i) => (i.bond.maturity = 'soon')))).toBeNull();
    });
});

describe('sanitizeInputs', () => {
    it('gives the example for anything that is not an object', () => {
        for (const junk of [null, undefined, 5, 'text', []]) expect(sanitizeInputs(junk)).toEqual(defaultInputs());
    });

    it('keeps what is valid', () => {
        const mine = withInputs((i) => {
            i.deposit.ratePercent = 9.5;
            i.deposit.capitalization = 'yearly';
            i.scenario.amount = 5000;
            i.bond.paymentsPerYear = 4;
            i.scenario.marketYieldPercent = 13;
        });
        expect(sanitizeInputs(JSON.parse(JSON.stringify(mine)))).toEqual(mine);
    });

    it('keeps an emptied field empty', () => {
        const mine = withInputs((i) => (i.scenario.amount = null));
        expect(sanitizeInputs(JSON.parse(JSON.stringify(mine))).scenario.amount).toBeNull();
    });

    it('replaces only the bad fields with the example values', () => {
        const base = defaultInputs();
        const got = sanitizeInputs({
            deposit: { ratePercent: 'lots', capitalization: 'hourly', termMonths: 6 },
            bond: { nominal: NaN, paymentsPerYear: 3, buyDate: '2026-02-30', maturity: '2035-01-01' },
            scenario: { amount: Infinity, horizonYears: '5', reinvestPercent: 3, marketYieldPercent: 'x' },
        });
        expect(got.deposit.ratePercent).toBe(base.deposit.ratePercent);
        expect(got.deposit.capitalization).toBe(base.deposit.capitalization);
        expect(got.deposit.termMonths).toBe(6);
        expect(got.bond.nominal).toBe(base.bond.nominal);
        expect(got.bond.paymentsPerYear).toBe(base.bond.paymentsPerYear);
        expect(got.bond.buyDate).toBe(base.bond.buyDate);
        expect(got.bond.maturity).toBe('2035-01-01');
        expect(got.scenario.amount).toBe(base.scenario.amount);
        expect(got.scenario.horizonYears).toBe(base.scenario.horizonYears);
        expect(got.scenario.reinvestPercent).toBe(3);
        expect(got.scenario.marketYieldPercent).toBe(base.scenario.marketYieldPercent);
    });

    it('does not trust a prototype trick', () => {
        const got = sanitizeInputs(JSON.parse('{"__proto__": {"polluted": true}, "deposit": {"ratePercent": 1}}'));
        expect(got.deposit.ratePercent).toBe(1);
        expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    });
});
