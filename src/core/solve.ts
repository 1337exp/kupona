/**
 * Bisection: finds x in [lo, hi] where `f(x) = target`, for a function that only goes up or only goes down on the range.
 * Returns `null` when the target is not between `f(lo)` and `f(hi)`.
 * Бисекция: ищет x в [lo, hi], где `f(x) = target`, для монотонной функции. Если цель вне диапазона значений, `null`.
 */
export function bisect(f: (x: number) => number, target: number, lo: number, hi: number, iterations = 100): number | null {
    const atLo = f(lo) - target;
    const atHi = f(hi) - target;
    if (!Number.isFinite(atLo) || !Number.isFinite(atHi)) return null;
    if (atLo === 0) return lo;
    if (atHi === 0) return hi;
    if (atLo > 0 === atHi > 0) return null;
    let a = lo;
    let b = hi;
    let signA = atLo > 0;
    for (let i = 0; i < iterations; i++) {
        const mid = (a + b) / 2;
        const diff = f(mid) - target;
        if (diff === 0) return mid;
        if (diff > 0 === signA) {
            a = mid;
            signA = diff > 0;
        } else {
            b = mid;
        }
    }
    return (a + b) / 2;
}
