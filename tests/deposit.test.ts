import { describe, expect, it } from 'vitest';
import { type Deposit, depositValue, effectiveRate, simulateDeposit } from '@/core/deposit';

const dep = (patch: Partial<Deposit> = {}): Deposit => ({ amount: 1000, rate: 0.12, capitalization: 'monthly', termMonths: 12, ...patch });

describe('depositValue', () => {
    it('adds interest monthly: 12% nominal gives 1.01^12 in a year', () => {
        expect(depositValue(dep(), 1)).toBeCloseTo(1000 * 1.01 ** 12, 9);
    });

    it('adds interest yearly, quarterly and daily', () => {
        expect(depositValue(dep({ capitalization: 'yearly' }), 1)).toBeCloseTo(1120, 9);
        expect(depositValue(dep({ capitalization: 'quarterly' }), 1)).toBeCloseTo(1000 * 1.03 ** 4, 9);
        expect(depositValue(dep({ capitalization: 'daily' }), 1)).toBeCloseTo(1000 * (1 + 0.12 / 365) ** 365, 9);
    });

    it('pays only at the end of the term, then renews the whole balance', () => {
        const d = dep({ capitalization: 'end' });
        expect(depositValue(d, 0.5)).toBeCloseTo(1060, 9);
        expect(depositValue(d, 1)).toBeCloseTo(1120, 9);
        expect(depositValue(d, 5)).toBeCloseTo(1000 * 1.12 ** 5, 9);
        expect(depositValue(dep({ capitalization: 'end', termMonths: 3 }), 1)).toBeCloseTo(1000 * 1.03 ** 4, 9);
    });

    it('keeps adding interest after the term is renewed', () => {
        expect(depositValue(dep(), 5)).toBeCloseTo(1000 * 1.01 ** 60, 8);
    });

    it('earns the same rate on a tail shorter than a term', () => {
        expect(depositValue(dep(), 1.5)).toBeCloseTo(1000 * 1.01 ** 18, 9);
        expect(depositValue(dep({ capitalization: 'yearly' }), 1.5)).toBeCloseTo(1000 * 1.12 * (1 + 0.12 * 0.5), 9);
    });

    it('is the amount itself at zero and before', () => {
        expect(depositValue(dep(), 0)).toBe(1000);
        expect(depositValue(dep(), -2)).toBe(1000);
    });

    it('grows with the rate', () => {
        let prev = 0;
        for (const rate of [0, 0.05, 0.1, 0.2, 0.5]) {
            const v = depositValue(dep({ rate }), 3);
            expect(v).toBeGreaterThan(prev);
            prev = v;
        }
    });

    it('gives the amount back at a zero rate', () => {
        expect(depositValue(dep({ rate: 0 }), 7)).toBe(1000);
    });
});

describe('effectiveRate', () => {
    it('is higher than the nominal rate when interest is capitalized', () => {
        expect(effectiveRate(dep())).toBeCloseTo(1.01 ** 12 - 1, 9);
        expect(effectiveRate(dep({ capitalization: 'yearly' }))).toBeCloseTo(0.12, 9);
    });
});

describe('simulateDeposit', () => {
    it('counts the capitalizations', () => {
        expect(simulateDeposit(dep(), 5).capitalizations).toBe(60);
        expect(simulateDeposit(dep({ capitalization: 'end' }), 5).capitalizations).toBe(5);
        expect(simulateDeposit(dep({ capitalization: 'yearly', termMonths: 24 }), 5).capitalizations).toBe(5);
        expect(simulateDeposit(dep({ capitalization: 'daily' }), 1).capitalizations).toBe(365);
    });

    it('separates simple interest from interest on interest', () => {
        const run = simulateDeposit(dep(), 5);
        expect(run.simpleProfit).toBeCloseTo(600, 9);
        expect(run.profit).toBeCloseTo(run.simpleProfit + run.compoundExtra, 9);
        expect(run.compoundExtra).toBeGreaterThan(0);
        expect(simulateDeposit(dep({ capitalization: 'end' }), 0.5).compoundExtra).toBeCloseTo(0, 9);
    });

    it('reports yearly growth equal to the effective rate when whole years are held', () => {
        const run = simulateDeposit(dep(), 4);
        expect(run.cagr).toBeCloseTo(run.effectiveRate, 9);
        expect(run.finalValue).toBeCloseTo(depositValue(dep(), 4), 9);
    });

    it('handles a zero horizon', () => {
        const run = simulateDeposit(dep(), 0);
        expect(run.finalValue).toBe(1000);
        expect(run.cagr).toBe(0);
        expect(run.capitalizations).toBe(0);
    });
});
