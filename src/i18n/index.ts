import { en } from './locales/en.js';
import { ja } from './locales/ja.js';
import type { Dictionary } from './types.js';

export type { Dictionary } from './types.js';

export const LOCALES = ['en', 'ja'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

export const LOCALE_NAMES: Record<Locale, string> = {
	en: 'English',
	ja: '日本語',
};

const dictionaries: Record<Locale, Dictionary> = { en, ja };

export function t(locale: Locale) {
	return dictionaries[locale];
}

export function isLocale(value: string): value is Locale {
	return (LOCALES as readonly string[]).includes(value);
}

export function resolveLocale(discordLocale: string | null | undefined) {
	if (!discordLocale) return DEFAULT_LOCALE;

	const language = discordLocale.split('-')[0].toLowerCase();

	return isLocale(language) ? language : DEFAULT_LOCALE;
}
