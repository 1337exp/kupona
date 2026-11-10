import ru from './ru';
import en from './en';

export const LOCALES = { ru, en } as const;

export type LocaleCode = keyof typeof LOCALES;
export const LOCALE_CODES = Object.keys(LOCALES) as LocaleCode[];

/** Language names in their own language, never translated. / Названия языков на самих языках. */
export const LOCALE_NAMES: Record<LocaleCode, string> = { ru: 'Русский', en: 'English' };

export const FALLBACK_LOCALE: LocaleCode = 'en';
