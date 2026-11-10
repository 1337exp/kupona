import { describe, expect, it } from 'vitest';
import { defaultInputs, evaluate, type Evaluated } from '@/app/model';
import { niceAxis, series } from '@/app/series';

const run = (): Evaluated => {
    const r = evaluate(defaultInputs());
    if (!r.ok) throw new Error('bad input');
    return r.value;
};

describe('series', () => {
    const e = run();
    const s = series(e, 60);

    it('spans the life of the bond with the points asked for', () => {
        expect(s.t).toHaveLength(61);
        expect(s.t[0]).toBe(0);
        expect(s.t[60]).toBeCloseTo(e.lifeYears, 12);
        for (const line of [s.deposit, s.bond, s.promise]) expect(line).toHaveLength(61);
    });

    it('starts every line at the money put in', () => {
        expect(s.deposit[0]).toBeCloseTo(100_000, 6);
        expect(s.bond[0]).toBeCloseTo(100_000, 6);
        expect(s.promise[0]).toBeCloseTo(100_000, 6);
    });

    it('ends the deposit and the promise where the maths puts them', () => {
        // whole months compound, the tail shorter than a month earns plain interest / целые месяцы капитализируются, хвост короче месяца даёт простой процент
        const months = Math.floor(12 * e.lifeYears);
        const tail = e.lifeYears - months / 12;
        expect(s.deposit[60]).toBeCloseTo(100_000 * (1 + 0.14 / 12) ** months * (1 + 0.14 * tail), 6);
        expect(s.promise[60]).toBeCloseTo(100_000 * (1 + e.quote.ytm!) ** e.lifeYears, 6);
    });

    it('reads the bond line at the horizon as the final value of the bond', () => {
        expect(e.comparison.bond.valueAt(s.horizon)).toBeCloseTo(e.comparison.bond.finalValue, 9);
        expect(s.horizon).toBe(5);
    });

    it('keeps the top of the axis above every line', () => {
        for (const v of [...s.deposit, ...s.bond, ...s.promise]) expect(v).toBeLessThanOrEqual(s.max);
        expect(s.max).toBe(Math.max(...s.deposit, ...s.bond, ...s.promise));
    });
});

describe('niceAxis', () => {
    it('picks a round step and a top that holds the maximum', () => {
        for (const max of [1, 80, 999, 100_000, 200_561, 656_618, 1_234_567, 9_999_999]) {
            const { top, step } = niceAxis(max);
            expect(top, `${max}`).toBeGreaterThanOrEqual(max);
            expect(top % step, `${max}`).toBeCloseTo(0, 6);
            const mantissa = step / 10 ** Math.floor(Math.log10(step));
            expect([1, 2, 5]).toContain(Math.round(mantissa * 1e6) / 1e6);
            expect(top / step, `${max}`).toBeLessThanOrEqual(5);
        }
    });
});
