import { en } from './locales/en.js';
import { ja } from './locales/ja.js';
import type { Dictionary } from './types.js';

export type { Dictionary } from './types.js';

export const LOCALES = ['en', 'ja'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

const dictionaries: Record<Locale, Dictionary> = { en, ja };

export function t(locale: Locale) {
	return dictionaries[locale];
}

export function resolveLocale(discordLocale: string | null | undefined) {
	if (!discordLocale) return DEFAULT_LOCALE;

	const language = discordLocale.split('-')[0].toLowerCase();

	return (LOCALES as readonly string[]).includes(language)
		? (language as Locale)
		: DEFAULT_LOCALE;
}
