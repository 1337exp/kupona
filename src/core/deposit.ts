import { type RatePath, isFlat, shiftAt } from './rates';

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
}

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

/** What a year really gives: the effective yearly rate. / Сколько на деле даёт год: эффективная годовая ставка. */
export function effectiveRate(dep: Deposit): number {
    return depositValue(dep, 1) / dep.amount - 1;
}

export interface DepositRun {
    horizon: number;
    /** How many times interest was added to the balance. / Сколько раз проценты прибавлялись к остатку. */
    capitalizations: number;
    finalValue: number;
    profit: number;
    /** Interest if nothing was ever added to the balance (`amount × rate × years`). / Проценты без капитализации. */
    simpleProfit: number;
    /** What the interest on interest added on top of that. / Сколько добавили проценты на проценты. */
    compoundExtra: number;
    /** Yearly growth over the horizon, as a rate. / Среднегодовой рост за горизонт. */
    cagr: number;
    effectiveRate: number;
}

export function simulateDeposit(dep: Deposit, horizon: number, path: RatePath = []): DepositRun {
    const finalValue = depositValue(dep, horizon, path);
    const profit = finalValue - dep.amount;
    const term = dep.termMonths / 12;
    const terms = Math.floor(horizon / term + 1e-9);
    const tail = horizon - terms * term;
    let simpleProfit = dep.amount * dep.rate * horizon;
    if (!isFlat(path) && horizon > 0) {
        simpleProfit = 0;
        for (let k = 0; k < terms; k++) simpleProfit += dep.amount * rateAt(dep, path, k * term) * term;
        simpleProfit += dep.amount * rateAt(dep, path, terms * term) * Math.max(tail, 0);
    }
    const perTerm = dep.capitalization === 'end' ? 1 : Math.floor(term * CAPITALIZATIONS_PER_YEAR[dep.capitalization] + 1e-9);
    const inTail = dep.capitalization === 'end' ? 0 : Math.floor(tail * CAPITALIZATIONS_PER_YEAR[dep.capitalization] + 1e-9);
    return {
        horizon,
        capitalizations: terms * perTerm + inTail,
        finalValue,
        profit,
        simpleProfit,
        compoundExtra: profit - simpleProfit,
        cagr: horizon > 0 ? (finalValue / dep.amount) ** (1 / horizon) - 1 : 0,
        effectiveRate: effectiveRate(dep),
    };
}
