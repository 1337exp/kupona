/**
 * A plain fixed-coupon bond held to maturity or sold earlier. All rates are fractions (0.1225 is 12.25%), all times are years
 * counted from the purchase day (act/365), money is in the bond's currency.
 * Обычная облигация с фиксированным купоном: держим до погашения или продаём раньше. Ставки это доли (0.1225 = 12,25%),
 * время в годах от дня покупки (act/365), деньги в валюте облигации.
 */
import { DAYS_PER_YEAR, parseDate, yearsBetween } from './dates';
import { bisect } from './solve';

export interface Bond {
    /** Face value paid back at maturity. / Номинал, возвращается при погашении. */
    nominal: number;
    /** One coupon payment, money per bond. / Один купон, деньги на облигацию. */
    couponRub: number;
    /** Days between coupons (OFZ: 182). Coupon dates are counted back from maturity in these steps. / Дней между купонами (ОФЗ: 182). */
    periodDays: number;
    /** Maturity date, `YYYY-MM-DD`. / Дата погашения. */
    maturity: string;
}

export interface BondBuy {
    /** Settlement date (T+1 on the exchange), `YYYY-MM-DD`: accrued interest is counted to it. / Дата расчётов (Т+1), до неё считается НКД. */
    date: string;
    /** Clean quote in percent of nominal, as on the exchange: 79.397. / Котировка (чистая цена) в процентах номинала. */
    cleanPricePercent: number;
}

/** One payment still ahead of the buyer. / Одна выплата, которая ещё впереди. */
export interface Payment {
    day: number;
    /** Years from the purchase. / Лет от покупки. */
    t: number;
    coupon: number;
    /** Face value, only on the last payment. / Номинал, только в последней выплате. */
    redemption: number;
}

/** Coupon size from a yearly rate: the exchange pays `nominal × rate × days / 365`. / Купон из годовой ставки: номинал × ставка × дни / 365. */
export function couponFromRate(nominal: number, rate: number, periodDays: number): number {
    return (nominal * rate * periodDays) / DAYS_PER_YEAR;
}

/** Default period for N payments per year (2 gives 182). / Период по умолчанию для N выплат в год. */
export function periodDaysFromFrequency(paymentsPerYear: number): number {
    return Math.floor(DAYS_PER_YEAR / paymentsPerYear);
}

/**
 * What is wrong with the input, as codes for the interface to translate. Empty when it is fine.
 * Что не так со входом: коды, которые интерфейс переведёт. Пусто, если всё в порядке.
 */
export type BondProblem = 'nominal' | 'coupon' | 'period' | 'price' | 'date' | 'matured';

export function bondProblems(bond: Bond, buy: BondBuy): BondProblem[] {
    const problems: BondProblem[] = [];
    if (!(bond.nominal > 0)) problems.push('nominal');
    if (!(bond.couponRub >= 0)) problems.push('coupon');
    if (!Number.isInteger(bond.periodDays) || bond.periodDays < 1) problems.push('period');
    if (!(buy.cleanPricePercent > 0)) problems.push('price');
    try {
        const buyDay = parseDate(buy.date);
        const matDay = parseDate(bond.maturity);
        if (matDay <= buyDay) problems.push('matured');
    } catch {
        problems.push('date');
    }
    return problems;
}

/**
 * Payments after the purchase day, oldest first. The payment on the purchase day itself belongs to the seller.
 * Выплаты после дня покупки по порядку. Выплата ровно в день покупки достаётся продавцу.
 */
export function couponSchedule(bond: Bond, buyDay: number): Payment[] {
    const matDay = parseDate(bond.maturity);
    if (matDay <= buyDay) throw new RangeError('The bond is already matured on the purchase day');
    if (!Number.isInteger(bond.periodDays) || bond.periodDays < 1) throw new RangeError('periodDays must be a positive integer');
    const days: number[] = [];
    for (let day = matDay; day > buyDay; day -= bond.periodDays) days.push(day);
    days.reverse();
    return days.map((day, i) => ({
        day,
        t: yearsBetween(buyDay, day),
        coupon: bond.couponRub,
        redemption: i === days.length - 1 ? bond.nominal : 0,
    }));
}

/** Accrued coupon interest (НКД) per bond on the purchase day. / НКД на одну облигацию в день покупки. */
export function accruedInterest(bond: Bond, buyDay: number, schedule = couponSchedule(bond, buyDay)): number {
    const next = schedule[0];
    if (!next) return 0;
    // The schedule goes back from maturity in whole periods, so the next payment is always within one period: elapsed is in [0, period).
    const elapsed = buyDay - (next.day - bond.periodDays);
    return (bond.couponRub * elapsed) / bond.periodDays;
}

/**
 * Value at time `tau` of the payments still ahead of it, discounted at yield `y`. This is the dirty price (with accrued interest)
 * if the market yield is `y`. A payment on `tau` itself is already paid out.
 * Стоимость на момент `tau` выплат, которые ещё впереди, при доходности `y`: грязная цена (с НКД). Выплата ровно в `tau` уже выплачена.
 */
export function dirtyValue(schedule: readonly Payment[], tau: number, y: number): number {
    let sum = 0;
    for (const p of schedule) if (p.t > tau + EPS) sum += (p.coupon + p.redemption) / (1 + y) ** (p.t - tau);
    return sum;
}

/**
 * Value at time `tau` of everything paid up to and including `tau`, if each payment was put at rate `r` the moment it arrived.
 * Стоимость на `tau` всего, что выплачено к этому моменту, если каждую выплату сразу вложили под ставку `r`.
 */
export function reinvestedValue(schedule: readonly Payment[], tau: number, r: number): number {
    return reinvestedValueBy(schedule, tau, (from, to) => (1 + r) ** (to - from));
}

/**
 * The same with any growth: `factor(from, to)` says how many times money grows between two moments (a rate that moves).
 * То же с любым ростом: `factor(from, to)` говорит, во сколько раз растут деньги между двумя моментами (ставка, которая движется).
 */
export function reinvestedValueBy(schedule: readonly Payment[], tau: number, factor: (from: number, to: number) => number): number {
    let sum = 0;
    for (const p of schedule) if (p.t <= tau + EPS) sum += (p.coupon + p.redemption) * factor(p.t, tau);
    return sum;
}

/** Tolerance for comparing times in years (a fraction of a second). / Допуск при сравнении времени. */
export const EPS = 1e-9;

export interface BondQuote {
    cleanPrice: number;
    accrued: number;
    /** What you pay per bond: clean price plus accrued interest. / Платим за штуку: чистая цена плюс НКД. */
    dirtyPrice: number;
    /** Effective yield to maturity if every payment is reinvested at the same yield; `null` when the price has no solution. */
    ytm: number | null;
    /** Weighted average time of the payments, years. / Средний взвешенный срок выплат, лет. */
    macaulayYears: number | null;
    /** How much the price moves for a 1.00 (100 points) move of the yield, relative; years. / Чувствительность цены к доходности. */
    modifiedYears: number | null;
    /** Yearly coupon divided by the clean price. / Годовой купон к чистой цене. */
    currentYield: number;
    paymentsLeft: number;
    /** Years to maturity. / Лет до погашения. */
    years: number;
}

export function bondQuote(bond: Bond, buy: BondBuy): BondQuote {
    const problems = bondProblems(bond, buy);
    if (problems.length) throw new RangeError(`Bad bond input: ${problems.join(', ')}`);
    const buyDay = parseDate(buy.date);
    const schedule = couponSchedule(bond, buyDay);
    const cleanPrice = (bond.nominal * buy.cleanPricePercent) / 100;
    const accrued = accruedInterest(bond, buyDay, schedule);
    const dirtyPrice = cleanPrice + accrued;
    const ytm = bisect((y) => dirtyValue(schedule, 0, y), dirtyPrice, -0.5, 5);
    let macaulayYears: number | null = null;
    let modifiedYears: number | null = null;
    if (ytm !== null) {
        let weighted = 0;
        for (const p of schedule) weighted += (p.t * (p.coupon + p.redemption)) / (1 + ytm) ** p.t;
        macaulayYears = weighted / dirtyPrice;
        modifiedYears = macaulayYears / (1 + ytm);
    }
    return {
        cleanPrice,
        accrued,
        dirtyPrice,
        ytm,
        macaulayYears,
        modifiedYears,
        currentYield: ((bond.couponRub * DAYS_PER_YEAR) / bond.periodDays) / cleanPrice,
        paymentsLeft: schedule.length,
        years: schedule[schedule.length - 1]!.t,
    };
}
