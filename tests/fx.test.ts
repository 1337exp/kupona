import { describe, expect, it } from 'vitest';
import { type Scenario, compare } from '@/core/compare';
import { exchangeAt } from '@/core/currency';
import { type Deposit, depositNet, depositValue, effectiveRate, simulateDeposit } from '@/core/deposit';
import { OFZ_26248 as OFZ } from '@/core/presets';

/** 100 000 roubles into dollars at 100, 3% a year added yearly. / 100 000 рублей в доллары по 100, 3% годовых раз в год. */
const usd = (patch: Partial<Deposit> = {}, change = 0.1): Deposit => ({
    amount: 100_000,
    rate: 0.03,
    capitalization: 'yearly',
    termMonths: 12,
    exchange: { rate0: 100, yearlyChange: change },
    ...patch,
});
const rub = (patch: Partial<Deposit> = {}): Deposit => ({ amount: 100_000, rate: 0.03, capitalization: 'yearly', termMonths: 12, ...patch });

const falling = [
    { t: 0, delta: 0 },
    { t: 1, delta: -0.02 },
    { t: 9, delta: -0.02 },
];

describe('exchangeAt', () => {
    it('starts at today\'s rate and changes by a share a year, compounded', () => {
        const ex = { rate0: 100, yearlyChange: 0.1 };
        expect(exchangeAt(ex, 0)).toBe(100);
        expect(exchangeAt(ex, 1)).toBeCloseTo(110, 12);
        expect(exchangeAt(ex, 2)).toBeCloseTo(121, 12);
        expect(exchangeAt({ rate0: 100, yearlyChange: -0.2 }, 1)).toBeCloseTo(80, 12);
    });
});

describe('a deposit in a foreign currency', () => {
    it('changes the roubles, earns in the currency and changes them back at the rate of the day', () => {
        // 1000 dollars, 3% -> 1030 dollars, at 110 -> 113 300 roubles
        expect(depositValue(usd(), 1)).toBeCloseTo(113_300, 6);
        expect(depositNet(usd(), 1)).toBeCloseTo(113_300, 6);
    });

    it('is worth the money put in on the first day', () => {
        expect(depositValue(usd(), 0)).toBe(100_000);
        expect(depositNet(usd(), 0)).toBe(100_000);
        expect(simulateDeposit(usd(), 0).finalValue).toBe(100_000);
    });

    it('is a plain rouble deposit when the rate stands still', () => {
        expect(depositValue(usd({}, 0), 3.4)).toBeCloseTo(depositValue(rub(), 3.4), 6);
        expect(depositNet(usd({ taxRate: 0.13 }, 0), 3.4)).toBeCloseTo(depositNet(rub({ taxRate: 0.13 }), 3.4), 6);
    });

    it('loses money when the rouble gets stronger faster than the interest', () => {
        const run = simulateDeposit(usd({}, -0.2), 1);
        expect(run.finalValue).toBeCloseTo(1030 * 80, 6);
        expect(run.finalValue).toBeLessThan(100_000);
        expect(run.fxGain).toBeCloseTo(1000 * (80 - 100), 6);
    });

    it('taxes the interest in the currency, not the change of the rate', () => {
        const taxed = depositNet(usd({ taxRate: 0.13 }), 1);
        expect(taxed).toBeCloseTo((1030 - 0.13 * 30) * 110, 6);
        // the tax in roubles follows the rate of the day, the base does not follow the exchange gain
        const run = simulateDeposit(usd({ taxRate: 0.13 }), 1);
        expect(run.tax).toBeCloseTo(0.13 * 30 * 110, 6);
        const flat = simulateDeposit(usd({ taxRate: 0.13 }, 0), 1);
        expect(flat.tax).toBeCloseTo(0.13 * 30 * 100, 6);
    });

    it('does not tax a loss on the exchange and does not give it back', () => {
        const run = simulateDeposit(usd({ taxRate: 0.13 }, -0.5), 1);
        expect(run.tax).toBeCloseTo(0.13 * 30 * 50, 6);
        expect(run.finalValue).toBeLessThan(100_000);
    });

    it('splits the profit into plain interest, interest on interest, the tax and the exchange', () => {
        for (const change of [-0.2, 0, 0.1]) {
            for (const horizon of [0.4, 1, 3.7]) {
                for (const path of [[], falling]) {
                    const run = simulateDeposit(usd({ taxRate: 0.13, capitalization: 'monthly' }, change), horizon, path);
                    expect(run.profit, `${change} ${horizon}`).toBeCloseTo(run.simpleProfit + run.compoundExtra - run.tax + run.fxGain, 6);
                    expect(run.profit).toBeCloseTo(run.finalValue - 100_000, 9);
                }
            }
        }
    });

    it('counts the plain interest in roubles at the rate of the day: 1000 dollars, 3%', () => {
        const one = simulateDeposit(usd(), 1);
        expect(one.simpleProfit).toBeCloseTo(1000 * 0.03 * 110, 6);
        expect(one.compoundExtra).toBeCloseTo(0, 6); // one year, added once
        const two = simulateDeposit(usd(), 2);
        expect(two.simpleProfit).toBeCloseTo(1000 * 0.03 * 2 * 121, 6);
        expect(two.compoundExtra).toBeCloseTo(1000 * (1.03 ** 2 - 1) * 121 - 1000 * 0.03 * 2 * 121, 6);
    });

    it('counts the plain interest in roubles when the rate moves, term by term and on the tail', () => {
        const terms = simulateDeposit(usd(), 2, falling);
        expect(terms.simpleProfit).toBeCloseTo((1000 * 0.03 + 1000 * 0.01) * 121, 6);
        const tail = simulateDeposit(usd(), 1.5, falling);
        expect(tail.simpleProfit).toBeCloseTo((1000 * 0.03 + 1000 * 0.01 * 0.5) * exchangeAt({ rate0: 100, yearlyChange: 0.1 }, 1.5), 6);
        // the tail earns on 1030, not on 1000: 1030 × 1% × ½ − 1000 × 1% × ½ = 0.15 dollars
        expect(tail.compoundExtra).toBeCloseTo(0.15 * exchangeAt({ rate0: 100, yearlyChange: 0.1 }, 1.5), 6);
    });

    it('has no exchange gain in roubles', () => {
        const run = simulateDeposit(rub(), 2);
        expect(run.fxGain).toBe(0);
        expect(run.profit).toBeCloseTo(run.simpleProfit + run.compoundExtra - run.tax, 9);
    });

    it('reports the effective rate in the currency itself', () => {
        expect(effectiveRate(usd({ capitalization: 'monthly' }, 0.5))).toBeCloseTo(1.0025 ** 12 - 1, 9);
        expect(effectiveRate(usd())).toBeCloseTo(0.03, 12);
    });

    it('follows the curve of rates: lower rates, less interest', () => {
        expect(depositValue(usd(), 3, falling)).toBeLessThan(depositValue(usd(), 3));
        const two = depositValue(usd({}, 0), 2, falling);
        expect(two).toBeCloseTo(100_000 * 1.03 * 1.01, 6);
    });

    it('is worth more the weaker the rouble', () => {
        const values = [-0.1, 0, 0.1, 0.3].map((c) => depositNet(usd({}, c), 2));
        for (let i = 1; i < values.length; i++) expect(values[i]!).toBeGreaterThan(values[i - 1]!);
    });
});

describe('a foreign deposit against the bond', () => {
    const scenario = (patch: Partial<Scenario> = {}): Scenario => ({ horizonYears: 5, reinvestRate: 0, marketYield: null, ...patch });

    it('is compared in roubles at the end', () => {
        const c = compare(usd({}, 0.1), OFZ.bond, OFZ.buy, scenario());
        expect(c.deposit.finalValue).toBeCloseTo(depositNet(usd({}, 0.1), 5), 6);
        expect(c.deposit.fxGain).toBeGreaterThan(0);
    });

    it('finds the tie rate of the foreign deposit', () => {
        const c = compare(usd({ taxRate: 0.13 }, 0.05), OFZ.bond, OFZ.buy, scenario({ horizonYears: 99, reinvestRate: 0.1 }));
        expect(c.breakEvenRate).not.toBeNull();
        const tied = depositNet(usd({ taxRate: 0.13, rate: c.breakEvenRate! }, 0.05), c.bond.horizon);
        expect(tied / c.bond.finalValue).toBeCloseTo(1, 9);
    });

    it('a weaker rouble favours the foreign deposit and hurts the rouble bond', () => {
        const flat = compare(usd({}, 0), OFZ.bond, OFZ.buy, scenario());
        const weak = compare(usd({}, 0.15), OFZ.bond, OFZ.buy, scenario());
        expect(weak.bond.finalValue).toBeCloseTo(flat.bond.finalValue, 9);
        expect(weak.difference).toBeLessThan(flat.difference);
    });
});
