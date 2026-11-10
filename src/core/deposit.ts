import { type Exchange, exchangeAt } from './currency';
import { type RatePath, isFlat, shiftAt } from './rates';
import { afterTax } from './tax';

/**
 * A bank deposit. The rate is nominal yearly. When the term ends, the whole balance (with the interest) is put into a new term
 * at the same rate; a tail shorter than the term earns the same rate (real banks pay less on early closing: not modelled).
 * Банковский вклад. Ставка номинальная годовая. По окончании срока весь остаток с процентами уходит в новый срок под ту же ставку;
 * «хвост» короче срока считается по той же ставке (банки при досрочном закрытии платят меньше: не учитываем).
 */

/**
 * How often interest is added to the balance: at the end of the term only, or every day / month / quarter / year.
 * Как часто проценты прибавляются к остатку: только в конце срока или каждый день, месяц, квартал, год.
 */
export type Capitalization = 'end' | 'daily' | 'monthly' | 'quarterly' | 'yearly';

export const CAPITALIZATIONS: readonly Capitalization[] = ['end', 'daily', 'monthly', 'quarterly', 'yearly'];

/** Capitalizations per year; `end` has none inside a term. / Капитализаций в году. */
export const CAPITALIZATIONS_PER_YEAR: Record<Exclude<Capitalization, 'end'>, number> = {
    daily: 365,
    monthly: 12,
    quarterly: 4,
    yearly: 1,
};

export interface Deposit {
    amount: number;
    /** Nominal yearly rate, a fraction. / Номинальная годовая ставка, доля. */
    rate: number;
    capitalization: Capitalization;
    /** Term of one deposit contract, months. / Срок одного вклада, месяцев. */
    termMonths: number;
    /** Tax on the interest, a fraction, paid at the end; none by default. / Налог на проценты, доля, в конце; по умолчанию нет. */
    taxRate?: number;
    /**
     * The deposit is in a foreign currency: `amount` is still the roubles put in, they are changed at today's rate, the interest
     * is in the currency, and the balance is changed back at the rate of the day. `rate` is the rate of that currency.
     * Вклад в иностранной валюте: `amount` по-прежнему рубли, их меняют по сегодняшнему курсу, проценты в валюте, остаток меняют
     * обратно по курсу того дня. `rate` это ставка по этой валюте.
     */
    exchange?: Exchange;
}

/** The deposit counted in units of its own currency (the roubles changed at today's rate); a rouble one stays as it is. / Вклад в единицах своей валюты. */
function inUnits(dep: Deposit): Deposit {
    return dep.exchange ? { ...dep, amount: dep.amount / dep.exchange.rate0, exchange: undefined } : dep;
}

/** Roubles for one unit of the deposit's currency after `years` (1 for a rouble deposit). / Рублей за единицу валюты вклада через `years` лет. */
const toRoubles = (dep: Deposit, years: number): number => (dep.exchange ? exchangeAt(dep.exchange, years) : 1);

/** Growth factor over `years` inside one term. / Во сколько раз вырастет сумма за `years` внутри одного срока. */
function growth(years: number, rate: number, capitalization: Capitalization): number {
    if (years <= 0) return 1;
    if (capitalization === 'end') return 1 + rate * years;
    const perYear = CAPITALIZATIONS_PER_YEAR[capitalization];
    const whole = Math.floor(years * perYear + 1e-9);
    const rest = Math.max(years - whole / perYear, 0);
    return (1 + rate / perYear) ** whole * (1 + rate * rest);
}

/**
 * The rate of the contract that starts at `start`: the deposit's own rate moved by the path, never below zero. A rate is fixed
 * for the whole term, so a new one is only taken when the term is renewed.
 * Ставка договора, который начинается в `start`: ставка вклада, сдвинутая траекторией, не ниже нуля. Ставка действует весь срок,
 * новая берётся только при продлении.
 */
const rateAt = (dep: Deposit, path: RatePath, start: number): number => Math.max(dep.rate + shiftAt(path, start), 0);

/**
 * Balance after `years` (any length, terms are renewed). With a moving `path` every renewal takes the rate of that day.
 * Остаток через `years` лет (сроки продлеваются). С движущейся `path` каждое продление берёт ставку того дня.
 */
export function depositValue(dep: Deposit, years: number, path: RatePath = []): number {
    return valueInUnits(inUnits(dep), years, path) * toRoubles(dep, years);
}

function valueInUnits(dep: Deposit, years: number, path: RatePath): number {
    if (years <= 0) return dep.amount;
    const term = dep.termMonths / 12;
    const terms = Math.floor(years / term + 1e-9);
    const tail = years - terms * term;
    if (isFlat(path)) {
        const perTerm = growth(term, dep.rate, dep.capitalization);
        return dep.amount * perTerm ** terms * growth(tail, dep.rate, dep.capitalization);
    }
    let balance = dep.amount;
    for (let k = 0; k < terms; k++) balance *= growth(term, rateAt(dep, path, k * term), dep.capitalization);
    return balance * growth(tail, rateAt(dep, path, terms * term), dep.capitalization);
}

/** Balance after the tax on the interest. / Остаток после налога на проценты. */
export function depositNet(dep: Deposit, years: number, path: RatePath = []): number {
    // The tax is on the interest in the currency: a change of the rate is not interest. / Налог на проценты в валюте: перемена курса не проценты.
    const u = inUnits(dep);
    return afterTax(valueInUnits(u, years, path), u.amount, dep.taxRate ?? 0) * toRoubles(dep, years);
}

/** What a year really gives: the effective yearly rate. / Сколько на деле даёт год: эффективная годовая ставка. */
export function effectiveRate(dep: Deposit): number {
    const u = inUnits(dep);
    return valueInUnits(u, 1, []) / u.amount - 1;
}

export interface DepositRun {
    horizon: number;
    /** How many times interest was added to the balance. / Сколько раз проценты прибавлялись к остатку. */
    capitalizations: number;
    /** The balance after the tax. / Остаток после налога. */
    finalValue: number;
    /** The tax on the interest. / Налог на проценты. */
    tax: number;
    /** Profit after the tax and the change of the exchange rate. / Прибыль после налога и перемены курса. */
    profit: number;
    /** What the change of the exchange rate gave (or took) on the money put in; 0 for a rouble deposit. / Что дала (или отняла) перемена курса; 0 для рублёвого вклада. */
    fxGain: number;
    /** Interest if nothing was ever added to the balance (`amount × rate × years`). / Проценты без капитализации. */
    simpleProfit: number;
    /** What the interest on interest added on top of that. / Сколько добавили проценты на проценты. */
    compoundExtra: number;
    /** Yearly growth over the horizon, as a rate. / Среднегодовой рост за горизонт. */
    cagr: number;
    effectiveRate: number;
}

export function simulateDeposit(dep: Deposit, horizon: number, path: RatePath = []): DepositRun {
    const u = inUnits(dep);
    const rate = toRoubles(dep, horizon);
    const gross = valueInUnits(u, horizon, path) * rate;
    const finalValue = depositNet(dep, horizon, path);
    const profit = finalValue - dep.amount;
    const term = dep.termMonths / 12;
    const terms = Math.floor(horizon / term + 1e-9);
    const tail = horizon - terms * term;
    let simpleProfit = u.amount * dep.rate * horizon * rate;
    if (!isFlat(path) && horizon > 0) {
        simpleProfit = 0;
        for (let k = 0; k < terms; k++) simpleProfit += u.amount * rateAt(dep, path, k * term) * term * rate;
        simpleProfit += u.amount * rateAt(dep, path, terms * term) * Math.max(tail, 0) * rate;
    }
    const perTerm = dep.capitalization === 'end' ? 1 : Math.floor(term * CAPITALIZATIONS_PER_YEAR[dep.capitalization] + 1e-9);
    const inTail = dep.capitalization === 'end' ? 0 : Math.floor(tail * CAPITALIZATIONS_PER_YEAR[dep.capitalization] + 1e-9);
    return {
        horizon,
        capitalizations: terms * perTerm + inTail,
        finalValue,
        tax: gross - finalValue,
        profit,
        fxGain: dep.exchange ? u.amount * (rate - dep.exchange.rate0) : 0,
        simpleProfit,
        // Both before the tax, in roubles at the rate of the day: the tax and the exchange are shown on their own.
        // Оба до налога, в рублях по курсу дня: налог и курс показаны отдельно.
        compoundExtra: gross - u.amount * rate - simpleProfit,
        cagr: horizon > 0 ? (finalValue / dep.amount) ** (1 / horizon) - 1 : 0,
        effectiveRate: effectiveRate(dep),
    };
}
