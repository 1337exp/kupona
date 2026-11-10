/**
 * The lines of the "value over time" chart: the deposit, the bond (price, coupons and what they earned), and the promise of the yield.
 * Линии графика «стоимость во времени»: вклад, облигация (цена, купоны и их заработок) и обещание доходности.
 */
import { depositValue } from '@/core/deposit';
import type { Evaluated } from './model';

export interface Series {
    /** Years of each point. / Годы точек. */
    t: number[];
    deposit: number[];
    bond: number[];
    /** The amount growing at the yield to maturity: what the yield "promises". / Сумма, растущая под доходность к погашению. */
    promise: number[];
    horizon: number;
    life: number;
    max: number;
}

export function series(e: Evaluated, points = 120): Series {
    const life = e.lifeYears;
    const amount = e.deposit.amount;
    const ytm = e.quote.ytm ?? 0;
    const t: number[] = [];
    const deposit: number[] = [];
    const bond: number[] = [];
    const promise: number[] = [];
    let max = amount;
    for (let i = 0; i <= points; i++) {
        const years = (life * i) / points;
        t.push(years);
        deposit.push(depositValue(e.deposit, years, e.scenario.path));
        bond.push(e.comparison.bond.valueAt(years));
        promise.push(amount * (1 + ytm) ** years);
        max = Math.max(max, deposit[i]!, bond[i]!, promise[i]!);
    }
    return { t, deposit, bond, promise, horizon: e.comparison.bond.horizon, life, max };
}

/** A round top of the axis and a step between marks: 50, 100, 200, 500 thousand, and so on. / Круглый верх оси и шаг между метками. */
export function niceAxis(max: number, marks = 4): { top: number; step: number } {
    const raw = max / marks;
    const pow = 10 ** Math.floor(Math.log10(raw));
    const unit = [1, 2, 5, 10].find((m) => m * pow >= raw)! * pow;
    return { top: Math.ceil(max / unit) * unit, step: unit };
}
