import { type Locale, t } from './index.js';
import type { Dictionary } from './types.js';

const MULTILINE_GROUPS = new Set<keyof Dictionary>([
	'fields',
	'titles',
	'status',
	'start',
	'reping',
	'ownership',
]);

function combine(primary: string, secondary: string, multiline: boolean) {
	if (primary === secondary) return primary;
	return multiline ? `${primary}\n${secondary}` : `${primary} (${secondary})`;
}

function combineNode(primary: unknown, secondary: unknown, multiline: boolean) {
	if (typeof primary === 'string') {
		return combine(primary, secondary as string, multiline);
	}

	if (typeof primary === 'function') {
		const primaryFn = primary as (...args: unknown[]) => string;
		const secondaryFn = secondary as (...args: unknown[]) => string;
		return (...args: unknown[]) =>
			combine(primaryFn(...args), secondaryFn(...args), multiline);
	}

	const out: Record<string, unknown> = {};
	for (const key of Object.keys(primary as Record<string, unknown>)) {
		out[key] = combineNode(
			(primary as Record<string, unknown>)[key],
			(secondary as Record<string, unknown>)[key],
			multiline,
		);
	}
	return out;
}

function buildBilingualDictionary(primary: Dictionary, secondary: Dictionary) {
	const out: Record<string, unknown> = {};
	for (const group of Object.keys(primary) as (keyof Dictionary)[]) {
		out[group] = combineNode(
			primary[group],
			secondary[group],
			MULTILINE_GROUPS.has(group),
		);
	}
	return out as Dictionary;
}

export function getEventDictionary(primary: Locale, secondary?: Locale) {
	if (!secondary || secondary === primary) return t(primary);
	return buildBilingualDictionary(t(primary), t(secondary));
}
