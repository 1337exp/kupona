import { describe, expect, it } from 'vitest';
import { CURVE_END, CURVE_SHAPES, MAX_DELTA, curveShape, curveToPath, deltaAt, isValidCurve, sanitizeCurve } from '@/app/curve';
import { defaultInputs, evaluate, sanitizeInputs, type Inputs } from '@/app/model';
import { series } from '@/app/series';
import { bondSteps, depositSteps } from '@/app/steps';
import { shiftAt } from '@/core/rates';

const withInputs = (patch: (i: Inputs) => void): Inputs => {
    const i = defaultInputs();
    patch(i);
    return i;
};
const falling = (i: Inputs) => (i.scenario.curve = curveShape('falling'));
const run = (patch: (i: Inputs) => void = () => {}) => {
    const r = evaluate(withInputs(patch));
    if (!r.ok) throw new Error(`bad input: ${r.problems.join(', ')}`);
    return r.value;
};

describe('ready shapes', () => {
    it('are valid curves that start today with no shift and end where the span ends', () => {
        for (const name of CURVE_SHAPES) {
            const c = curveShape(name);
            expect(isValidCurve(c), name).toBe(true);
            expect(c[0]).toEqual({ t: 0, delta: 0 });
            expect(c[c.length - 1]!.t).toBe(CURVE_END);
        }
    });

    it('fall, stay and rise', () => {
        expect(curveShape('flat').every((p) => p.delta === 0)).toBe(true);
        expect(curveShape('falling').at(-1)!.delta).toBeLessThan(0);
        expect(curveShape('rising').at(-1)!.delta).toBeGreaterThan(0);
    });

    it('can end somewhere else', () => {
        expect(curveShape('falling', 9).at(-1)!.t).toBe(9);
    });
});

describe('isValidCurve', () => {
    const ok = [
        { t: 0, delta: 0 },
        { t: 2, delta: -1 },
    ];

    it('accepts a sane curve', () => {
        expect(isValidCurve(ok)).toBe(true);
    });

    it('refuses what the core could not follow', () => {
        expect(isValidCurve([])).toBe(false);
        expect(isValidCurve([{ t: 0, delta: 0 }])).toBe(false);
        expect(isValidCurve([{ t: 1, delta: 0 }, { t: 2, delta: 0 }])).toBe(false);
        expect(isValidCurve([{ t: 0, delta: 1 }, { t: 2, delta: 0 }])).toBe(false);
        expect(isValidCurve([...ok, { t: 2, delta: 0 }])).toBe(false);
        expect(isValidCurve([...ok, { t: 1, delta: 0 }])).toBe(false);
        expect(isValidCurve([...ok, { t: NaN, delta: 0 }])).toBe(false);
        expect(isValidCurve([...ok, { t: 5, delta: Infinity }])).toBe(false);
        expect(isValidCurve([...ok, { t: 5, delta: MAX_DELTA + 1 }])).toBe(false);
        expect(isValidCurve([...ok, { t: 5, delta: -MAX_DELTA - 1 }])).toBe(false);
        expect(isValidCurve([...ok, { t: 5, delta: MAX_DELTA }])).toBe(true);
    });
});

describe('curveToPath', () => {
    it('turns points into the same points with points of percent as fractions', () => {
        expect(curveToPath(curveShape('falling'))).toEqual([
            { t: 0, delta: 0 },
            { t: 3, delta: -0.06 },
            { t: CURVE_END, delta: -0.06 },
        ]);
    });

    it('cuts a curved transition into short straight pieces that start and end where the points are', () => {
        const path = curveToPath([
            { t: 0, delta: 0, ease: 'quad-in-out' },
            { t: 4, delta: -8 },
        ]);
        expect(path.length).toBeGreaterThan(10);
        expect(path[0]).toEqual({ t: 0, delta: 0 });
        expect(path.at(-1)).toEqual({ t: 4, delta: -0.08 });
        for (let i = 1; i < path.length; i++) {
            expect(path[i]!.t).toBeGreaterThan(path[i - 1]!.t);
            expect(path[i]!.delta).toBeLessThanOrEqual(path[i - 1]!.delta + 1e-12);
        }
    });

    it('a curve that eases slowly at first is above a straight line early on', () => {
        const eased = curveToPath([{ t: 0, delta: 0, ease: 'quad-in' }, { t: 4, delta: -8 }]);
        expect(shiftAt(eased, 1)).toBeGreaterThan(-0.02);
    });

    it('keeps a linear transition as it is', () => {
        const path = curveToPath([{ t: 0, delta: 0, ease: 'linear' }, { t: 4, delta: -8 }]);
        expect(path).toHaveLength(2);
    });
});

describe('sanitizeCurve', () => {
    it('gives the flat curve for anything it cannot use', () => {
        for (const junk of [null, undefined, 5, 'x', {}, [], [1, 2], [{ t: 'a', delta: 1 }], [null], [{ t: 0, delta: 0 }]]) {
            expect(sanitizeCurve(junk), String(junk)).toEqual(curveShape('flat'));
        }
    });

    it('gives the flat curve for a curve that is not valid', () => {
        expect(sanitizeCurve([{ t: 0, delta: 0 }, { t: 0, delta: 1 }])).toEqual(curveShape('flat'));
    });

    it('keeps a good curve with its easing and drops an easing that makes no sense', () => {
        const got = sanitizeCurve([
            { t: 0, delta: 0, ease: 'cubic-out' },
            { t: 3, delta: -2, ease: 'sideways' },
            { t: 9, delta: -2 },
        ]);
        expect(got).toEqual([
            { t: 0, delta: 0, ease: 'cubic-out' },
            { t: 3, delta: -2 },
            { t: 9, delta: -2 },
        ]);
    });
});

describe('deltaAt', () => {
    it('reads the curve in points of percent', () => {
        const c = curveShape('falling');
        expect(deltaAt(c, 0)).toBeCloseTo(0, 12);
        expect(deltaAt(c, 1.5)).toBeCloseTo(-3, 9);
        expect(deltaAt(c, 3)).toBeCloseTo(-6, 9);
        expect(deltaAt(c, 99)).toBeCloseTo(-6, 9);
        expect(deltaAt(curveShape('flat'), 5)).toBeCloseTo(0, 12);
    });
});

describe('the curve in the inputs', () => {
    it('is flat by default, so the old numbers stay', () => {
        const e = run();
        expect(e.comparison.bond.pieces).toBe(117);
        expect(e.comparison.deposit.finalValue).toBeCloseTo(200_561, -1);
    });

    it('moves the deposit: falling rates leave less, rising ones more', () => {
        const flat = run().comparison.deposit.finalValue;
        expect(run(falling).comparison.deposit.finalValue).toBeLessThan(flat);
        expect(run((i) => (i.scenario.curve = curveShape('rising'))).comparison.deposit.finalValue).toBeGreaterThan(flat);
    });

    it('moves with the deposit rate typed in the deposit node: points are against today', () => {
        const a = run((i) => {
            falling(i);
            i.deposit.ratePercent = 20;
        });
        expect(a.scenario.path![1]!.delta).toBeCloseTo(-0.06, 12);
        expect(a.deposit.rate).toBeCloseTo(0.2, 12);
    });

    it('turns the two switches into what the core understands', () => {
        const e = run((i) => {
            i.scenario.reinvestFollows = true;
            i.scenario.reinvestPercent = null;
            i.scenario.marketFollowsCurve = true;
        });
        expect(e.scenario.reinvestRate).toBe('deposit');
        expect(e.scenario.marketYield).toBe('path');
    });

    it('does not ask for a coupon rate when coupons follow the deposits', () => {
        const r = evaluate(withInputs((i) => ((i.scenario.reinvestFollows = true), (i.scenario.reinvestPercent = null))));
        expect(r.ok).toBe(true);
        const bad = evaluate(withInputs((i) => (i.scenario.reinvestPercent = null)));
        expect(!bad.ok && bad.problems).toContain('reinvest');
    });

    it('names a broken curve as a problem', () => {
        const r = evaluate(withInputs((i) => (i.scenario.curve = [{ t: 0, delta: 0 }])));
        expect(!r.ok && r.problems).toContain('curve');
    });

    it('survives the trip through storage', () => {
        const mine = withInputs((i) => {
            falling(i);
            i.scenario.reinvestFollows = true;
            i.scenario.marketFollowsCurve = true;
        });
        expect(sanitizeInputs(JSON.parse(JSON.stringify(mine)))).toEqual(mine);
    });

    it('reads an old save without the curve as a flat one with the switches off', () => {
        const got = sanitizeInputs({ scenario: { amount: 5000, horizonYears: 3, reinvestPercent: 1, marketYieldPercent: null } });
        expect(got.scenario.curve).toEqual(curveShape('flat'));
        expect(got.scenario.reinvestFollows).toBe(false);
        expect(got.scenario.marketFollowsCurve).toBe(false);
    });
});

describe('what the nodes say when rates move', () => {
    it('says the rate moves, with where it ends', () => {
        const s = depositSteps(run(falling));
        expect(s.accrual.lines[0]!.key).toBe('step.accrual.rateMoves');
        const [from, to] = s.accrual.lines[0]!.args;
        expect(from).toEqual({ kind: 'percent', value: 0.14 });
        expect(to?.kind === 'percent' && to.value).toBeCloseTo(0.08, 6);
        expect(depositSteps(run()).accrual.lines[0]!.key).toBe('step.accrual.rate');
    });

    it('does not let the rate end below zero', () => {
        const s = depositSteps(
            run((i) => {
                i.deposit.ratePercent = 2;
                i.scenario.curve = [{ t: 0, delta: 0 }, { t: 1, delta: -9 }];
            }),
        );
        const to = s.accrual.lines[0]!.args[1]!;
        expect(to.kind === 'percent' && to.value).toBe(0);
    });

    it('says coupons went into deposits', () => {
        const s = bondSteps(run((i) => (i.scenario.reinvestFollows = true)));
        expect(s.coupons.lines[2]!.key).toBe('step.coupons.reinvestedDeposit');
    });

    it('draws the deposit line of the chart along the curve', () => {
        const flat = series(run());
        const fall = series(run(falling));
        expect(fall.deposit.at(-1)!).toBeLessThan(flat.deposit.at(-1)!);
        expect(fall.deposit[0]).toBeCloseTo(flat.deposit[0]!, 9);
    });
});
