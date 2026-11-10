import { describe, expect, it } from 'vitest';
import { bondQuote } from '@/core/bond';
import { type Scenario, compare, simulateBond } from '@/core/compare';
import { type Deposit, depositValue } from '@/core/deposit';
import { OFZ_26248 as OFZ } from '@/core/presets';

const ytm = bondQuote(OFZ.bond, OFZ.buy).ytm!;
const AMOUNT = 100_000;
const deposit = (patch: Partial<Deposit> = {}): Deposit => ({ amount: AMOUNT, rate: 0.14, capitalization: 'monthly', termMonths: 12, ...patch });

const FALL = [
    { t: 0, delta: 0 },
    { t: 3, delta: -0.06 },
    { t: 30, delta: -0.06 },
];
const RISE = FALL.map((p) => ({ ...p, delta: -p.delta }));
const FLAT = [
    { t: 0, delta: 0 },
    { t: 30, delta: 0 },
];

const go = (s: Partial<Scenario>) => compare(deposit(), OFZ.bond, OFZ.buy, { horizonYears: 99, reinvestRate: 0, marketYield: null, ...s });

describe('coupons put into deposits', () => {
    it('earn the deposit rate when nothing moves', () => {
        const viaDeposit = go({ reinvestRate: 'deposit', path: FLAT }).bond;
        const fixed = go({ reinvestRate: 0.14 }).bond;
        expect(viaDeposit.finalValue / fixed.finalValue).toBeCloseTo(1, 9);
        expect(viaDeposit.reinvestGain / fixed.reinvestGain).toBeCloseTo(1, 9);
    });

    it('need the deposit rate to be known', () => {
        const s: Scenario = { horizonYears: 5, reinvestRate: 'deposit', marketYield: null };
        expect(() => simulateBond(OFZ.bond, OFZ.buy, AMOUNT, s)).toThrow(RangeError);
        expect(simulateBond(OFZ.bond, OFZ.buy, AMOUNT, s, { depositRate: 0.14 }).finalValue).toBeGreaterThan(0);
    });

    it('earn less when rates fall and more when they rise', () => {
        const flat = go({ reinvestRate: 'deposit', path: FLAT }).bond.finalValue;
        expect(go({ reinvestRate: 'deposit', path: FALL }).bond.finalValue).toBeLessThan(flat);
        expect(go({ reinvestRate: 'deposit', path: RISE }).bond.finalValue).toBeGreaterThan(flat);
    });

    it('a fixed reinvestment rate does not care where rates go', () => {
        expect(go({ reinvestRate: 0.1, path: FALL }).bond.finalValue).toBeCloseTo(go({ reinvestRate: 0.1 }).bond.finalValue, 9);
    });
});

describe('the market yield on the path', () => {
    it('is the same as no move when nothing moves', () => {
        const a = go({ horizonYears: 4, marketYield: 'path', path: FLAT }).bond;
        const b = go({ horizonYears: 4, marketYield: null }).bond;
        expect(a.finalValue / b.finalValue).toBeCloseTo(1, 12);
        expect(a.marketYield).toBeCloseTo(ytm, 12);
    });

    it('is the yield we bought at plus the shift of the day', () => {
        expect(go({ horizonYears: 3, marketYield: 'path', path: FALL }).bond.marketYield).toBeCloseTo(ytm - 0.06, 12);
        expect(go({ horizonYears: 1.5, marketYield: 'path', path: FALL }).bond.marketYield).toBeCloseTo(ytm - 0.03, 12);
    });

    it('is the same as a fixed yield when the shift is constant', () => {
        const onPath = go({ horizonYears: 2, marketYield: 'path', path: [{ t: 0, delta: -0.03 }] }).bond;
        const fixed = go({ horizonYears: 2, marketYield: ytm - 0.03 }).bond;
        expect(onPath.finalValue / fixed.finalValue).toBeCloseTo(1, 12);
    });

    it('sells higher when rates fall along the way and lower when they rise', () => {
        const down = go({ horizonYears: 3, marketYield: 'path', path: FALL }).bond.exitValue;
        const same = go({ horizonYears: 3, marketYield: 'path', path: FLAT }).bond.exitValue;
        const up = go({ horizonYears: 3, marketYield: 'path', path: RISE }).bond.exitValue;
        expect(down).toBeGreaterThan(same);
        expect(same).toBeGreaterThan(up);
    });

    it('never lets the yield go negative', () => {
        expect(go({ horizonYears: 1, marketYield: 'path', path: [{ t: 0, delta: -0.9 }] }).bond.marketYield).toBe(0);
    });
});

describe('the comparison when rates move', () => {
    it('moves the deposit too: it ends lower when rates fall, higher when they rise', () => {
        const flat = go({ path: FLAT }).deposit.finalValue;
        expect(go({ path: FALL }).deposit.finalValue).toBeLessThan(flat);
        expect(go({ path: RISE }).deposit.finalValue).toBeGreaterThan(flat);
    });

    it('falling rates favour the bond: it locked its coupons in', () => {
        const s = { reinvestRate: 'deposit' as const, marketYield: 'path' as const, horizonYears: 6 };
        expect(go({ ...s, path: FALL }).difference).toBeGreaterThan(go({ ...s, path: FLAT }).difference);
    });

    it('finds the tie rate with the deposit following the path', () => {
        const c = go({ reinvestRate: 'deposit', marketYield: 'path', horizonYears: 6, path: FALL });
        expect(c.breakEvenRate).not.toBeNull();
        const tied = depositValue(deposit({ rate: c.breakEvenRate! }), c.bond.horizon, FALL);
        expect(tied / c.bond.finalValue).toBeCloseTo(1, 9);
    });

    it('parts still add up with every kind of move', () => {
        for (const path of [FLAT, FALL, RISE]) {
            for (const horizonYears of [0.7, 3, 99]) {
                const r = go({ reinvestRate: 'deposit', marketYield: 'path', horizonYears, path }).bond;
                expect(r.couponsSum + r.reinvestGain + r.exitValue + r.leftover).toBeCloseTo(r.finalValue, 6);
            }
        }
    });

    it('starts at the money put in, even when rates move', () => {
        const r = go({ reinvestRate: 'deposit', marketYield: 'path', path: FALL }).bond;
        expect(r.valueAt(0)).toBeCloseTo(AMOUNT, 6);
    });
});
