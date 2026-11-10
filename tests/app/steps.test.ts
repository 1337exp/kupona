import { describe, expect, it } from 'vitest';
import { defaultInputs, evaluate, type Evaluated, type Inputs } from '@/app/model';
import { bondSteps, depositSteps, type Value } from '@/app/steps';

const run = (patch: (i: Inputs) => void = () => {}): Evaluated => {
    const i = defaultInputs();
    patch(i);
    const r = evaluate(i);
    if (!r.ok) throw new Error(`bad input: ${r.problems.join(', ')}`);
    return r.value;
};

const num = (v: Value | undefined): number => {
    if (!v || v.kind === 'cap' || v.kind === 'text') throw new Error('not a number');
    return v.value;
};

describe('depositSteps', () => {
    const e = run();
    const s = depositSteps(e);

    it('says how many times interest was added: 12 a month for 5 years', () => {
        expect(s.accrual.headline.args.map(num)).toEqual([60]);
    });

    it('says the rate, the way interest is added and the effective rate', () => {
        const [rate, how] = s.accrual.lines[0]!.args;
        expect(num(rate)).toBeCloseTo(0.14, 12);
        expect(how).toEqual({ kind: 'cap', value: 'monthly' });
        expect(num(s.accrual.lines[1]!.args[0])).toBeCloseTo(1.14 ** 0 * (1 + 0.14 / 12) ** 12 - 1, 9);
        expect(s.accrual.lines[2]!.args[0]).toEqual({ kind: 'years', value: 5 });
    });

    it('splits the profit into plain interest and interest on interest', () => {
        const extra = num(s.compound.headline.args[0]);
        const simple = num(s.compound.lines[0]!.args[0]);
        const all = num(s.compound.lines[1]!.args[0]);
        expect(simple).toBeCloseTo(100_000 * 0.14 * 5, 6);
        expect(extra).toBeGreaterThan(0);
        expect(extra + simple).toBeCloseTo(all, 6);
    });

    it('ends in the final value of the deposit', () => {
        expect(num(s.depositResult.headline.args[0])).toBeCloseTo(e.comparison.deposit.finalValue, 9);
        expect(num(s.depositResult.lines[0]!.args[0])).toBeCloseTo(e.comparison.deposit.profit, 9);
    });
});

describe('bondSteps', () => {
    it('buys 117 pieces and pays for them', () => {
        const s = bondSteps(run());
        expect(num(s.purchase.headline.args[0])).toBe(117);
        const [spent, change] = s.purchase.lines[1]!.args.map(num);
        expect((spent ?? 0) + (change ?? 0)).toBeCloseTo(100_000, 6);
    });

    it('shows the price as clean + accrued = dirty', () => {
        const [clean, accrued, dirty] = bondSteps(run()).purchase.lines[0]!.args.map(num);
        expect(clean).toBeCloseTo(793.97, 2);
        expect(accrued).toBeCloseTo(54.03, 2);
        expect((clean ?? 0) + (accrued ?? 0)).toBeCloseTo(dirty ?? 0, 9);
    });

    it('says that coupons lie idle, then that they were put to work', () => {
        expect(bondSteps(run()).coupons.lines[2]!.key).toBe('step.coupons.idle');
        const worked = bondSteps(run((i) => (i.scenario.reinvestPercent = 12))).coupons.lines[2]!;
        expect(worked.key).toBe('step.coupons.reinvested');
        expect(num(worked.args[0])).toBeCloseTo(0.12, 12);
        expect(num(worked.args[1])).toBeGreaterThan(0);
    });

    it('counts the coupons received by the horizon: 5 years is 10 payments', () => {
        expect(num(bondSteps(run()).coupons.headline.args[0])).toBe(10);
    });

    it('sells before maturity and is paid off at maturity', () => {
        const sale = bondSteps(run()).exit;
        expect(sale.title).toBe('node.exitSale');
        const maturity = bondSteps(run((i) => (i.scenario.horizonYears = 99))).exit;
        expect(maturity.title).toBe('node.exitMaturity');
        expect(num(maturity.lines[0]!.args[0])).toBe(1000);
    });

    it('ends in the final value and repeats the promise of the yield', () => {
        const e = run();
        const s = bondSteps(e);
        expect(num(s.bondResult.headline.args[0])).toBeCloseTo(e.comparison.bond.finalValue, 9);
        expect(num(s.bondResult.lines[2]!.args[0])).toBeCloseTo(e.quote.ytm!, 12);
    });

    it('every number printed is finite', () => {
        const all = [...Object.values(depositSteps(run())), ...Object.values(bondSteps(run()))];
        for (const step of all) {
            for (const say of [step.headline, ...step.lines]) {
                for (const a of say.args) if (a.kind !== 'cap') expect(Number.isFinite(a.value), `${step.title} ${say.key}`).toBe(true);
            }
        }
    });
});
