import { describe, expect, it } from 'vitest';
import { bondQuote } from '@/core/bond';
import { type Scenario, compare, simulateBond } from '@/core/compare';
import { type Deposit, depositNet, depositValue, simulateDeposit } from '@/core/deposit';
import { OFZ_26248 as OFZ } from '@/core/presets';
import { afterTax, taxOn } from '@/core/tax';

const AMOUNT = 100_000;
const dirty = bondQuote(OFZ.bond, OFZ.buy).dirtyPrice;
const dep = (patch: Partial<Deposit> = {}): Deposit => ({ amount: 1000, rate: 0.12, capitalization: 'monthly', termMonths: 12, ...patch });
const scenario = (patch: Partial<Scenario> = {}): Scenario => ({ horizonYears: 3, reinvestRate: 0, marketYield: null, ...patch });
const bond = (s: Partial<Scenario>, options: Parameters<typeof simulateBond>[4] = {}) => simulateBond(OFZ.bond, OFZ.buy, AMOUNT, scenario(s), options);

describe('tax on profit', () => {
    it('takes a share of what was earned', () => {
        expect(taxOn(1200, 1000, 0.13)).toBeCloseTo(26, 12);
        expect(afterTax(1200, 1000, 0.13)).toBeCloseTo(1174, 12);
    });

    it('takes nothing when there is no profit, and gives nothing back for a loss', () => {
        expect(taxOn(1000, 1000, 0.13)).toBe(0);
        expect(taxOn(800, 1000, 0.13)).toBe(0);
        expect(afterTax(800, 1000, 0.13)).toBe(800);
    });

    it('takes nothing at a zero rate', () => {
        expect(taxOn(5000, 1000, 0)).toBe(0);
    });
});

describe('the deposit and its tax', () => {
    it('keeps the interest whole when there is no tax', () => {
        expect(depositNet(dep(), 1)).toBeCloseTo(depositValue(dep(), 1), 12);
        expect(depositNet(dep({ taxRate: 0 }), 1)).toBeCloseTo(depositValue(dep(), 1), 12);
        expect(simulateDeposit(dep(), 1).tax).toBe(0);
    });

    it('takes the share of the interest: 13% of 126.83 on 1000', () => {
        const gross = 1000 * 1.01 ** 12;
        const net = depositNet(dep({ taxRate: 0.13 }), 1);
        expect(net).toBeCloseTo(gross - 0.13 * (gross - 1000), 9);
        const run = simulateDeposit(dep({ taxRate: 0.13 }), 1);
        expect(run.finalValue).toBeCloseTo(net, 12);
        expect(run.tax).toBeCloseTo(0.13 * (gross - 1000), 9);
    });

    it('shows the profit after the tax, and the plain and compound parts before it', () => {
        const run = simulateDeposit(dep({ taxRate: 0.2 }), 3);
        expect(run.profit).toBeCloseTo(run.simpleProfit + run.compoundExtra - run.tax, 9);
        expect(run.profit).toBeCloseTo(run.finalValue - 1000, 12);
        expect(run.cagr).toBeLessThan(simulateDeposit(dep(), 3).cagr);
    });

    it('leaves less the higher the tax', () => {
        expect(depositNet(dep({ taxRate: 0.3 }), 2)).toBeLessThan(depositNet(dep({ taxRate: 0.1 }), 2));
    });
});

describe('the commission of the bond', () => {
    const c = 0.001;

    it('is paid on top of the price: fewer pieces, and the sum spent includes it', () => {
        const r = bond({}, { commission: c });
        expect(r.pieces).toBe(Math.floor(AMOUNT / (dirty * (1 + c))));
        expect(r.pieces).toBeLessThanOrEqual(bond({}).pieces);
        expect(r.spent).toBeCloseTo(r.pieces * dirty * (1 + c), 9);
        expect(r.buyCommission).toBeCloseTo(r.pieces * dirty * c, 9);
        expect(r.spent + r.leftover).toBeCloseTo(AMOUNT, 9);
    });

    it('is taken again from the sale before maturity', () => {
        const free = bond({ horizonYears: 3 }, { wholePieces: false });
        const paid = bond({ horizonYears: 3 }, { wholePieces: false, commission: c });
        const sold = paid.sellCommission / c;
        expect(paid.exitValue).toBeCloseTo(sold * (1 - c), 9);
        expect(paid.sellCommission).toBeGreaterThan(0);
        expect(paid.finalValue).toBeLessThan(free.finalValue);
    });

    it('is not taken at maturity: the bond is paid off', () => {
        const r = bond({ horizonYears: 99 }, { commission: c });
        expect(r.sellCommission).toBe(0);
        expect(r.exitValue).toBeCloseTo(r.pieces * 1000, 9);
    });

    it('shows in the value of the portfolio from the first day: it is worth a little less than was put in', () => {
        const r = bond({}, { commission: c, wholePieces: false });
        expect(r.valueAt(0)).toBeCloseTo(AMOUNT - r.buyCommission - c * r.pieces * dirty, 6);
        expect(r.valueAt(0)).toBeLessThan(AMOUNT);
    });

    it('costs more the higher it is, and nothing at zero', () => {
        const finals = [0, 0.0005, 0.002, 0.01].map((commission) => bond({}, { commission }).finalValue);
        for (let i = 1; i < finals.length; i++) expect(finals[i]!).toBeLessThan(finals[i - 1]!);
        expect(bond({}, { commission: 0 }).finalValue).toBeCloseTo(bond({}).finalValue, 12);
    });
});

describe('the tax of the bond', () => {
    it('takes the share of the whole profit: coupons, what they earned and the price', () => {
        const free = bond({ horizonYears: 99, reinvestRate: 0.1 }, { wholePieces: false });
        const taxed = bond({ horizonYears: 99, reinvestRate: 0.1 }, { wholePieces: false, taxRate: 0.13 });
        expect(taxed.taxPaid).toBeCloseTo(0.13 * (free.finalValue - AMOUNT), 6);
        expect(taxed.finalValue).toBeCloseTo(free.finalValue - taxed.taxPaid, 9);
    });

    it('takes nothing from a loss', () => {
        const r = bond({ horizonYears: 0.1, marketYield: 0.6 }, { taxRate: 0.13 });
        expect(r.finalValue).toBeLessThan(AMOUNT);
        expect(r.taxPaid).toBe(0);
    });

    it('takes nothing at a zero rate and when it is not given', () => {
        expect(bond({}, { taxRate: 0 }).finalValue).toBeCloseTo(bond({}).finalValue, 12);
        expect(bond({}).taxPaid).toBe(0);
    });

    it('applies on the way too: the value at a moment is after the tax', () => {
        const taxed = bond({ horizonYears: 99, reinvestRate: 0.1 }, { taxRate: 0.13 });
        const free = bond({ horizonYears: 99, reinvestRate: 0.1 });
        expect(taxed.valueAt(6)).toBeLessThan(free.valueAt(6));
        expect(taxed.valueAt(6)).toBeCloseTo(AMOUNT + (free.valueAt(6) - AMOUNT) * 0.87, 6);
    });
});

describe('the parts add up with costs', () => {
    it('final = coupons + reinvestment + exit + change - tax, for any commission, tax, horizon and reinvestment', () => {
        for (const commission of [0, 0.002]) {
            for (const taxRate of [0, 0.13]) {
                for (const horizonYears of [0.7, 3, 99]) {
                    for (const reinvestRate of [0, 0.12]) {
                        const r = bond({ horizonYears, reinvestRate }, { commission, taxRate });
                        const parts = r.couponsSum + r.reinvestGain + r.exitValue + r.leftover - r.taxPaid;
                        expect(parts, `${commission} ${taxRate} ${horizonYears} ${reinvestRate}`).toBeCloseTo(r.finalValue, 6);
                        expect(r.profit).toBeCloseTo(r.finalValue - AMOUNT, 9);
                    }
                }
            }
        }
    });
});

describe('the comparison with costs', () => {
    const go = (d: Partial<Deposit>, options: Parameters<typeof compare>[4] = {}) =>
        compare({ ...dep({ amount: AMOUNT, rate: 0.14 }), ...d }, OFZ.bond, OFZ.buy, scenario({ horizonYears: 99, reinvestRate: 0.1 }), options);

    it('taxes the two sides on their own: the deposit tax-free, the bond at 13% is behind', () => {
        const none = go({});
        const bondOnly = go({}, { taxRate: 0.13 });
        expect(bondOnly.deposit.finalValue).toBeCloseTo(none.deposit.finalValue, 9);
        expect(bondOnly.bond.finalValue).toBeLessThan(none.bond.finalValue);
        expect(bondOnly.difference).toBeLessThan(none.difference);
    });

    it('taxes the deposit when asked', () => {
        const taxed = go({ taxRate: 0.13 });
        expect(taxed.deposit.finalValue).toBeLessThan(go({}).deposit.finalValue);
        expect(taxed.deposit.tax).toBeGreaterThan(0);
    });

    it('finds the tie rate against the deposit after its tax', () => {
        const c = go({ taxRate: 0.13 }, { taxRate: 0.13, commission: 0.001 });
        expect(c.breakEvenRate).not.toBeNull();
        const tied = depositNet({ ...dep({ amount: AMOUNT, rate: c.breakEvenRate!, taxRate: 0.13 }) }, c.bond.horizon);
        expect(tied / c.bond.finalValue).toBeCloseTo(1, 9);
    });

    it('passes the commission and tax to the bond', () => {
        const c = go({}, { commission: 0.002, taxRate: 0.13 });
        expect(c.bond.buyCommission).toBeGreaterThan(0);
        expect(c.bond.taxPaid).toBeGreaterThan(0);
    });
});
