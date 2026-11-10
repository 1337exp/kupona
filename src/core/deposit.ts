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

/** Balance after `years` (any length, terms are renewed). / Остаток через `years` лет (сроки продлеваются). */
export function depositValue(dep: Deposit, years: number): number {
    if (years <= 0) return dep.amount;
    const term = dep.termMonths / 12;
    const terms = Math.floor(years / term + 1e-9);
    const perTerm = growth(term, dep.rate, dep.capitalization);
    const tail = years - terms * term;
    return dep.amount * perTerm ** terms * growth(tail, dep.rate, dep.capitalization);
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

export function simulateDeposit(dep: Deposit, horizon: number): DepositRun {
    const finalValue = depositValue(dep, horizon);
    const profit = finalValue - dep.amount;
    const simpleProfit = dep.amount * dep.rate * horizon;
    const term = dep.termMonths / 12;
    const terms = Math.floor(horizon / term + 1e-9);
    const tail = horizon - terms * term;
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
