/**
 * Numbers as text for a language: money, percent, years, counts. Nothing here touches the DOM.
 * Числа текстом для языка: деньги, проценты, годы, штуки. DOM здесь не трогаем.
 */
import type { LocaleCode, MessageKey } from '@/i18n';
import type { Value } from './steps';

const TAG: Record<LocaleCode, string> = { ru: 'ru-RU', en: 'en-US' };

export function formatNumber(n: number, locale: LocaleCode, maxDigits = 0, minDigits = 0): string {
    return new Intl.NumberFormat(TAG[locale], { maximumFractionDigits: maxDigits, minimumFractionDigits: minDigits }).format(n);
}

export const formatMoney = (n: number, locale: LocaleCode): string => `${formatNumber(Math.round(n), locale)} ₽`;

export const formatPercent = (rate: number, locale: LocaleCode, digits = 2): string => `${formatNumber(rate * 100, locale, digits)}%`;

const YEAR: Record<LocaleCode, Partial<Record<Intl.LDMLPluralRule, string>> & { other: string }> = {
    ru: { one: 'год', few: 'года', many: 'лет', other: 'года' },
    en: { one: 'year', other: 'years' },
};

/** 1 year, 5 years, 5.5 years: the word agrees with the number. / Слово согласуется с числом. */
export function formatYears(years: number, locale: LocaleCode): string {
    const rounded = Math.round(years * 10) / 10;
    const word = YEAR[locale][new Intl.PluralRules(TAG[locale]).select(rounded)] ?? YEAR[locale].other;
    return `${formatNumber(rounded, locale, 1)} ${word}`;
}

export function formatValue(v: Value, locale: LocaleCode, t: (key: MessageKey) => string): string {
    switch (v.kind) {
        case 'money':
            return formatMoney(v.value, locale);
        case 'percent':
            return formatPercent(v.value, locale, v.digits ?? 2);
        case 'years':
            return formatYears(v.value, locale);
        case 'count':
            return formatNumber(v.value, locale);
        case 'cap':
            return t(`cap.${v.value}`);
    }
}
