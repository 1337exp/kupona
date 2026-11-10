import { describe, expect, it } from 'vitest';
import { formatValue } from '@/app/format';
import { CURRENCIES, defaultInputs, evaluate, sanitizeInputs, type Evaluated, type Inputs } from '@/app/model';
import { series } from '@/app/series';
import { bondSteps, depositSteps, type Value } from '@/app/steps';
import { depositNet } from '@/core/deposit';
import { exchangeAt } from '@/core/currency';

const make = (patch: (i: Inputs) => void): Inputs => {
    const i = defaultInputs();
    patch(i);
    return i;
};
const dollars = (i: Inputs) => {
    i.deposit.currency = 'USD';
    i.deposit.ratePercent = 3;
    i.deposit.fxRate = 100;
    i.deposit.fxChangePercent = 10;
};
const run = (patch: (i: Inputs) => void = () => {}): Evaluated => {
    const r = evaluate(make(patch));
    if (!r.ok) throw new Error(`bad input: ${r.problems.join(', ')}`);
    return r.value;
};
const problems = (patch: (i: Inputs) => void) => {
    const r = evaluate(make(patch));
    return r.ok ? [] : r.problems;
};
const num = (v: Value | undefined): number => (v?.kind === 'money' || v?.kind === 'number' ? v.value : NaN);

describe('the currency of the deposit in the inputs', () => {
    it('is the rouble by default, with no exchange in the core', () => {
        const e = run();
        expect(e.currency).toBe('RUB');
        expect(e.deposit.exchange).toBeUndefined();
        expect(e.comparison.deposit.fxGain).toBe(0);
        expect(CURRENCIES).toEqual(['RUB', 'USD', 'EUR', 'CNY']);
    });

    it('gives the core the rate and its change as a fraction', () => {
        const e = run(dollars);
        expect(e.currency).toBe('USD');
        expect(e.deposit.exchange).toEqual({ rate0: 100, yearlyChange: 0.1 });
        expect(e.deposit.rate).toBeCloseTo(0.03, 12);
    });

    it('ends in roubles at the rate of the day', () => {
        const e = run((i) => {
            dollars(i);
            i.scenario.horizonYears = 2;
        });
        // 1000 dollars, 3% added monthly for 2 years, at 121
        expect(e.comparison.deposit.finalValue).toBeCloseTo(1000 * 1.0025 ** 24 * 121, 3);
        expect(e.comparison.deposit.fxGain).toBeGreaterThan(0);
    });

    it('asks for the rate and its change only for a foreign currency', () => {
        expect(problems((i) => (i.deposit.fxRate = null))).toEqual([]);
        expect(problems((i) => ((i.deposit.currency = 'EUR'), (i.deposit.fxRate = null)))).toContain('fx');
        expect(problems((i) => ((i.deposit.currency = 'EUR'), (i.deposit.fxRate = 0)))).toContain('fx');
        expect(problems((i) => ((i.deposit.currency = 'CNY'), (i.deposit.fxChangePercent = null)))).toContain('fxChange');
        expect(problems((i) => ((i.deposit.currency = 'CNY'), (i.deposit.fxChangePercent = -100)))).toContain('fxChange');
        expect(problems((i) => ((i.deposit.currency = 'CNY'), (i.deposit.fxChangePercent = -50)))).toEqual([]);
    });

    it('ignores coupons into deposits and the market on the curve beside a foreign deposit', () => {
        const e = run((i) => {
            dollars(i);
            i.scenario.reinvestFollows = true;
            i.scenario.marketFollowsCurve = true;
            i.scenario.reinvestPercent = 5;
        });
        expect(e.scenario.reinvestRate).toBeCloseTo(0.05, 12);
        expect(e.scenario.marketYield).toBeNull();
        const rub = run((i) => {
            i.scenario.reinvestFollows = true;
            i.scenario.marketFollowsCurve = true;
        });
        expect(rub.scenario.reinvestRate).toBe('deposit');
        expect(rub.scenario.marketYield).toBe('path');
    });

    it('asks for a coupon rate when coupons cannot follow the deposit', () => {
        expect(
            problems((i) => {
                dollars(i);
                i.scenario.reinvestFollows = true;
                i.scenario.reinvestPercent = null;
            }),
        ).toContain('reinvest');
    });

    it('survives the trip through storage; an old save is a rouble deposit; a strange currency becomes the rouble', () => {
        const mine = make((i) => {
            dollars(i);
            i.deposit.fxRate = 92.5;
            i.deposit.fxChangePercent = -3;
        });
        expect(sanitizeInputs(JSON.parse(JSON.stringify(mine)))).toEqual(mine);
        const old = sanitizeInputs({ deposit: { ratePercent: 9 } });
        expect(old.deposit.currency).toBe('RUB');
        expect(old.deposit.fxRate).toBe(100);
        expect(sanitizeInputs({ deposit: { currency: 'GBP' } }).deposit.currency).toBe('RUB');
    });
});

describe('what the nodes say about the currency', () => {
    const e = () => run(dollars);

    it('say what the roubles became and at what rate, instead of the holding time', () => {
        const lines = depositSteps(e()).accrual.lines;
        expect(lines[2]!.key).toBe('step.accrual.fx');
        const [roubles, units, code, rate] = lines[2]!.args;
        expect(num(roubles)).toBe(100_000);
        expect(num(units)).toBeCloseTo(1000, 9);
        expect(code).toEqual({ kind: 'text', value: 'USD' });
        expect(num(rate)).toBe(100);
        expect(depositSteps(run()).accrual.lines[2]!.key).toBe('step.accrual.held');
    });

    it('say where the rate went and what that gave', () => {
        const ev = e();
        const lines = depositSteps(ev).depositResult.lines;
        const fx = lines[lines.length - 1]!;
        expect(fx.key).toBe('step.depositResult.fx');
        expect(num(fx.args[0])).toBe(100);
        expect(num(fx.args[1])).toBeCloseTo(exchangeAt(ev.deposit.exchange!, ev.comparison.deposit.horizon), 9);
        expect(num(fx.args[2])).toBeCloseTo(ev.comparison.deposit.fxGain, 9);
        expect(depositSteps(run()).depositResult.lines).toHaveLength(2);
    });

    it('count the interest alone as the profit of the deposit, not the exchange', () => {
        const ev = e();
        const run1 = ev.comparison.deposit;
        const line = depositSteps(ev).compound.lines[1]!;
        expect(num(line.args[0])).toBeCloseTo(run1.simpleProfit + run1.compoundExtra, 9);
        expect(num(line.args[0])).not.toBeCloseTo(run1.profit, 0);
    });

    it('leave the bond nodes as they were', () => {
        expect(bondSteps(e()).purchase.lines).toHaveLength(3);
    });

    it('format numbers and text', () => {
        const t = (k: string) => k;
        expect(formatValue({ kind: 'number', value: 1000, digits: 2 }, 'en', t)).toBe('1,000.00');
        expect(formatValue({ kind: 'number', value: 92.4 }, 'en', t)).toBe('92.40');
        expect(formatValue({ kind: 'text', value: 'USD' }, 'ru', t)).toBe('USD');
    });

    it('draw the deposit line of the chart in roubles at the rate of each day', () => {
        const ev = e();
        const s = series(ev);
        expect(s.deposit[0]).toBeCloseTo(100_000, 6);
        expect(s.deposit.at(-1)!).toBeCloseTo(depositNet(ev.deposit, ev.lifeYears, ev.scenario.path), 6);
    });
});
