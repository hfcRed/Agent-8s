import { type Locale, t } from './index.js';
import type { Dictionary } from './types.js';

type CombineMode = 'inline' | 'multiline' | 'list';

const MULTILINE_GROUPS = new Set<keyof Dictionary>([
	'fields',
	'titles',
	'status',
	'start',
	'reping',
	'ownership',
]);

function modeForGroup(group: keyof Dictionary) {
	if (group === 'roles') return 'list';
	if (MULTILINE_GROUPS.has(group)) return 'multiline';
	return 'inline';
}

function combine(primary: string, secondary: string, mode: CombineMode) {
	if (primary === secondary) return primary;
	switch (mode) {
		case 'list':
			return `${primary}\n- ${secondary}`;
		case 'multiline':
			return `${primary}\n${secondary}`;
		default:
			return `${primary} (${secondary})`;
	}
}

function combineNode(primary: unknown, secondary: unknown, mode: CombineMode) {
	if (typeof primary === 'string') {
		return combine(primary, secondary as string, mode);
	}

	if (typeof primary === 'function') {
		const primaryFn = primary as (...args: unknown[]) => string;
		const secondaryFn = secondary as (...args: unknown[]) => string;
		return (...args: unknown[]) =>
			combine(primaryFn(...args), secondaryFn(...args), mode);
	}

	const out: Record<string, unknown> = {};
	for (const key of Object.keys(primary as Record<string, unknown>)) {
		out[key] = combineNode(
			(primary as Record<string, unknown>)[key],
			(secondary as Record<string, unknown>)[key],
			mode,
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
			modeForGroup(group),
		);
	}
	return out as Dictionary;
}

export function getEventDictionary(primary: Locale, secondary?: Locale) {
	if (!secondary || secondary === primary) return t(primary);
	return buildBilingualDictionary(t(primary), t(secondary));
}

export function isBilingual(dict: Dictionary) {
	return dict.roles.none.includes('\n');
}
