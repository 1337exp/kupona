/**
 * Tax on profit, the simple way: a share of what was earned above the money put in, paid at the end. Nothing is paid when there is
 * no profit, and a loss is not given back. Timing, tax-free amounts and offsets are not modelled.
 * Налог на прибыль, по-простому: доля от заработанного сверх вложенного, платится в конце. Нет прибыли, нет налога; убыток не возвращается.
 * Сроки уплаты, необлагаемые суммы и зачёты не моделируются.
 */
export function taxOn(value: number, base: number, rate: number): number {
    return rate * Math.max(value - base, 0);
}

/** What stays after the tax. / Что остаётся после налога. */
export const afterTax = (value: number, base: number, rate: number): number => value - taxOn(value, base, rate);
