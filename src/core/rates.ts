/**
 * Rates that move over time. A path says by how much rates are above or below today's, year by year; anything tied to the
 * market (a new deposit, coupons put to work, the yield of the bond) moves by that much. An empty path is "nothing moves".
 * Ставки, которые меняются во времени. Траектория говорит, на сколько ставки выше или ниже сегодняшних, по годам; всё, что
 * привязано к рынку (новый вклад, вложенные купоны, доходность облигации), сдвигается на столько же. Пустая траектория: ничего не движется.
 */

export interface RatePoint {
    /** Years from the purchase. / Лет от покупки. */
    t: number;
    /** Shift of the rate against today, a fraction (-0.06 is six points lower). / Сдвиг ставки к сегодняшней, доля. */
    delta: number;
}

/** Points in ascending `t`; between them the shift goes in straight lines, outside it stays what the end point says. / Точки по возрастанию `t`; между ними прямые, за краями значение крайней точки. */
export type RatePath = readonly RatePoint[];

/** The shift at time `t`. / Сдвиг в момент `t`. */
export function shiftAt(path: RatePath, t: number): number {
    const n = path.length;
    if (n === 0) return 0;
    const first = path[0]!;
    const last = path[n - 1]!;
    if (t <= first.t) return first.delta;
    if (t >= last.t) return last.delta;
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (path[mid]!.t <= t) lo = mid;
        else hi = mid;
    }
    const a = path[lo]!;
    const b = path[hi]!;
    // The search stops on the last point not after `t`, so `b.t > t >= a.t` and the span is never zero (a step is two points at one moment).
    // Поиск встаёт на последней точке не позже `t`, поэтому `b.t > t >= a.t` и отрезок не нулевой (ступенька это две точки в один момент).
    return a.delta + ((b.delta - a.delta) * (t - a.t)) / (b.t - a.t);
}

/** Nothing moves: no points, or every shift is zero. / Ничего не движется. */
export const isFlat = (path: RatePath): boolean => path.every((p) => p.delta === 0);

export interface Compounding {
    /** How many times money grows between two moments if it earns `base + shift` all the while. / Во сколько раз вырастут деньги между двумя моментами. */
    factor(from: number, to: number): number;
}

/** Step of the table the growth is integrated on, years. / Шаг таблицы, по которой считается рост, лет. */
const GRID = 1 / 48;

/**
 * Money that earns `base + shift(t)` a year (effective, never below zero), moment by moment. Without movement it is the plain
 * `(1 + base)^years`.
 * Деньги, которые зарабатывают `base + shift(t)` годовых (эффективных, не ниже нуля) каждое мгновение. Без движения это обычное `(1 + base)^лет`.
 */
export function compounding(path: RatePath, base: number, horizon: number): Compounding {
    if (isFlat(path)) return { factor: (from, to) => (1 + base) ** (to - from) };
    const steps = Math.max(1, Math.ceil(horizon / GRID));
    const cumulative = new Float64Array(steps + 1);
    for (let i = 1; i <= steps; i++) {
        const rate = Math.max(base + shiftAt(path, (i - 0.5) * GRID), 0);
        cumulative[i] = cumulative[i - 1]! + Math.log1p(rate) * GRID;
    }
    const grown = (t: number): number => {
        const x = Math.min(Math.max(t, 0), steps * GRID) / GRID;
        const i = Math.min(Math.floor(x), steps - 1);
        return cumulative[i]! + (cumulative[i + 1]! - cumulative[i]!) * (x - i);
    };
    return { factor: (from, to) => Math.exp(grown(to) - grown(from)) };
}
