/**
 * What the person types (percent, empty fields allowed) and how it becomes what the core wants (fractions, no gaps).
 * Что вводит человек (проценты, пустые поля допустимы) и как это становится тем, что нужно ядру (доли, без пропусков).
 */
import { type Bond, type BondBuy, type BondProblem, type BondQuote, bondProblems, bondQuote, couponSchedule, periodDaysFromFrequency } from '@/core/bond';
import { type Comparison, type Scenario, compare } from '@/core/compare';
import { parseDate } from '@/core/dates';
import { CAPITALIZATIONS, type Capitalization, type Deposit } from '@/core/deposit';
import { OFZ_26248 } from '@/core/presets';
import { type CurvePoint, curveShape, curveToPath, isValidCurve, sanitizeCurve } from './curve';

/** Currencies of the deposit; the bond is always in roubles. / Валюты вклада; облигация всегда в рублях. */
export type Currency = 'RUB' | 'USD' | 'EUR' | 'CNY';
export const CURRENCIES: readonly Currency[] = ['RUB', 'USD', 'EUR', 'CNY'];

export interface Inputs {
    deposit: {
        ratePercent: number | null;
        capitalization: Capitalization;
        termMonths: number | null;
        taxPercent: number | null;
        currency: Currency;
        /** Roubles for one unit of the currency on the day of the purchase (ignored for roubles). / Рублей за единицу валюты в день покупки. */
        fxRate: number | null;
        /** How much the rate changes in a year, percent. / Насколько меняется курс за год, процент. */
        fxChangePercent: number | null;
    };
    bond: {
        nominal: number | null;
        cleanPricePercent: number | null;
        couponRub: number | null;
        paymentsPerYear: number;
        buyDate: string | null;
        maturity: string | null;
        /** Broker commission on each trade, percent of the sum. / Комиссия брокера с каждой сделки, процент от суммы. */
        commissionPercent: number | null;
        /** Tax on the profit of the bond, percent. / Налог на прибыль по облигации, процент. */
        taxPercent: number | null;
    };
    scenario: {
        amount: number | null;
        horizonYears: number;
        reinvestPercent: number | null;
        /** `null`: the market does not move, the yield stays what it was at the purchase. / `null`: рынок не меняется. */
        marketYieldPercent: number | null;
        /** Coupons go into deposits and earn what deposits pay on the day (follow the curve). / Купоны идут во вклады и зарабатывают ставку вклада того дня. */
        reinvestFollows: boolean;
        /** The yield of the bond moves with the curve. / Доходность облигации двигается вместе с кривой. */
        marketFollowsCurve: boolean;
        /** How the deposit rate moves over the years. / Как ставка вклада меняется по годам. */
        curve: CurvePoint[];
    };
}

export type Problem = BondProblem | 'amount' | 'rate' | 'term' | 'reinvest' | 'marketYield' | 'horizon' | 'curve' | 'tax' | 'commission' | 'fx' | 'fxChange';

/** The OFZ 26248 example: a bond, a typical deposit, five years held. / Пример: ОФЗ 26248, обычный вклад, держим пять лет. */
export function defaultInputs(): Inputs {
    const { bond, buy } = OFZ_26248;
    return {
        deposit: { ratePercent: 14, capitalization: 'monthly', termMonths: 12, taxPercent: 0, currency: 'RUB', fxRate: 100, fxChangePercent: 0 },
        bond: {
            nominal: bond.nominal,
            cleanPricePercent: buy.cleanPricePercent,
            couponRub: bond.couponRub,
            paymentsPerYear: 2,
            buyDate: buy.date,
            maturity: bond.maturity,
            commissionPercent: 0,
            taxPercent: 0,
        },
        scenario: { amount: 100_000, horizonYears: 5, reinvestPercent: 0, marketYieldPercent: null, reinvestFollows: false, marketFollowsCurve: false, curve: curveShape('flat') },
    };
}

export interface Evaluated {
    bond: Bond;
    buy: BondBuy;
    deposit: Deposit;
    currency: Currency;
    scenario: Scenario;
    quote: BondQuote;
    comparison: Comparison;
    /** Years from the purchase to maturity. / Лет от покупки до погашения. */
    lifeYears: number;
}

export type Evaluation = { ok: true; value: Evaluated } | { ok: false; problems: Problem[] };

const num = (v: number | null): number => (v === null ? NaN : v);

/** Years from the purchase to maturity, or `null` if the dates do not make sense. / Лет до погашения или `null`. */
export function lifeYears(inputs: Inputs): number | null {
    const { buyDate, maturity, paymentsPerYear } = inputs.bond;
    if (!buyDate || !maturity || !Number.isInteger(paymentsPerYear) || paymentsPerYear < 1) return null;
    try {
        const schedule = couponSchedule({ nominal: 1, couponRub: 0, periodDays: periodDaysFromFrequency(paymentsPerYear), maturity }, parseDate(buyDate));
        return schedule[schedule.length - 1]!.t;
    } catch {
        return null;
    }
}

/** Everything on the screen comes from here: the inputs, checked, then run through the core. / Всё на экране берётся отсюда. */
export function evaluate(inputs: Inputs): Evaluation {
    const problems: Problem[] = [];
    const { deposit: d, bond: b, scenario: s } = inputs;

    const bond: Bond = {
        nominal: num(b.nominal),
        couponRub: num(b.couponRub),
        periodDays: periodDaysFromFrequency(b.paymentsPerYear),
        maturity: b.maturity ?? '',
    };
    const buy: BondBuy = { date: b.buyDate ?? '', cleanPricePercent: num(b.cleanPricePercent) };
    problems.push(...bondProblems(bond, buy));

    const foreign = d.currency !== 'RUB';
    if (foreign && !(num(d.fxRate) > 0)) problems.push('fx');
    if (foreign && !(num(d.fxChangePercent) > -100)) problems.push('fxChange');
    // Coupons into deposits and the market on the curve tie the bond to the rouble deposit rate: they make no sense beside a foreign one.
    // Купоны во вклады и рынок по кривой привязывают облигацию к ставке рублёвого вклада: рядом с валютным они не имеют смысла.
    const couponsFollow = s.reinvestFollows && !foreign;
    const marketFollows = s.marketFollowsCurve && !foreign;
    if (!(num(s.amount) > 0)) problems.push('amount');
    if (!(num(d.ratePercent) >= 0)) problems.push('rate');
    if (!(num(d.termMonths) >= 1) || !Number.isInteger(d.termMonths)) problems.push('term');
    if (!couponsFollow && !(num(s.reinvestPercent) >= 0)) problems.push('reinvest');
    if (!isValidCurve(s.curve)) problems.push('curve');
    const within = (v: number | null, max: number): boolean => num(v) >= 0 && num(v) <= max;
    if (!within(d.taxPercent, 100) || !within(b.taxPercent, 100)) problems.push('tax');
    if (!within(b.commissionPercent, 50)) problems.push('commission');
    if (s.marketYieldPercent !== null && !(s.marketYieldPercent > -50)) problems.push('marketYield');
    if (!(s.horizonYears > 0)) problems.push('horizon');
    if (problems.length) return { ok: false, problems };

    const deposit: Deposit = {
        amount: s.amount!,
        rate: d.ratePercent! / 100,
        capitalization: d.capitalization,
        termMonths: d.termMonths!,
        taxRate: d.taxPercent! / 100,
        ...(foreign ? { exchange: { rate0: d.fxRate!, yearlyChange: d.fxChangePercent! / 100 } } : {}),
    };
    const scenario: Scenario = {
        horizonYears: s.horizonYears,
        reinvestRate: couponsFollow ? 'deposit' : s.reinvestPercent! / 100,
        marketYield: marketFollows ? 'path' : s.marketYieldPercent === null ? null : s.marketYieldPercent / 100,
        path: curveToPath(s.curve),
    };
    const quote = bondQuote(bond, buy);
    const comparison = compare(deposit, bond, buy, scenario, { commission: b.commissionPercent! / 100, taxRate: b.taxPercent! / 100 });
    return { ok: true, value: { bond, buy, deposit, currency: d.currency, scenario, quote, comparison, lifeYears: quote.years } };
}

export const PAYMENTS_PER_YEAR: readonly number[] = [1, 2, 4, 12];

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const numberOr = (v: unknown, fallback: number): number => (finite(v) ? v : fallback);
/** Empty (`null`) is a valid answer for a field the person may clear. / Пусто (`null`) допустимо для поля, которое можно очистить. */
const numberOrNull = (v: unknown, fallback: number | null): number | null => (v === null ? null : finite(v) ? v : fallback);
const dateOrNull = (v: unknown, fallback: string | null): string | null => {
    if (v === null) return null;
    if (typeof v !== 'string') return fallback;
    try {
        parseDate(v);
        return v;
    } catch {
        return fallback;
    }
};

/**
 * Inputs read back from storage or a file: anything that does not fit goes back to the example's value, nothing throws.
 * Входы, прочитанные из хранилища или файла: что не подошло, возвращается к значению примера, ничего не падает.
 */
export function sanitizeInputs(raw: unknown): Inputs {
    const base = defaultInputs();
    if (typeof raw !== 'object' || raw === null) return base;
    const r = raw as { deposit?: Record<string, unknown>; bond?: Record<string, unknown>; scenario?: Record<string, unknown> };
    const d = r.deposit ?? {};
    const b = r.bond ?? {};
    const s = r.scenario ?? {};
    return {
        deposit: {
            ratePercent: numberOrNull(d.ratePercent, base.deposit.ratePercent),
            capitalization: CAPITALIZATIONS.includes(d.capitalization as Capitalization) ? (d.capitalization as Capitalization) : base.deposit.capitalization,
            termMonths: numberOrNull(d.termMonths, base.deposit.termMonths),
            taxPercent: numberOrNull(d.taxPercent, base.deposit.taxPercent),
            currency: CURRENCIES.includes(d.currency as Currency) ? (d.currency as Currency) : base.deposit.currency,
            fxRate: numberOrNull(d.fxRate, base.deposit.fxRate),
            fxChangePercent: numberOrNull(d.fxChangePercent, base.deposit.fxChangePercent),
        },
        bond: {
            nominal: numberOrNull(b.nominal, base.bond.nominal),
            cleanPricePercent: numberOrNull(b.cleanPricePercent, base.bond.cleanPricePercent),
            couponRub: numberOrNull(b.couponRub, base.bond.couponRub),
            paymentsPerYear: PAYMENTS_PER_YEAR.includes(b.paymentsPerYear as number) ? (b.paymentsPerYear as number) : base.bond.paymentsPerYear,
            buyDate: dateOrNull(b.buyDate, base.bond.buyDate),
            maturity: dateOrNull(b.maturity, base.bond.maturity),
            commissionPercent: numberOrNull(b.commissionPercent, base.bond.commissionPercent),
            taxPercent: numberOrNull(b.taxPercent, base.bond.taxPercent),
        },
        scenario: {
            amount: numberOrNull(s.amount, base.scenario.amount),
            horizonYears: numberOr(s.horizonYears, base.scenario.horizonYears),
            reinvestPercent: numberOrNull(s.reinvestPercent, base.scenario.reinvestPercent),
            marketYieldPercent: numberOrNull(s.marketYieldPercent, base.scenario.marketYieldPercent),
            reinvestFollows: s.reinvestFollows === true,
            marketFollowsCurve: s.marketFollowsCurve === true,
            curve: sanitizeCurve(s.curve),
        },
    };
}
