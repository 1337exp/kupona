import { describe, expect, it } from 'vitest';
import { formatMoney, formatNumber, formatPercent, formatValue, formatYears } from '@/app/format';

/** Intl puts no-break spaces into numbers; compare as plain text. / Intl ставит неразрывные пробелы. */
const plain = (s: string): string => s.replace(/[\s ]/g, ' ');

describe('formatYears', () => {
    it('agrees the Russian word with the number', () => {
        expect(plain(formatYears(1, 'ru'))).toBe('1 год');
        expect(plain(formatYears(2, 'ru'))).toBe('2 года');
        expect(plain(formatYears(5, 'ru'))).toBe('5 лет');
        expect(plain(formatYears(11, 'ru'))).toBe('11 лет');
        expect(plain(formatYears(21, 'ru'))).toBe('21 год');
        expect(plain(formatYears(5.5, 'ru'))).toBe('5,5 года');
        expect(plain(formatYears(13.52, 'ru'))).toBe('13,5 года');
    });

    it('does the same in English', () => {
        expect(formatYears(1, 'en')).toBe('1 year');
        expect(formatYears(5, 'en')).toBe('5 years');
        expect(formatYears(5.5, 'en')).toBe('5.5 years');
    });
});

describe('numbers', () => {
    it('writes money with the ruble sign and no kopecks', () => {
        expect(plain(formatMoney(200_560.6, 'ru'))).toBe('200 561 ₽');
        expect(plain(formatMoney(200_560.6, 'en'))).toBe('200,561 ₽');
        expect(plain(formatMoney(-24_920.4, 'ru'))).toContain('24 920');
    });

    it('writes percent from a fraction, in the decimal style of the language', () => {
        expect(formatPercent(0.1666, 'ru')).toBe('16,66%');
        expect(formatPercent(0.1666, 'en')).toBe('16.66%');
        expect(formatPercent(0.14, 'ru')).toBe('14%');
        expect(formatPercent(0.12345, 'ru', 1)).toBe('12,3%');
    });

    it('writes counts', () => {
        expect(plain(formatNumber(1234, 'ru'))).toBe('1 234');
        expect(formatNumber(1234, 'en')).toBe('1,234');
        expect(formatNumber(3.14159, 'en', 2)).toBe('3.14');
    });
});

describe('formatValue', () => {
    const t = (key: string) => `<${key}>`;

    it('formats every kind of value', () => {
        expect(plain(formatValue({ kind: 'money', value: 1000 }, 'ru', t))).toBe('1 000 ₽');
        expect(formatValue({ kind: 'percent', value: 0.05 }, 'en', t)).toBe('5%');
        expect(formatValue({ kind: 'percent', value: 0.1666, digits: 1 }, 'en', t)).toBe('16.7%');
        expect(formatValue({ kind: 'years', value: 2 }, 'en', t)).toBe('2 years');
        expect(formatValue({ kind: 'count', value: 117 }, 'en', t)).toBe('117');
    });

    it('asks the dictionary for the capitalization wording', () => {
        expect(formatValue({ kind: 'cap', value: 'monthly' }, 'ru', t)).toBe('<cap.monthly>');
    });
});
