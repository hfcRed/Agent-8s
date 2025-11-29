import { describe, expect, it } from 'vitest';
import {
	COLORS,
	FIELD_NAMES,
	PARTICIPANT_FIELD_NAME,
	WEAPON_ROLES,
} from '../../constants.js';
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
			);

			expect(embed.data.author?.name).toBe('TestUser');
			expect(embed.data.author?.icon_url).toBe(
				'https://example.com/avatar.png',
			);
			expect(embed.data.title).toContain('Casual');
			expect(embed.data.color).toBe(parseInt(COLORS.OPEN.slice(1), 16));

			const fields = embed.data.fields || [];
			expect(fields.length).toBe(4);
			expect(fields[0].name).toBe(PARTICIPANT_FIELD_NAME(1));
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
				10,
			);

			const fields = embed.data.fields || [];
			const startField = fields.find((f) => f.name === FIELD_NAMES.START);
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
			);

			const fields = embed.data.fields || [];
			const roleField = fields.find((f) => f.name === FIELD_NAMES.ROLE);
			expect(roleField?.value).toContain(WEAPON_ROLES[0]);
		});
	});

	describe('createEventButtons', () => {
		it('should create basic buttons without timer', () => {
			const row = createEventButtons();

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
			const row = createEventButtons(15);

			expect(row.components.length).toBe(4);
			const customIds = row.components.map((c) => {
				const data = c.data as { custom_id?: string };
				return data.custom_id;
			});
			expect(customIds).toContain('startnow');
		});

		it('should have correct button styles', () => {
			const row = createEventButtons();

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
		it('should create two button rows for started events with spectate buttons', () => {
			const rows = createEventStartedButtons();

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
	});

	describe('createRoleSelectMenu', () => {
		it('should create select menu with all weapon roles', () => {
			const row = createRoleSelectMenu();

			const selectMenu = row.components[0];
			expect(selectMenu.data.custom_id).toBe('select');
			expect(selectMenu.options.length).toBe(WEAPON_ROLES.length);
		});

		it('should have placeholder text', () => {
			const row = createRoleSelectMenu();

			const selectMenu = row.components[0];
			expect(selectMenu.data.placeholder).toBeTruthy();
		});
	});
});
