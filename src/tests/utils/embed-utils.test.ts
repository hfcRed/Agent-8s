import { EmbedBuilder } from 'discord.js';
import { describe, expect, it } from 'vitest';
import {
	COLORS,
	FIELD_NAMES,
	MAX_PARTICIPANTS,
	PARTICIPANT_FIELD_NAME,
	STATUS_MESSAGES,
	WEAPON_ROLES,
} from '../../constants.js';
import type { EventTimer, ParticipantMap } from '../../event/event-manager.js';
import {
	createEventButtons,
	createEventEmbed,
	createEventStartedButtons,
	createRoleSelectMenu,
	updateEmbedField,
	updateEmbedFieldByMatch,
	updateParticipantFields,
} from '../../utils/embed-utils.js';

describe('embed-utils', () => {
	describe('updateEmbedField', () => {
		it('should update an existing field value', () => {
			const embed = new EmbedBuilder().addFields({
				name: 'Test Field',
				value: 'Old Value',
			});

			updateEmbedField(embed, 'Test Field', 'New Value');

			const fields = embed.data.fields || [];
			const field = fields.find((f) => f.name === 'Test Field');
			expect(field?.value).toBe('New Value');
		});

		it('should not modify non-matching fields', () => {
			const embed = new EmbedBuilder().addFields(
				{ name: 'Field 1', value: 'Value 1' },
				{ name: 'Field 2', value: 'Value 2' },
			);

			updateEmbedField(embed, 'Field 1', 'Updated');

			const fields = embed.data.fields || [];
			expect(fields.find((f) => f.name === 'Field 1')?.value).toBe('Updated');
			expect(fields.find((f) => f.name === 'Field 2')?.value).toBe('Value 2');
		});

		it('should handle missing field gracefully', () => {
			const embed = new EmbedBuilder().addFields({
				name: 'Existing',
				value: 'Value',
			});

			updateEmbedField(embed, 'Non-Existent', 'New');

			const fields = embed.data.fields || [];
			expect(fields.length).toBe(1);
			expect(fields[0].value).toBe('Value');
		});
	});

	describe('updateEmbedFieldByMatch', () => {
		it('should update field matching partial name', () => {
			const embed = new EmbedBuilder().addFields({
				name: 'Participants (2)',
				value: 'List',
			});

			updateEmbedFieldByMatch(
				embed,
				'Participants',
				'Participants (3)',
				'- @user1\n- @user2\n- @user3',
			);

			const fields = embed.data.fields || [];
			const field = fields[0];
			expect(field.name).toBe('Participants (3)');
			expect(field.value).toBe('- @user1\n- @user2\n- @user3');
		});

		it('should not update non-matching fields', () => {
			const embed = new EmbedBuilder().addFields(
				{ name: 'Status', value: 'Open' },
				{ name: 'Role', value: 'None' },
			);

			updateEmbedFieldByMatch(
				embed,
				'Participants',
				'Participants (1)',
				'@user',
			);

			const fields = embed.data.fields || [];
			expect(fields[0].name).toBe('Status');
			expect(fields[1].name).toBe('Role');
		});
	});

	describe('createEventEmbed', () => {
		it('should create embed with all required fields for casual event', () => {
			const embed = createEventEmbed(
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
				'TestUser',
				'https://example.com/avatar.png',
				'123456789',
				false,
			);

			expect(embed.data.title).toContain('Competitive');
		});

		it('should include timer information when provided', () => {
			const embed = createEventEmbed(
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
		it('should create three buttons for started events', () => {
			const row = createEventStartedButtons();

			expect(row.components.length).toBe(3);
			const customIds = row.components.map((c) => {
				const data = c.data as { custom_id?: string };
				return data.custom_id;
			});
			expect(customIds).toContain('dropin');
			expect(customIds).toContain('dropout');
			expect(customIds).toContain('finish');
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

	describe('updateParticipantFields', () => {
		it('should update participant count and list', () => {
			const embed = new EmbedBuilder().addFields(
				{ name: PARTICIPANT_FIELD_NAME(1), value: '- <@user1>' },
				{ name: FIELD_NAMES.ROLE, value: '- None' },
				{ name: FIELD_NAMES.STATUS, value: STATUS_MESSAGES.OPEN },
			);

			const participantMap: ParticipantMap = new Map([
				['user1', { userId: 'user1', role: 'Slayer', rank: null }],
				['user2', { userId: 'user2', role: 'Support', rank: null }],
			]);

			const timerData: EventTimer = {
				startTime: Date.now(),
				duration: undefined,
				hasStarted: false,
			};

			updateParticipantFields(embed, participantMap, timerData, false);

			const fields = embed.data.fields || [];
			const participantField = fields.find((f) =>
				f.name.includes('Participants'),
			);
			expect(participantField?.name).toBe(PARTICIPANT_FIELD_NAME(2));
			expect(participantField?.value).toContain('user1');
			expect(participantField?.value).toContain('user2');
		});

		it('should update status to ready when full', () => {
			const embed = new EmbedBuilder().addFields(
				{ name: PARTICIPANT_FIELD_NAME(1), value: '- <@user1>' },
				{ name: FIELD_NAMES.ROLE, value: '- None' },
				{ name: FIELD_NAMES.STATUS, value: STATUS_MESSAGES.OPEN },
			);

			const participantMap: ParticipantMap = new Map();
			for (let i = 0; i < MAX_PARTICIPANTS; i++) {
				participantMap.set(`user${i}`, {
					userId: `user${i}`,
					role: 'None',
					rank: null,
				});
			}

			const timerData: EventTimer = {
				startTime: Date.now(),
				duration: 10 * 60 * 1000,
				hasStarted: false,
			};

			updateParticipantFields(embed, participantMap, timerData, false);

			const fields = embed.data.fields || [];
			const statusField = fields.find((f) => f.name === FIELD_NAMES.STATUS);

			expect([STATUS_MESSAGES.READY, STATUS_MESSAGES.FINALIZING]).toContain(
				statusField?.value,
			);
		});

		it('should set finalizing color and status when full and timer expired', () => {
			const embed = new EmbedBuilder().addFields(
				{ name: PARTICIPANT_FIELD_NAME(1), value: '- <@user1>' },
				{ name: FIELD_NAMES.ROLE, value: '- None' },
				{ name: FIELD_NAMES.STATUS, value: STATUS_MESSAGES.OPEN },
			);

			const participantMap: ParticipantMap = new Map();
			for (let i = 0; i < MAX_PARTICIPANTS; i++) {
				participantMap.set(`user${i}`, {
					userId: `user${i}`,
					role: 'None',
					rank: null,
				});
			}

			const timerData: EventTimer = {
				startTime: Date.now() - 20 * 60 * 1000,
				duration: 10 * 60 * 1000,
				hasStarted: false,
			};

			updateParticipantFields(embed, participantMap, timerData, false);

			expect(embed.data.color).toBe(parseInt(COLORS.FINALIZING.slice(1), 16));
			const fields = embed.data.fields || [];
			const statusField = fields.find((f) => f.name === FIELD_NAMES.STATUS);
			expect(statusField?.value).toBe(STATUS_MESSAGES.FINALIZING);
		});

		it('should not update status when finalizing', () => {
			const embed = new EmbedBuilder().addFields(
				{ name: PARTICIPANT_FIELD_NAME(1), value: '- <@user1>' },
				{ name: FIELD_NAMES.ROLE, value: '- None' },
				{ name: FIELD_NAMES.STATUS, value: STATUS_MESSAGES.FINALIZING },
			);

			const participantMap: ParticipantMap = new Map([
				['user1', { userId: 'user1', role: 'None', rank: null }],
			]);

			const timerData: EventTimer = {
				startTime: Date.now(),
				duration: undefined,
				hasStarted: false,
			};

			updateParticipantFields(embed, participantMap, timerData, true);

			const fields = embed.data.fields || [];
			const statusField = fields.find((f) => f.name === FIELD_NAMES.STATUS);
			expect(statusField?.value).toBe(STATUS_MESSAGES.FINALIZING);
		});

		it('should update roles alongside participants', () => {
			const embed = new EmbedBuilder().addFields(
				{ name: PARTICIPANT_FIELD_NAME(1), value: '- <@user1>' },
				{ name: FIELD_NAMES.ROLE, value: '- None' },
				{ name: FIELD_NAMES.STATUS, value: STATUS_MESSAGES.OPEN },
			);

			const participantMap: ParticipantMap = new Map([
				['user1', { userId: 'user1', role: '🔪 Slayer', rank: null }],
				['user2', { userId: 'user2', role: '🛡️ Support', rank: null }],
			]);

			const timerData: EventTimer = {
				startTime: Date.now(),
				duration: undefined,
				hasStarted: false,
			};

			updateParticipantFields(embed, participantMap, timerData, false);

			const fields = embed.data.fields || [];
			const roleField = fields.find((f) => f.name === FIELD_NAMES.ROLE);
			expect(roleField?.value).toContain('🔪 Slayer');
			expect(roleField?.value).toContain('🛡️ Support');
		});
	});
});
