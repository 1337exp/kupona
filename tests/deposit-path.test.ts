import { describe, expect, it } from 'vitest';
import { type Deposit, depositValue, simulateDeposit } from '@/core/deposit';

const dep = (patch: Partial<Deposit> = {}): Deposit => ({ amount: 1000, rate: 0.12, capitalization: 'monthly', termMonths: 12, ...patch });

const fall = [
    { t: 0, delta: 0 },
    { t: 1, delta: -0.04 },
    { t: 10, delta: -0.04 },
];

describe('depositValue with rates that move', () => {
    it('is the same as no path when nothing moves', () => {
        expect(depositValue(dep(), 3.4, [])).toBeCloseTo(depositValue(dep(), 3.4), 12);
        expect(depositValue(dep(), 3.4, [{ t: 0, delta: 0 }, { t: 9, delta: 0 }])).toBeCloseTo(depositValue(dep(), 3.4), 12);
    });

    it('takes the rate of the day at every renewal: 12% the first year, 8% the second', () => {
        expect(depositValue(dep(), 2, fall)).toBeCloseTo(1000 * 1.01 ** 12 * (1 + 0.08 / 12) ** 12, 9);
    });

    it('keeps the rate of a contract until it ends, whatever happens meanwhile', () => {
        const sudden = [
            { t: 0, delta: 0 },
            { t: 0.5, delta: -0.05 },
            { t: 5, delta: -0.05 },
        ];
        expect(depositValue(dep(), 1, sudden)).toBeCloseTo(depositValue(dep(), 1), 12);
    });

    it('earns the rate of the last renewal on a tail', () => {
        expect(depositValue(dep({ capitalization: 'yearly' }), 1.5, fall)).toBeCloseTo(1000 * 1.12 * (1 + 0.08 * 0.5), 9);
    });

    it('never earns below zero', () => {
        const crash = [
            { t: 0, delta: 0 },
            { t: 1, delta: -0.2 },
            { t: 9, delta: -0.2 },
        ];
        expect(depositValue(dep(), 3, crash)).toBeCloseTo(1000 * 1.01 ** 12, 9);
    });

    it('ends lower when rates fall and higher when they rise', () => {
        const rise = fall.map((p) => ({ ...p, delta: -p.delta }));
        expect(depositValue(dep(), 5, fall)).toBeLessThan(depositValue(dep(), 5));
        expect(depositValue(dep(), 5, rise)).toBeGreaterThan(depositValue(dep(), 5));
    });

    it('works with interest paid at the end of the term and with short terms', () => {
        // Terms of 6 months start at 0, 0.5, 1, 1.5. The shift falls in a straight line to -4 points at year 1, so the rates are
        // 12%, 10%, 8%, 8%. / Сроки по полгода начинаются в 0, 0.5, 1, 1.5; сдвиг падает прямой до -4 пунктов к году: 12%, 10%, 8%, 8%.
        expect(depositValue(dep({ capitalization: 'end', termMonths: 6 }), 1, fall)).toBeCloseTo(1000 * 1.06 * 1.05, 9);
        expect(depositValue(dep({ capitalization: 'end', termMonths: 6 }), 2, fall)).toBeCloseTo(1000 * 1.06 * 1.05 * 1.04 * 1.04, 9);
    });
});

describe('simulateDeposit with rates that move', () => {
    it('counts plain interest term by term: 12% then 8% is 200 on 1000', () => {
        const run = simulateDeposit(dep(), 2, fall);
        expect(run.simpleProfit).toBeCloseTo(1000 * 0.12 + 1000 * 0.08, 9);
        expect(run.profit).toBeCloseTo(run.simpleProfit + run.compoundExtra, 9);
        expect(run.finalValue).toBeCloseTo(depositValue(dep(), 2, fall), 12);
    });

    it('counts the tail at the rate of the last renewal', () => {
        const run = simulateDeposit(dep({ capitalization: 'yearly' }), 1.5, fall);
        expect(run.simpleProfit).toBeCloseTo(1000 * 0.12 + 1000 * 0.08 * 0.5, 9);
    });

    it('keeps the old plain interest when nothing moves', () => {
        expect(simulateDeposit(dep(), 5, []).simpleProfit).toBeCloseTo(600, 9);
    });
});
