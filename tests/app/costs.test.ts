import { describe, expect, it } from 'vitest';
import { defaultInputs, evaluate, sanitizeInputs, type Evaluated, type Inputs } from '@/app/model';
import { series } from '@/app/series';
import { bondSteps, depositSteps, type Value } from '@/app/steps';
import { depositNet } from '@/core/deposit';

const make = (patch: (i: Inputs) => void): Inputs => {
    const i = defaultInputs();
    patch(i);
    return i;
};
const run = (patch: (i: Inputs) => void = () => {}): Evaluated => {
    const r = evaluate(make(patch));
    if (!r.ok) throw new Error(`bad input: ${r.problems.join(', ')}`);
    return r.value;
};
const money = (v: Value | undefined): number => (v?.kind === 'money' ? v.value : NaN);
const taxed = (i: Inputs) => {
    i.deposit.taxPercent = 13;
    i.bond.taxPercent = 13;
};
const costly = (i: Inputs) => {
    i.bond.commissionPercent = 0.3;
    i.scenario.horizonYears = 3;
};

describe('costs in the inputs', () => {
    it('are zero by default, so the old numbers stay', () => {
        const e = run();
        expect(e.comparison.bond.pieces).toBe(117);
        expect(e.comparison.bond.taxPaid).toBe(0);
        expect(e.comparison.bond.buyCommission).toBe(0);
        expect(e.comparison.deposit.tax).toBe(0);
    });

    it('turn percent into fractions for the core', () => {
        const e = run((i) => {
            taxed(i);
            i.bond.commissionPercent = 0.25;
        });
        expect(e.deposit.taxRate).toBeCloseTo(0.13, 12);
        expect(e.comparison.bond.buyCommission).toBeCloseTo(e.comparison.bond.pieces * e.comparison.bond.dirtyPrice * 0.0025, 9);
        expect(e.comparison.bond.taxPaid).toBeGreaterThan(0);
        expect(e.comparison.deposit.tax).toBeGreaterThan(0);
    });

    it('take exactly the percent typed from the profit of the bond', () => {
        const r = run((i) => (i.bond.taxPercent = 13)).comparison.bond;
        expect(r.taxPaid / (r.profit + r.taxPaid)).toBeCloseTo(0.13, 9);
    });

    it('tax each side on its own', () => {
        const onlyBond = run((i) => (i.bond.taxPercent = 13));
        expect(onlyBond.comparison.deposit.tax).toBe(0);
        expect(onlyBond.comparison.bond.taxPaid).toBeGreaterThan(0);
        const onlyDeposit = run((i) => (i.deposit.taxPercent = 13));
        expect(onlyDeposit.comparison.bond.taxPaid).toBe(0);
        expect(onlyDeposit.comparison.deposit.tax).toBeGreaterThan(0);
    });

    it('name an empty or absurd field as a problem', () => {
        const problems = (patch: (i: Inputs) => void) => {
            const r = evaluate(make(patch));
            return r.ok ? [] : r.problems;
        };
        expect(problems((i) => (i.deposit.taxPercent = null))).toContain('tax');
        expect(problems((i) => (i.bond.taxPercent = null))).toContain('tax');
        expect(problems((i) => (i.bond.taxPercent = -1))).toContain('tax');
        expect(problems((i) => (i.bond.taxPercent = 101))).toContain('tax');
        expect(problems((i) => (i.bond.commissionPercent = null))).toContain('commission');
        expect(problems((i) => (i.bond.commissionPercent = -0.1))).toContain('commission');
        expect(problems((i) => (i.bond.commissionPercent = 51))).toContain('commission');
        expect(problems((i) => (i.bond.taxPercent = 100))).toEqual([]);
        expect(problems((i) => (i.bond.commissionPercent = 50))).toEqual([]);
    });

    it('survive the trip through storage, and an old save reads them as zero', () => {
        const mine = make((i) => {
            taxed(i);
            i.bond.commissionPercent = 0.3;
        });
        expect(sanitizeInputs(JSON.parse(JSON.stringify(mine)))).toEqual(mine);
        const old = sanitizeInputs({ deposit: { ratePercent: 9 }, bond: { nominal: 1000 } });
        expect(old.deposit.taxPercent).toBe(0);
        expect(old.bond.taxPercent).toBe(0);
        expect(old.bond.commissionPercent).toBe(0);
    });
});

describe('what the nodes say about costs', () => {
    it('say nothing about them when there are none', () => {
        const d = depositSteps(run());
        const b = bondSteps(run());
        expect(d.compound.lines[2]!.key).toBe('step.compound.hint');
        expect(d.depositResult.lines).toHaveLength(2);
        expect(b.purchase.lines).toHaveLength(3);
        expect(b.bondResult.lines[0]!.key).toBe('step.bondResult.profit');
    });

    it('name the tax of the deposit: profit before it in the compound node, the tax itself, and the result after it', () => {
        const e = run(taxed);
        const d = depositSteps(e);
        const run1 = e.comparison.deposit;
        expect(d.compound.lines[2]!.key).toBe('step.compound.tax');
        expect(money(d.compound.lines[2]!.args[0])).toBeCloseTo(run1.tax, 9);
        expect(money(d.compound.lines[1]!.args[0])).toBeCloseTo(run1.profit + run1.tax, 9);
        expect(d.depositResult.lines[2]!.key).toBe('step.depositResult.tax');
        expect(money(d.depositResult.lines[0]!.args[0])).toBeCloseTo(run1.profit, 9);
    });

    it('name the commission of the purchase and of the sale', () => {
        const e = run(costly);
        const b = bondSteps(e);
        const r = e.comparison.bond;
        expect(b.purchase.lines[3]!.key).toBe('step.purchase.commission');
        expect(money(b.purchase.lines[3]!.args[0])).toBeCloseTo(r.buyCommission, 9);
        expect(b.exit.lines[2]!.key).toBe('step.exitSale.commission');
        expect(money(b.exit.lines[2]!.args[0])).toBeCloseTo(r.sellCommission, 9);
    });

    it('show the price of a bond at the sale before the commission', () => {
        const e = run(costly);
        const r = e.comparison.bond;
        const price = money(bondSteps(e).exit.lines[1]!.args[0]);
        expect(price * r.pieces).toBeCloseTo(r.exitValue + r.sellCommission, 6);
        const free = run((i) => (i.scenario.horizonYears = 3));
        expect(price).toBeCloseTo(money(bondSteps(free).exit.lines[1]!.args[0]), 9);
    });

    it('have no sale commission to name at maturity', () => {
        const e = run((i) => {
            costly(i);
            i.scenario.horizonYears = 99;
        });
        expect(bondSteps(e).exit.title).toBe('node.exitMaturity');
        expect(bondSteps(e).exit.lines.every((l) => l.key !== 'step.exitSale.commission')).toBe(true);
    });

    it('name the profit of the bond after the tax and the tax taken off', () => {
        const e = run(taxed);
        const line = bondSteps(e).bondResult.lines[0]!;
        expect(line.key).toBe('step.bondResult.profitTax');
        expect(money(line.args[0])).toBeCloseTo(e.comparison.bond.profit, 9);
        expect(money(line.args[1])).toBeCloseTo(e.comparison.bond.taxPaid, 9);
    });

    it('draw the deposit line of the chart after the tax', () => {
        const e = run(taxed);
        const s = series(e);
        expect(s.deposit.at(-1)!).toBeCloseTo(depositNet(e.deposit, e.lifeYears, e.scenario.path), 6);
        expect(s.deposit.at(-1)!).toBeLessThan(series(run()).deposit.at(-1)!);
    });
});
