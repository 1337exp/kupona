/**
 * Dates are whole day numbers (days since 1970-01-01, UTC): no time zones, no clock, plain arithmetic.
 * Даты это целые номера дней (с 1970-01-01, UTC): без часовых поясов и времени, обычная арифметика.
 */

export const MS_PER_DAY = 86_400_000;

/** Days in a year for converting day counts to years (act/365, as the Moscow Exchange does for yields). / Дней в году (act/365, как считает Мосбиржа). */
export const DAYS_PER_YEAR = 365;

/** `YYYY-MM-DD` to a day number. Throws `RangeError` on a bad or non-existent date. / Строка в номер дня; ошибка на неверной дате. */
export function parseDate(iso: string): number {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!m) throw new RangeError(`Bad date: ${iso}`);
    const year = Number(m[1]);
    const month = Number(m[2]);
    const dayOfMonth = Number(m[3]);
    const ms = Date.UTC(year, month - 1, dayOfMonth);
    // A day past the end of the month (or 00) rolls into the neighbouring month, so the month alone tells a real date from a fake one.
    const back = new Date(ms);
    if (back.getUTCFullYear() !== year || back.getUTCMonth() !== month - 1) throw new RangeError(`Bad date: ${iso}`);
    return ms / MS_PER_DAY;
}

/** Day number to `YYYY-MM-DD`. / Номер дня в строку. */
export function formatDate(day: number): string {
    return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Years between two day numbers (act/365). / Лет между двумя днями. */
export function yearsBetween(fromDay: number, toDay: number): number {
    return (toDay - fromDay) / DAYS_PER_YEAR;
}
