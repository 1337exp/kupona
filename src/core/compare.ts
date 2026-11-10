/**
 * The bond and the deposit side by side: same money, same horizon, one scenario.
 * Облигация и вклад рядом: те же деньги, тот же горизонт, один сценарий.
 */
import { type Bond, type BondBuy, type Payment, EPS, accruedInterest, bondQuote, couponSchedule, dirtyValue, reinvestedValueBy } from './bond';
import { parseDate } from './dates';
import { type Deposit, type DepositRun, depositValue, simulateDeposit } from './deposit';
import { type RatePath, compounding, shiftAt } from './rates';
import { bisect } from './solve';

export interface Scenario {
    /** How long we hold, years. Longer than the bond lives means until maturity. / Сколько держим, лет; больше срока облигации значит до погашения. */
    horizonYears: number;
    /**
     * Rate at which every coupon is put to work the moment it arrives; 0 means it just lies there; `'deposit'` puts it into
     * deposits, at the deposit's rate of the day (it follows `path`).
     * Под какую ставку вкладываем каждый купон; 0: лежит без дела; `'deposit'`: во вклады, по ставке вклада того дня (за `path`).
     */
    reinvestRate: number | 'deposit';
    /**
     * Market yield of the bond right after the purchase (it moves the price if we sell early); `null` keeps the yield we bought at;
     * `'path'` moves it with `path`: the yield we bought at, plus the shift of the day.
     * Доходность рынка сразу после покупки; `null`: как при покупке; `'path'`: двигается с `path` (при покупке плюс сдвиг дня).
     */
    marketYield: number | null | 'path';
    /** How rates move over time; without it nothing moves. / Как ставки движутся во времени; без неё ничего не движется. */
    path?: RatePath;
}

export interface BondOptions {
    /** Buy whole bonds only; the change stays as idle cash (true), or take any fraction (false). / Только целые штуки, сдача лежит без дела. */
    wholePieces?: boolean;
    /** The deposit's rate today: needed when coupons go into deposits (`reinvestRate: 'deposit'`). / Ставка вклада сегодня: нужна, когда купоны идут во вклады. */
    depositRate?: number;
}

export interface BondRun {
    cleanPrice: number;
    accrued: number;
    dirtyPrice: number;
    pieces: number;
    /** Paid for the pieces. / Заплачено за штуки. */
    spent: number;
    /** Change that did not buy a whole piece. / Сдача, на которую не хватило целой штуки. */
    leftover: number;
    /** The horizon actually used (cut to the bond's life). / Горизонт, который реально использован. */
    horizon: number;
    atMaturity: boolean;
    /** The market yield used for the price at the horizon. / Доходность рынка, по которой считали цену на горизонте. */
    marketYield: number;
    paymentsReceived: number;
    /** Coupons received, in money (not counting the face value). / Полученные купоны деньгами (без номинала). */
    couponsSum: number;
    /** Sold at the horizon (with accrued interest) or paid back at maturity. / Продажа на горизонте (с НКД) или погашение. */
    exitValue: number;
    /** What the coupons earned after they were paid. / Сколько заработали купоны после выплаты. */
    reinvestGain: number;
    finalValue: number;
    profit: number;
    cagr: number;
    /** Portfolio value at any moment: bonds at the market price, coupons with their reinvestment, plus the change. / Стоимость портфеля в любой момент. */
    valueAt(years: number): number;
}

export function simulateBond(bond: Bond, buy: BondBuy, amount: number, scenario: Scenario, options: BondOptions = {}): BondRun {
    const quote = bondQuote(bond, buy);
    const buyDay = parseDate(buy.date);
    const schedule = couponSchedule(bond, buyDay);
    const accrued = accruedInterest(bond, buyDay, schedule);
    const dirtyPrice = quote.dirtyPrice;
    const life = quote.years;
    const horizon = Math.min(Math.max(scenario.horizonYears, 0), life);
    const atMaturity = horizon >= life - EPS;
    const path = scenario.path ?? [];
    const bought = quote.ytm ?? 0;
    const market = scenario.marketYield;
    // The yield the whole price is discounted at on a given day: a flat curve, as for a quote on the screen.
    // Доходность, по которой на данный день дисконтируется вся цена: плоская кривая, как котировка на экране.
    const yieldAt = (years: number): number => (typeof market === 'number' ? market : market === 'path' ? Math.max(bought + shiftAt(path, years), 0) : bought);
    const r = scenario.reinvestRate;
    if (r === 'deposit' && options.depositRate === undefined) throw new RangeError("reinvestRate 'deposit' needs options.depositRate");
    const factor = r === 'deposit' ? compounding(path, options.depositRate!, life).factor : (from: number, to: number): number => (1 + r) ** (to - from);

    const pieces = options.wholePieces === false ? amount / dirtyPrice : Math.floor(amount / dirtyPrice + 1e-9);
    const spent = pieces * dirtyPrice;
    const leftover = amount - spent;

    const valueAt = (years: number): number =>
        pieces * (dirtyValue(schedule, years, yieldAt(years)) + reinvestedValueBy(schedule, years, factor)) + leftover;

    const paid: Payment[] = schedule.filter((p) => p.t <= horizon + EPS);
    const couponsSum = pieces * paid.reduce((s, p) => s + p.coupon, 0);
    const paidTotal = pieces * paid.reduce((s, p) => s + p.coupon + p.redemption, 0);
    const marketYield = yieldAt(horizon);
    const exitValue = atMaturity ? pieces * bond.nominal : pieces * dirtyValue(schedule, horizon, marketYield);
    const reinvestGain = pieces * reinvestedValueBy(schedule, horizon, factor) - paidTotal;
    const finalValue = valueAt(horizon);

    return {
        cleanPrice: quote.cleanPrice,
        accrued,
        dirtyPrice,
        pieces,
        spent,
        leftover,
        horizon,
        atMaturity,
        marketYield,
        paymentsReceived: paid.length,
        couponsSum,
        exitValue,
        reinvestGain,
        finalValue,
        profit: finalValue - amount,
        cagr: horizon > 0 ? (finalValue / amount) ** (1 / horizon) - 1 : 0,
        valueAt,
    };
}

export interface Comparison {
    deposit: DepositRun;
    bond: BondRun;
    /** Bond minus deposit at the horizon: above zero means the bond is ahead. / Облигация минус вклад на горизонте. */
    difference: number;
    /** The deposit rate (same capitalization and term) at which it ties with the bond; `null` if even a zero rate keeps up. / Ставка вклада, при которой он сравняется с облигацией. */
    breakEvenRate: number | null;
}

/** The deposit's money is what the bond gets as well. / Столько же денег, сколько во вкладе, идёт в облигацию. */
export function compare(deposit: Deposit, bond: Bond, buy: BondBuy, scenario: Scenario, options: BondOptions = {}): Comparison {
    const path = scenario.path ?? [];
    const bondRun = simulateBond(bond, buy, deposit.amount, scenario, { depositRate: deposit.rate, ...options });
    const depositRun = simulateDeposit(deposit, bondRun.horizon, path);
    const breakEvenRate = bisect((rate) => depositValue({ ...deposit, rate }, bondRun.horizon, path), bondRun.finalValue, 0, 5);
    return {
        deposit: depositRun,
        bond: bondRun,
        difference: bondRun.finalValue - depositRun.finalValue,
        breakEvenRate,
    };
}
