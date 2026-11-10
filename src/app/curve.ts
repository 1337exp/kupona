/**
 * The curve of rates as the person draws it: points of years and percentage points, with a transition to the next point. Here it
 * is checked, made into the plain path the core wants, and offered as ready shapes.
 * Кривая ставок, как её рисует человек: точки из лет и процентных пунктов с переходом к следующей. Здесь её проверяют, превращают в
 * простую траекторию для ядра и предлагают готовые формы.
 */
import { type Ease, easeValue, isEase } from '@1337exp/taoux/ease';
import type { RatePath, RatePoint } from '@/core/rates';

export interface CurvePoint {
    /** Years from the purchase. / Лет от покупки. */
    t: number;
    /** Percentage points above (+) or below (-) today's rate. / Процентных пунктов к сегодняшней ставке. */
    delta: number;
    /** How to go from this point to the next one; straight by default. / Как идти к следующей точке; по умолчанию прямая. */
    ease?: Ease;
}

/** Where the flat curve and the ready shapes end, years. / Где кончаются плоская кривая и готовые формы, лет. */
export const CURVE_END = 14;
/** Largest shift allowed, percentage points. / Наибольший допустимый сдвиг. */
export const MAX_DELTA = 50;

export type CurveShape = 'flat' | 'falling' | 'rising';
export const CURVE_SHAPES: readonly CurveShape[] = ['flat', 'falling', 'rising'];

export function curveShape(shape: CurveShape, end = CURVE_END): CurvePoint[] {
    switch (shape) {
        case 'flat':
            return [
                { t: 0, delta: 0 },
                { t: end, delta: 0 },
            ];
        case 'falling':
            return [
                { t: 0, delta: 0 },
                { t: 3, delta: -6 },
                { t: end, delta: -6 },
            ];
        case 'rising':
            return [
                { t: 0, delta: 0 },
                { t: 2, delta: 4 },
                { t: end, delta: 4 },
            ];
    }
}

/** Two or more points, the first at today with no shift, time going strictly forward, shifts sane. / Минимум две точки, первая сегодня без сдвига, время строго вперёд. */
export function isValidCurve(points: readonly CurvePoint[]): boolean {
    if (points.length < 2) return false;
    if (points[0]!.t !== 0 || points[0]!.delta !== 0) return false;
    return points.every((p, i) => Number.isFinite(p.t) && Number.isFinite(p.delta) && Math.abs(p.delta) <= MAX_DELTA && (i === 0 || p.t > points[i - 1]!.t));
}

/** Pieces a curved transition is cut into. / На сколько кусков режется плавный переход. */
const PIECES = 24;

/** The path the core follows: percentage points become fractions, curved transitions become short straight pieces. / Траектория для ядра. */
export function curveToPath(points: readonly CurvePoint[]): RatePath {
    const out: RatePoint[] = [];
    points.forEach((a, i) => {
        out.push({ t: a.t, delta: a.delta / 100 });
        const b = points[i + 1];
        if (!b || a.ease === undefined || a.ease === 'linear') return;
        for (let k = 1; k < PIECES; k++) {
            const u = k / PIECES;
            out.push({ t: a.t + (b.t - a.t) * u, delta: (a.delta + (b.delta - a.delta) * easeValue(a.ease, u)) / 100 });
        }
    });
    return out;
}

/** A curve read back from storage; anything that does not fit becomes the flat one. / Кривая из хранилища; что не подошло, становится плоской. */
export function sanitizeCurve(raw: unknown): CurvePoint[] {
    if (!Array.isArray(raw)) return curveShape('flat');
    const points: CurvePoint[] = [];
    for (const item of raw as unknown[]) {
        if (typeof item !== 'object' || item === null) return curveShape('flat');
        const { t, delta, ease } = item as Record<string, unknown>;
        if (typeof t !== 'number' || typeof delta !== 'number') return curveShape('flat');
        points.push(isEase(ease) ? { t, delta, ease } : { t, delta });
    }
    return isValidCurve(points) ? points : curveShape('flat');
}

/** The shift at a moment, in percentage points: for showing what the curve says. / Сдвиг в момент, в пунктах. */
export function deltaAt(points: readonly CurvePoint[], years: number): number {
    const path = curveToPath(points);
    let shift = 0;
    for (let i = 0; i < path.length; i++) {
        const p = path[i]!;
        if (years <= p.t) {
            const prev = path[i - 1];
            shift = prev ? prev.delta + ((p.delta - prev.delta) * (years - prev.t)) / (p.t - prev.t) : p.delta;
            return shift * 100;
        }
        shift = p.delta;
    }
    return shift * 100;
}
