import { createI18n, type MessageArgs, type Paths } from '@1337exp/taoux/i18n';
import { localeEn, localeRu, setTaoLocale } from '@1337exp/taoui';
import { FALLBACK_LOCALE, LOCALES, type LocaleCode } from './locales';
import type ru from './locales/ru';

export type MessageKey = Paths<typeof ru>;
export type { MessageArgs };
export { LOCALES, LOCALE_CODES, LOCALE_NAMES, type LocaleCode } from './locales';

const i18n = createI18n<typeof LOCALES, MessageKey>({ locales: LOCALES, fallback: FALLBACK_LOCALE, storageKey: 'kupona.locale' });

export const { translate, detectLocale, useI18n } = i18n;

/** The language of our texts and of TaoUI components (calendar, slider) together. / Язык наших текстов и компонентов TaoUI вместе. */
export function setLocale(code: LocaleCode): void {
    i18n.setLocale(code);
    setTaoLocale(code === 'ru' ? localeRu : localeEn);
}

export function initLocale(): LocaleCode {
    const code = i18n.initLocale();
    setTaoLocale(code === 'ru' ? localeRu : localeEn);
    return code;
}
