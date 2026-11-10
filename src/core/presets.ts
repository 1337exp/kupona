/**
 * Ready examples. Numbers are a snapshot, copied from the bond page on smart-lab.ru; `reference` is what that page showed, so
 * the maths can be checked against it.
 * Готовые примеры. Цифры это снимок со страницы облигации на smart-lab.ru; `reference` это то, что показывала страница, чтобы
 * сверять расчёт.
 */
import type { Bond, BondBuy } from './bond';

export interface BondPreset {
    name: string;
    ticker: string;
    bond: Bond;
    buy: BondBuy;
    reference: {
        asOf: string;
        ytm: number;
        accrued: number;
        macaulayDays: number;
        currentYield: number;
        paymentsLeft: number;
    };
}

/** OFZ 26248, fixed coupon 12.25%, twice a year, until 2040-05-16. Settlement T+1 from 2026-11-10. / ОФЗ 26248. */
export const OFZ_26248: BondPreset = {
    name: 'ОФЗ 26248',
    ticker: 'SU26248RMFS3',
    bond: { nominal: 1000, couponRub: 61.08, periodDays: 182, maturity: '2040-05-16' },
    buy: { date: '2026-11-11', cleanPricePercent: 79.397 },
    reference: { asOf: '2026-11-10', ytm: 0.1666, accrued: 54.03, macaulayDays: 2117, currentYield: 0.1543, paymentsLeft: 28 },
};
