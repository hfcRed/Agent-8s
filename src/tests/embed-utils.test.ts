import { faker } from '@faker-js/faker';
import { describe, expect, it } from 'vitest';
import {
	COLORS,
	MAX_PARTICIPANTS,
	STATUS_MESSAGES,
	WEAPON_ROLES,
} from '../constants.js';
import {
	createEventButtons,
	createEventEmbed,
	createEventStartedButtons,
	createRoleSelectMenu,
	updateEmbedField,
	updateEmbedFieldByMatch,
	updateParticipantFields,
} from '../utils/embed-utils.js';

describe('embed-utils', () => {
	describe('updateEmbedField', () => {
		it('should update existing field value', () => {
			const embed = createEventEmbed(
				faker.internet.username(),
				faker.image.avatar(),
				faker.string.uuid(),
				false,
			);

			updateEmbedField(embed, 'Status', 'Test Status');

			const statusField = embed.data.fields?.find((f) => f.name === 'Status');
			expect(statusField?.value).toBe('Test Status');
		});

		it('should not modify other fields', () => {
			const embed = createEventEmbed(
				faker.internet.username(),
				faker.image.avatar(),
				faker.string.uuid(),
				false,
			);

			const originalFieldCount = embed.data.fields?.length || 0;
			updateEmbedField(embed, 'Status', 'Test Status');

			expect(embed.data.fields?.length).toBe(originalFieldCount);
		});
	});

	describe('updateEmbedFieldByMatch', () => {
		it('should update field name and value when partial match found', () => {
			const embed = createEventEmbed(
				faker.internet.username(),
				faker.image.avatar(),
				faker.string.uuid(),
				false,
			);

			updateEmbedFieldByMatch(
				embed,
				'Participants',
				'Participants (5)',
				'New value',
			);

			const participantsField = embed.data.fields?.find((f) =>
				f.name.includes('Participants'),
			);
			expect(participantsField?.name).toBe('Participants (5)');
			expect(participantsField?.value).toBe('New value');
		});

		it('should not modify field if no match found', () => {
			const embed = createEventEmbed(
				faker.internet.username(),
				faker.image.avatar(),
				faker.string.uuid(),
				false,
			);

			const originalFields = JSON.parse(
				JSON.stringify(embed.data.fields || []),
			);
			updateEmbedFieldByMatch(embed, 'NonExistent', 'New Name', 'New Value');

			expect(JSON.stringify(embed.data.fields)).toBe(
				JSON.stringify(originalFields),
			);
		});
	});

	describe('createEventEmbed', () => {
		it('should create a casual event embed', () => {
			const username = faker.internet.username();
			const avatarUrl = faker.image.avatar();
			const userId = faker.string.uuid();

			const embed = createEventEmbed(username, avatarUrl, userId, true);

			expect(embed.data.title).toContain('[Casual]');
			expect(embed.data.author?.name).toBe(username);
			expect(embed.data.author?.icon_url).toBe(avatarUrl);
			expect(embed.data.color).toBe(Number.parseInt(COLORS.OPEN.slice(1), 16));
		});

		it('should create a competitive event embed', () => {
			const username = faker.internet.username();
			const avatarUrl = faker.image.avatar();
			const userId = faker.string.uuid();

			const embed = createEventEmbed(username, avatarUrl, userId, false);

			expect(embed.data.title).toContain('[Competitive]');
			expect(embed.data.color).toBe(Number.parseInt(COLORS.OPEN.slice(1), 16));
		});

		it('should include timer when timeInMinutes is provided', () => {
			const username = faker.internet.username();
			const avatarUrl = faker.image.avatar();
			const userId = faker.string.uuid();
			const timeInMinutes = 15;

			const embed = createEventEmbed(
				username,
				avatarUrl,
				userId,
				false,
				timeInMinutes,
			);

			const startField = embed.data.fields?.find((f) => f.name === 'Start');
			expect(startField?.value).toContain('<t:');
			expect(startField?.value).toContain(':R>');
		});

		it('should show sign-up message when no timer provided', () => {
			const username = faker.internet.username();
			const avatarUrl = faker.image.avatar();
			const userId = faker.string.uuid();

			const embed = createEventEmbed(username, avatarUrl, userId, false);

			const startField = embed.data.fields?.find((f) => f.name === 'Start');
			expect(startField?.value).toBe('👥 When 8 players have signed up');
		});

		it('should include description when info is provided', () => {
			const username = faker.internet.username();
			const avatarUrl = faker.image.avatar();
			const userId = faker.string.uuid();
			const info = faker.lorem.sentence();

			const embed = createEventEmbed(
				username,
				avatarUrl,
				userId,
				false,
				undefined,
				info,
			);

			expect(embed.data.description).toBe(info);
		});

		it('should not include description when info is not provided', () => {
			const username = faker.internet.username();
			const avatarUrl = faker.image.avatar();
			const userId = faker.string.uuid();

			const embed = createEventEmbed(username, avatarUrl, userId, false);

			expect(embed.data.description).toBeUndefined();
		});

		it('should include creator in participants', () => {
			const username = faker.internet.username();
			const avatarUrl = faker.image.avatar();
			const userId = faker.string.uuid();

			const embed = createEventEmbed(username, avatarUrl, userId, false);

			const participantsField = embed.data.fields?.find((f) =>
				f.name.includes('Participants'),
			);
			expect(participantsField?.value).toContain(`<@${userId}>`);
		});
	});

	describe('createEventButtons', () => {
		it('should create buttons without Start Now when no timer', () => {
			const row = createEventButtons();

			expect(row.components).toHaveLength(3);
			const json0 = row.components[0].toJSON() as { custom_id?: string };
			const json1 = row.components[1].toJSON() as { custom_id?: string };
			const json2 = row.components[2].toJSON() as { custom_id?: string };
			expect(json0.custom_id).toBe('signup');
			expect(json1.custom_id).toBe('signout');
			expect(json2.custom_id).toBe('cancel');
		});

		it('should create buttons with Start Now when timer provided', () => {
			const row = createEventButtons(15);

			expect(row.components).toHaveLength(4);
			const json3 = row.components[3].toJSON() as { custom_id?: string };
			expect(json3.custom_id).toBe('startnow');
		});

		it('should have correct button styles', () => {
			const row = createEventButtons(15);

			expect(row.components[0].data.style).toBe(1); // Primary
			expect(row.components[1].data.style).toBe(4); // Danger
			expect(row.components[2].data.style).toBe(2); // Secondary
			expect(row.components[3].data.style).toBe(3); // Success
		});
	});

	describe('createEventStartedButtons', () => {
		it('should create three buttons for started events', () => {
			const row = createEventStartedButtons();

			expect(row.components).toHaveLength(3);
			const json0 = row.components[0].toJSON() as { custom_id?: string };
			const json1 = row.components[1].toJSON() as { custom_id?: string };
			const json2 = row.components[2].toJSON() as { custom_id?: string };
			expect(json0.custom_id).toBe('dropin');
			expect(json1.custom_id).toBe('dropout');
			expect(json2.custom_id).toBe('finish');
		});
	});

	describe('createRoleSelectMenu', () => {
		it('should create select menu with all weapon roles', () => {
			const row = createRoleSelectMenu();

			expect(row.components).toHaveLength(1);
			const json = row.components[0].toJSON();
			expect(json.custom_id).toBe('select');
			expect(json.options).toHaveLength(WEAPON_ROLES.length);
		});

		it('should have options matching weapon roles', () => {
			const row = createRoleSelectMenu();
			const menu = row.components[0];
			const json = menu.toJSON();

			for (const role of WEAPON_ROLES) {
				const option = json.options?.find((o) => o.label === role);
				expect(option).toBeDefined();
				expect(option?.value).toBe(role.toLowerCase());
			}
		});
	});

	describe('updateParticipantFields', () => {
		it('should update participant count and list', () => {
			const embed = createEventEmbed(
				faker.internet.username(),
				faker.image.avatar(),
				faker.string.uuid(),
				false,
			);

			const participantMap = new Map([
				[
					faker.string.uuid(),
					{ userId: '1', role: WEAPON_ROLES[1], rank: null },
				],
				[
					faker.string.uuid(),
					{ userId: '2', role: WEAPON_ROLES[2], rank: null },
				],
			]);

			const timerData = {
				startTime: Date.now(),
				hasStarted: false,
			};

			updateParticipantFields(embed, participantMap, timerData, false);

			const participantsField = embed.data.fields?.find((f) =>
				f.name.includes('Participants'),
			);
			expect(participantsField?.name).toBe('Participants (2)');
			expect(participantsField?.value).toContain('<@1>');
			expect(participantsField?.value).toContain('<@2>');
		});

		it('should update roles field', () => {
			const embed = createEventEmbed(
				faker.internet.username(),
				faker.image.avatar(),
				faker.string.uuid(),
				false,
			);

			const participantMap = new Map([
				[
					faker.string.uuid(),
					{ userId: '1', role: WEAPON_ROLES[1], rank: null },
				],
				[
					faker.string.uuid(),
					{ userId: '2', role: WEAPON_ROLES[2], rank: null },
				],
			]);

			const timerData = {
				startTime: Date.now(),
				hasStarted: false,
			};

			updateParticipantFields(embed, participantMap, timerData, false);

			const roleField = embed.data.fields?.find((f) => f.name === 'Role');
			expect(roleField?.value).toContain(WEAPON_ROLES[1]);
			expect(roleField?.value).toContain(WEAPON_ROLES[2]);
		});

		it('should set status to READY when max participants reached', () => {
			const embed = createEventEmbed(
				faker.internet.username(),
				faker.image.avatar(),
				faker.string.uuid(),
				false,
			);

			const participantMap = new Map();
			for (let i = 0; i < MAX_PARTICIPANTS; i++) {
				participantMap.set(faker.string.uuid(), {
					userId: `${i}`,
					role: WEAPON_ROLES[0],
					rank: null,
				});
			}

			const timerData = {
				startTime: Date.now(),
				duration: 60000,
				hasStarted: false,
			};

			updateParticipantFields(embed, participantMap, timerData, false);

			const statusField = embed.data.fields?.find((f) => f.name === 'Status');
			expect(statusField?.value).toBe(STATUS_MESSAGES.READY);
		});

		it('should set status to FINALIZING when ready and timer expired', () => {
			const embed = createEventEmbed(
				faker.internet.username(),
				faker.image.avatar(),
				faker.string.uuid(),
				false,
			);

			const participantMap = new Map();
			for (let i = 0; i < MAX_PARTICIPANTS; i++) {
				participantMap.set(faker.string.uuid(), {
					userId: `${i}`,
					role: WEAPON_ROLES[0],
					rank: null,
				});
			}

			const timerData = {
				startTime: Date.now() - 10000,
				duration: 5000,
				hasStarted: false,
			};

			updateParticipantFields(embed, participantMap, timerData, false);

			const statusField = embed.data.fields?.find((f) => f.name === 'Status');
			expect(statusField?.value).toBe(STATUS_MESSAGES.FINALIZING);
			expect(embed.data.color).toBe(
				Number.parseInt(COLORS.FINALIZING.slice(1), 16),
			);
		});

		it('should not update status when isFinalizing is true', () => {
			const embed = createEventEmbed(
				faker.internet.username(),
				faker.image.avatar(),
				faker.string.uuid(),
				false,
			);

			const originalStatus = embed.data.fields?.find(
				(f) => f.name === 'Status',
			)?.value;

			const participantMap = new Map([
				[
					faker.string.uuid(),
					{ userId: '1', role: WEAPON_ROLES[1], rank: null },
				],
			]);

			const timerData = {
				startTime: Date.now(),
				hasStarted: false,
			};

			updateParticipantFields(embed, participantMap, timerData, true);

			const statusField = embed.data.fields?.find((f) => f.name === 'Status');
			expect(statusField?.value).toBe(originalStatus);
		});
	});
});
