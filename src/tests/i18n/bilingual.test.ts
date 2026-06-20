import { describe, expect, it } from 'vitest';
import { getEventDictionary } from '../../i18n/bilingual.js';
import { t } from '../../i18n/index.js';

describe('getEventDictionary', () => {
	it('returns the primary dictionary when no secondary locale is given', () => {
		expect(getEventDictionary('en')).toBe(t('en'));
	});

	it('returns the primary dictionary when secondary equals primary', () => {
		expect(getEventDictionary('ja', 'ja')).toBe(t('ja'));
	});

	describe('with a distinct secondary locale', () => {
		const dict = getEventDictionary('en', 'ja');

		it('appends the secondary inline for single-line labels', () => {
			expect(dict.buttons.signUp).toBe('Sign Up (参加)');
			expect(dict.select.placeholder).toBe(
				`${t('en').select.placeholder} (${t('ja').select.placeholder})`,
			);
		});

		it('appends the secondary on a new line for multi-line field values', () => {
			expect(dict.status.open).toBe(
				`${t('en').status.open}\n(${t('ja').status.open})`,
			);
			expect(dict.status.open).toContain('\n(');
		});

		it('combines interpolated (function) leaves', () => {
			expect(dict.roles.slayer).toBe('🔪 Slayer (🔪 スレイヤー)');
			expect(dict.fields.participantsCount(3)).toBe(
				'Participants (3) (参加者 (3))',
			);
		});

		it('does not duplicate locale-independent leaves', () => {
			// Both locales render the same emoji + Discord timestamp token.
			const combined = dict.start.atTime(1700000000000);
			expect(combined).toBe(t('en').start.atTime(1700000000000));
			expect(combined).not.toContain('\n(');
			expect(combined).not.toContain(') (');
		});

		it('keeps the same dictionary shape as a single locale', () => {
			expect(Object.keys(dict)).toEqual(Object.keys(t('en')));
		});
	});
});
