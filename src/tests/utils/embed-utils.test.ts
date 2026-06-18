import { describe, expect, it } from 'vitest';
import { COLORS, ROLE_KEYS } from '../../constants.js';
import { t } from '../../i18n/index.js';
import {
	createEventButtons,
	createEventEmbed,
	createEventStartedButtons,
	createRoleSelectMenu,
} from '../../utils/embed-utils.js';

describe('embed-utils', () => {
	describe('createEventEmbed', () => {
		it('should create embed with all required fields for casual event', () => {
			const embed = createEventEmbed(
				null,
				null,
				'TestUser',
				'https://example.com/avatar.png',
				'123456789',
				true,
				'en',
			);

			expect(embed.data.author?.name).toBe('TestUser');
			expect(embed.data.author?.icon_url).toBe(
				'https://example.com/avatar.png',
			);
			expect(embed.data.title).toContain('Casual');
			expect(embed.data.color).toBe(parseInt(COLORS.OPEN.slice(1), 16));

			const fields = embed.data.fields || [];
			expect(fields.length).toBe(4);
			expect(fields[0].name).toBe(t('en').fields.participantsCount(1));
			expect(fields[0].value).toContain('123456789');
		});

		it('should create embed with all required fields for competitive event', () => {
			const embed = createEventEmbed(
				null,
				null,
				'TestUser',
				'https://example.com/avatar.png',
				'123456789',
				false,
				'en',
			);

			expect(embed.data.title).toContain('Competitive');
		});

		it('should include timer information when provided', () => {
			const embed = createEventEmbed(
				null,
				null,
				'TestUser',
				'https://example.com/avatar.png',
				'123456789',
				true,
				'en',
				10,
			);

			const fields = embed.data.fields || [];
			const startField = fields.find((f) => f.name === t('en').fields.start);
			expect(startField?.value).toContain('<t:');
		});

		it('should include description when info is provided', () => {
			const embed = createEventEmbed(
				null,
				null,
				'TestUser',
				'https://example.com/avatar.png',
				'123456789',
				true,
				'en',
				undefined,
				'Custom event info',
			);

			expect(embed.data.description).toBe('Custom event info');
		});

		it('should set default weapon role', () => {
			const embed = createEventEmbed(
				null,
				null,
				'TestUser',
				'https://example.com/avatar.png',
				'123456789',
				true,
				'en',
			);

			const fields = embed.data.fields || [];
			const roleField = fields.find((f) => f.name === t('en').fields.role);
			expect(roleField?.value).toContain(t('en').roles.none);
		});
	});

	describe('createEventButtons', () => {
		it('should create basic buttons without timer', () => {
			const row = createEventButtons('en');

			expect(row.components.length).toBe(3);
			const customIds = row.components.map((c) => {
				const data = c.data as { custom_id?: string };
				return data.custom_id;
			});
			expect(customIds).toContain('signup');
			expect(customIds).toContain('signout');
			expect(customIds).toContain('cancel');
		});

		it('should include start now button when timer is provided', () => {
			const row = createEventButtons('en', 15);

			expect(row.components.length).toBe(4);
			const customIds = row.components.map((c) => {
				const data = c.data as { custom_id?: string };
				return data.custom_id;
			});
			expect(customIds).toContain('startnow');
		});

		it('should have correct button styles', () => {
			const row = createEventButtons('en');

			const signupButton = row.components.find((c) => {
				const data = c.data as { custom_id?: string };
				return data.custom_id === 'signup';
			});
			const signoutButton = row.components.find((c) => {
				const data = c.data as { custom_id?: string };
				return data.custom_id === 'signout';
			});
			const cancelButton = row.components.find((c) => {
				const data = c.data as { custom_id?: string };
				return data.custom_id === 'cancel';
			});

			expect(signupButton?.data.style).toBe(1);
			expect(signoutButton?.data.style).toBe(4);
			expect(cancelButton?.data.style).toBe(2);
		});
	});

	describe('createEventStartedButtons', () => {
		it('should create two button rows for started events with spectate buttons enabled', () => {
			const rows = createEventStartedButtons('en', true);

			expect(rows.length).toBe(2);

			// First row should have 5 buttons
			expect(rows[0].components.length).toBe(5);
			const row1CustomIds = rows[0].components.map((c) => {
				const data = c.data as { custom_id?: string };
				return data.custom_id;
			});
			expect(row1CustomIds).toContain('dropin');
			expect(row1CustomIds).toContain('dropout');
			expect(row1CustomIds).toContain('joinqueue');
			expect(row1CustomIds).toContain('leavequeue');
			expect(row1CustomIds).toContain('finish');

			// Second row should have 2 spectate buttons
			expect(rows[1].components.length).toBe(2);
			const row2CustomIds = rows[1].components.map((c) => {
				const data = c.data as { custom_id?: string };
				return data.custom_id;
			});
			expect(row2CustomIds).toContain('spectate');
			expect(row2CustomIds).toContain('stopspectating');
		});

		it('should create one button row when spectators are disabled', () => {
			const rows = createEventStartedButtons('en', false);

			expect(rows.length).toBe(1);

			// Only row should have 5 buttons (no spectate buttons)
			expect(rows[0].components.length).toBe(5);
			const customIds = rows[0].components.map((c) => {
				const data = c.data as { custom_id?: string };
				return data.custom_id;
			});
			expect(customIds).toContain('dropin');
			expect(customIds).toContain('dropout');
			expect(customIds).toContain('joinqueue');
			expect(customIds).toContain('leavequeue');
			expect(customIds).toContain('finish');
			expect(customIds).not.toContain('spectate');
			expect(customIds).not.toContain('stopspectating');
		});

		it('should default to spectators disabled when no parameter provided', () => {
			const rows = createEventStartedButtons('en');

			expect(rows.length).toBe(1);
		});
	});

	describe('createRoleSelectMenu', () => {
		it('should create select menu with all weapon roles', () => {
			const row = createRoleSelectMenu('en');

			const selectMenu = row.components[0];
			expect(selectMenu.data.custom_id).toBe('select');
			expect(selectMenu.options.length).toBe(ROLE_KEYS.length);
		});

		it('should have placeholder text', () => {
			const row = createRoleSelectMenu('en');

			const selectMenu = row.components[0];
			expect(selectMenu.data.placeholder).toBeTruthy();
		});
	});
});
