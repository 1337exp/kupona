import { describe, expect, it } from 'vitest';
import { bondQuote } from '@/core/bond';
import { compare, simulateBond, type Scenario } from '@/core/compare';
import { type Deposit, depositValue } from '@/core/deposit';
import { OFZ_26248 as OFZ } from '@/core/presets';

const quote = bondQuote(OFZ.bond, OFZ.buy);
const ytm = quote.ytm!;
const AMOUNT = 100_000;
const scenario = (patch: Partial<Scenario> = {}): Scenario => ({ horizonYears: 5, reinvestRate: 0, marketYield: null, ...patch });
const run = (s: Scenario, wholePieces = true) => simulateBond(OFZ.bond, OFZ.buy, AMOUNT, s, { wholePieces });
const deposit = (patch: Partial<Deposit> = {}): Deposit => ({ amount: AMOUNT, rate: 0.14, capitalization: 'monthly', termMonths: 12, ...patch });

describe('simulateBond: the purchase', () => {
    it('buys whole pieces and keeps the change', () => {
        const r = run(scenario());
        expect(r.pieces).toBe(Math.floor(AMOUNT / quote.dirtyPrice));
        expect(r.spent).toBeCloseTo(r.pieces * quote.dirtyPrice, 9);
        expect(r.spent + r.leftover).toBeCloseTo(AMOUNT, 9);
        expect(r.leftover).toBeGreaterThanOrEqual(0);
        expect(r.leftover).toBeLessThan(quote.dirtyPrice);
    });

    it('can take any fraction of a piece', () => {
        const r = run(scenario(), false);
        expect(r.pieces).toBeCloseTo(AMOUNT / quote.dirtyPrice, 9);
        expect(r.leftover).toBeCloseTo(0, 9);
    });

    it('is worth exactly the money put in right after the purchase, if the yield stays', () => {
        expect(run(scenario()).valueAt(0)).toBeCloseTo(AMOUNT, 6);
    });
});

describe('simulateBond: what the yield promises', () => {
    it('reinvesting at the yield we bought at gives money × (1 + yield)^years, at any moment', () => {
        const r = run(scenario({ reinvestRate: ytm }), false);
        for (const years of [0.5, 2, 5, 9, r.horizon]) {
            expect(r.valueAt(years) / (AMOUNT * (1 + ytm) ** years)).toBeCloseTo(1, 8);
        }
    });

    it('at maturity too, face value included', () => {
        const r = run(scenario({ horizonYears: 99, reinvestRate: ytm }), false);
        expect(r.atMaturity).toBe(true);
        expect(r.finalValue / (AMOUNT * (1 + ytm) ** quote.years)).toBeCloseTo(1, 8);
        expect(r.cagr).toBeCloseTo(ytm, 8);
    });

    it('with coupons lying idle the same bond gives far less: about 9% a year, not 16.7%', () => {
        const r = run(scenario({ horizonYears: 99, reinvestRate: 0 }), false);
        expect(r.cagr).toBeCloseTo(0.0897, 3);
        expect(r.reinvestGain).toBeCloseTo(0, 6);
        expect(r.couponsSum).toBeCloseTo(r.pieces * 28 * 61.08, 6);
        expect(r.exitValue).toBeCloseTo(r.pieces * 1000, 6);
        expect(r.paymentsReceived).toBe(28);
    });

    it('is better the higher the reinvestment rate', () => {
        const finals = [0, 0.08, 0.12, 0.16].map((reinvestRate) => run(scenario({ reinvestRate, horizonYears: 99 })).finalValue);
        for (let i = 1; i < finals.length; i++) expect(finals[i]!).toBeGreaterThan(finals[i - 1]!);
    });
});

describe('simulateBond: the parts add up', () => {
    it('final = coupons + reinvestment + exit + change, for any horizon, yield and reinvestment', () => {
        for (const horizonYears of [0.3, 1, 4.6, 12, 99]) {
            for (const marketYield of [null, 0.1, 0.2]) {
                for (const reinvestRate of [0, 0.09, 0.2]) {
                    const r = run(scenario({ horizonYears, marketYield, reinvestRate }));
                    expect(r.couponsSum + r.reinvestGain + r.exitValue + r.leftover, `${horizonYears} ${marketYield} ${reinvestRate}`).toBeCloseTo(
                        r.finalValue,
                        6,
                    );
                    expect(r.profit).toBeCloseTo(r.finalValue - AMOUNT, 9);
                }
            }
        }
    });

    it('counts the coupons received by the horizon', () => {
        expect(run(scenario({ horizonYears: 1 })).paymentsReceived).toBe(2);
        expect(run(scenario({ horizonYears: 0.06 })).paymentsReceived).toBe(1);
        expect(run(scenario({ horizonYears: 0.05 })).paymentsReceived).toBe(0);
    });

    it('cuts a horizon longer than the bond lives down to maturity, and a negative one to zero', () => {
        const long = run(scenario({ horizonYears: 99 }));
        expect(long.horizon).toBeCloseTo(quote.years, 12);
        expect(long.atMaturity).toBe(true);
        const none = run(scenario({ horizonYears: -3 }));
        expect(none.horizon).toBe(0);
        expect(none.cagr).toBe(0);
    });
});

describe('simulateBond: price risk', () => {
    it('sells higher when the market yield falls and lower when it rises', () => {
        const down = run(scenario({ horizonYears: 1, marketYield: 0.14 })).finalValue;
        const same = run(scenario({ horizonYears: 1 })).finalValue;
        const up = run(scenario({ horizonYears: 1, marketYield: 0.2 })).finalValue;
        expect(down).toBeGreaterThan(same);
        expect(same).toBeGreaterThan(up);
    });

    it('moves by about the modified duration: 1 point of yield is about 5% of the price', () => {
        const base = run(scenario({ horizonYears: 0.01 }), false).exitValue;
        const moved = run(scenario({ horizonYears: 0.01, marketYield: ytm + 0.01 }), false).exitValue;
        const change = (moved - base) / base;
        expect(change).toBeLessThan(-0.04);
        expect(change).toBeGreaterThan(-0.06);
    });

    it('matches the numbers of the first sketch: a year on, market at 14%, sold: about 30% a year', () => {
        const r = run(scenario({ horizonYears: 1, marketYield: 0.14 }), false);
        expect(r.cagr).toBeGreaterThan(0.28);
        expect(r.cagr).toBeLessThan(0.31);
    });
});

describe('compare', () => {
    it('puts the same money and the same horizon on both sides', () => {
        const c = compare(deposit(), OFZ.bond, OFZ.buy, scenario({ horizonYears: 3 }));
        expect(c.bond.horizon).toBe(3);
        expect(c.deposit.horizon).toBe(3);
        expect(c.deposit.finalValue).toBeCloseTo(depositValue(deposit(), 3), 9);
        expect(c.difference).toBeCloseTo(c.bond.finalValue - c.deposit.finalValue, 9);
    });

    it('finds the deposit rate that ties with the bond', () => {
        for (const s of [scenario(), scenario({ horizonYears: 99, reinvestRate: 0.12 }), scenario({ horizonYears: 2, marketYield: 0.13 })]) {
            const c = compare(deposit(), OFZ.bond, OFZ.buy, s);
            expect(c.breakEvenRate).not.toBeNull();
            const tied = depositValue(deposit({ rate: c.breakEvenRate! }), c.bond.horizon);
            expect(tied / c.bond.finalValue).toBeCloseTo(1, 9);
        }
    });

    it('says the bond is ahead only when the deposit rate is under the break-even one', () => {
        const s = scenario({ horizonYears: 99, reinvestRate: 0.12 });
        const be = compare(deposit(), OFZ.bond, OFZ.buy, s).breakEvenRate!;
        expect(compare(deposit({ rate: be - 0.01 }), OFZ.bond, OFZ.buy, s).difference).toBeGreaterThan(0);
        expect(compare(deposit({ rate: be + 0.01 }), OFZ.bond, OFZ.buy, s).difference).toBeLessThan(0);
    });

    it('shows the deposit winning against a bond whose coupons lie idle', () => {
        const c = compare(deposit(), OFZ.bond, OFZ.buy, scenario({ horizonYears: 99, reinvestRate: 0 }));
        expect(c.difference).toBeLessThan(0);
    });

    it('has no break-even when even a zero-rate deposit keeps up', () => {
        const c = compare(deposit(), OFZ.bond, OFZ.buy, scenario({ horizonYears: 0.1, marketYield: 0.6 }));
        expect(c.bond.finalValue).toBeLessThan(AMOUNT);
        expect(c.breakEvenRate).toBeNull();
    });
});
