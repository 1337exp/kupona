import { describe, expect, it } from 'vitest';
import { type RatePath, compounding, isFlat, shiftAt } from '@/core/rates';

const ramp: RatePath = [
    { t: 0, delta: 0 },
    { t: 4, delta: -0.04 },
];

describe('shiftAt', () => {
    it('is zero for no path', () => {
        expect(shiftAt([], 3)).toBe(0);
    });

    it('stays at the end points outside the path', () => {
        expect(shiftAt(ramp, -5)).toBe(0);
        expect(shiftAt(ramp, 0)).toBe(0);
        expect(shiftAt(ramp, 4)).toBe(-0.04);
        expect(shiftAt(ramp, 40)).toBe(-0.04);
    });

    it('goes in straight lines between points', () => {
        expect(shiftAt(ramp, 1)).toBeCloseTo(-0.01, 12);
        expect(shiftAt(ramp, 2)).toBeCloseTo(-0.02, 12);
        expect(shiftAt(ramp, 3.5)).toBeCloseTo(-0.035, 12);
    });

    it('finds the right piece among many points', () => {
        const wavy: RatePath = Array.from({ length: 41 }, (_, i) => ({ t: i, delta: i % 2 === 0 ? 0.01 : -0.01 }));
        for (let i = 0; i < 40; i++) {
            expect(shiftAt(wavy, i)).toBeCloseTo(i % 2 === 0 ? 0.01 : -0.01, 12);
            expect(shiftAt(wavy, i + 0.5)).toBeCloseTo(0, 12);
        }
    });

    it('takes the later value when two points share a moment (a step)', () => {
        const step: RatePath = [
            { t: 0, delta: 0 },
            { t: 2, delta: 0 },
            { t: 2, delta: -0.05 },
            { t: 9, delta: -0.05 },
        ];
        expect(shiftAt(step, 1.99)).toBe(0);
        expect(shiftAt(step, 2.01)).toBe(-0.05);
    });
});

describe('isFlat', () => {
    it('is true when nothing moves', () => {
        expect(isFlat([])).toBe(true);
        expect(isFlat([{ t: 0, delta: 0 }, { t: 9, delta: 0 }])).toBe(true);
    });

    it('is false as soon as one point moves', () => {
        expect(isFlat(ramp)).toBe(false);
        expect(isFlat([{ t: 0, delta: 0.0001 }])).toBe(false);
    });
});

describe('compounding', () => {
    it('is the plain power when nothing moves', () => {
        expect(compounding([], 0.1, 10).factor(1, 4)).toBeCloseTo(1.1 ** 3, 12);
        expect(compounding([{ t: 0, delta: 0 }], 0.1, 10).factor(0, 10)).toBeCloseTo(1.1 ** 10, 12);
    });

    it('grows at the shifted rate when the shift is constant', () => {
        const c = compounding([{ t: 0, delta: 0.03 }, { t: 20, delta: 0.03 }], 0.1, 10);
        expect(c.factor(2, 7)).toBeCloseTo(1.13 ** 5, 9);
    });

    it('follows a moving rate: the integral of ln(1 + rate), checked by a fine sum', () => {
        let sum = 0;
        const n = 200_000;
        for (let i = 0; i < n; i++) sum += Math.log1p(0.1 + shiftAt(ramp, ((i + 0.5) * 4) / n)) * (4 / n);
        expect(compounding(ramp, 0.1, 6).factor(0, 4)).toBeCloseTo(Math.exp(sum), 5);
    });

    it('is lower than the flat rate when rates fall, higher when they rise', () => {
        const flat = compounding([], 0.1, 6).factor(0, 5);
        expect(compounding(ramp, 0.1, 6).factor(0, 5)).toBeLessThan(flat);
        const up: RatePath = [{ t: 0, delta: 0 }, { t: 4, delta: 0.04 }];
        expect(compounding(up, 0.1, 6).factor(0, 5)).toBeGreaterThan(flat);
    });

    it('chains: growth to a middle moment times growth from it is growth over the whole', () => {
        const c = compounding(ramp, 0.12, 10);
        expect(c.factor(0, 2.3) * c.factor(2.3, 7.7)).toBeCloseTo(c.factor(0, 7.7), 12);
    });

    it('does not grow money in no time, and never turns a rate negative', () => {
        const c = compounding(ramp, 0.12, 10);
        expect(c.factor(3, 3)).toBe(1);
        const deep = compounding([{ t: 0, delta: -0.5 }], 0.02, 10);
        expect(deep.factor(0, 5)).toBe(1);
    });

    it('stays finite past the end of the table', () => {
        const c = compounding(ramp, 0.1, 5);
        const f = c.factor(0, 50);
        expect(Number.isFinite(f)).toBe(true);
        expect(f).toBeGreaterThan(c.factor(0, 5) - 1e-9);
    });
});
