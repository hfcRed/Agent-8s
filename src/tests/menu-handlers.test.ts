import { faker } from '@faker-js/faker';
import type {
	APISelectMenuOption,
	Message,
	StringSelectMenuComponent,
	StringSelectMenuInteraction,
	User,
} from 'discord.js';
import { EmbedBuilder } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ERROR_MESSAGES, WEAPON_ROLES } from '../constants.js';
import { EventManager } from '../event/event-manager.js';
import { handleRoleSelection } from '../interactions/menu-handlers.js';

vi.mock('../utils/embed-utils.js', () => ({
	updateParticipantFields: vi.fn(),
}));

vi.mock('../utils/helpers.js', () => ({
	getExcaliburRankOfUser: vi.fn(() => '5'),
}));

describe('handleRoleSelection', () => {
	let eventManager: EventManager;
	let interaction: StringSelectMenuInteraction;
	let mockMessage: Message;
	let mockUser: User;
	let mockEmbed: EmbedBuilder;

	beforeEach(() => {
		eventManager = new EventManager();

		mockUser = {
			id: faker.string.uuid(),
			username: 'TestUser',
		} as User;

		mockEmbed = new EmbedBuilder().setTitle('Test Event').setFields([
			{ name: 'Status', value: '⏰ Waiting...', inline: false },
			{ name: 'Participants', value: '1/8', inline: false },
		]);

		mockMessage = {
			id: faker.string.uuid(),
			channelId: faker.string.uuid(),
			embeds: [mockEmbed.toJSON()],
		} as Message;

		const mockOption: APISelectMenuOption = {
			label: 'Sword',
			value: 'sword',
		};

		interaction = {
			user: mockUser,
			message: mockMessage,
			values: ['sword'],
			component: {
				options: [mockOption],
			} as unknown as StringSelectMenuComponent,
			deferUpdate: vi.fn(),
			followUp: vi.fn(),
			editReply: vi.fn(),
		} as unknown as StringSelectMenuInteraction;
	});

	it('should allow participant to change role', async () => {
		eventManager.setParticipants(
			mockMessage.id,
			new Map([
				[
					mockUser.id,
					{ userId: mockUser.id, role: WEAPON_ROLES[0], rank: null },
				],
			]),
		);
		eventManager.setTimer(mockMessage.id, {
			startTime: Date.now(),
			hasStarted: false,
		});

		await handleRoleSelection(interaction, eventManager);

		expect(interaction.deferUpdate).toHaveBeenCalled();
		const participants = eventManager.getParticipants(mockMessage.id);
		const participant = participants?.get(mockUser.id);
		expect(participant?.role).toBe('Sword');
	});

	it('should prevent non-participant from selecting role', async () => {
		eventManager.setParticipants(mockMessage.id, new Map());

		await handleRoleSelection(interaction, eventManager);

		expect(interaction.followUp).toHaveBeenCalledWith({
			content: ERROR_MESSAGES.NOT_SIGNED_UP,
			flags: ['Ephemeral'],
		});
	});

	it('should update embed after role change', async () => {
		eventManager.setParticipants(
			mockMessage.id,
			new Map([
				[
					mockUser.id,
					{ userId: mockUser.id, role: WEAPON_ROLES[0], rank: null },
				],
			]),
		);
		eventManager.setTimer(mockMessage.id, {
			startTime: Date.now(),
			hasStarted: false,
		});

		await handleRoleSelection(interaction, eventManager);

		expect(interaction.editReply).toHaveBeenCalledWith({
			embeds: [expect.any(EmbedBuilder)],
		});
	});

	it('should handle role selection when event is finalizing', async () => {
		const finalizingEmbed = new EmbedBuilder()
			.setTitle('Test Event')
			.setFields([
				{ name: 'Status', value: '⏳ Finalizing...', inline: false },
				{ name: 'Participants', value: '8/8', inline: false },
			]);

		mockMessage.embeds = [finalizingEmbed.toJSON()] as Message['embeds'];

		eventManager.setParticipants(
			mockMessage.id,
			new Map([
				[
					mockUser.id,
					{ userId: mockUser.id, role: WEAPON_ROLES[0], rank: null },
				],
			]),
		);
		eventManager.setTimer(mockMessage.id, {
			startTime: Date.now(),
			hasStarted: false,
		});

		await handleRoleSelection(interaction, eventManager);

		expect(interaction.editReply).toHaveBeenCalled();
	});

	it('should handle role selection with different weapons', async () => {
		const weapons = ['Sword', 'Bow', 'Staff'];

		for (const weapon of weapons) {
			const weaponOption: APISelectMenuOption = {
				label: weapon,
				value: weapon.toLowerCase(),
			};

			// Re-create interaction with new component for each weapon
			interaction = {
				...interaction,
				values: [weapon.toLowerCase()],
				component: {
					options: [weaponOption],
				} as unknown as StringSelectMenuComponent,
			} as unknown as StringSelectMenuInteraction;

			eventManager.setParticipants(
				mockMessage.id,
				new Map([
					[
						mockUser.id,
						{ userId: mockUser.id, role: WEAPON_ROLES[0], rank: null },
					],
				]),
			);
			eventManager.setTimer(mockMessage.id, {
				startTime: Date.now(),
				hasStarted: false,
			});

			await handleRoleSelection(interaction, eventManager);

			const participants = eventManager.getParticipants(mockMessage.id);
			const participant = participants?.get(mockUser.id);
			expect(participant?.role).toBe(weapon);
		}
	});

	it('should return early if no participant map exists', async () => {
		await handleRoleSelection(interaction, eventManager);

		expect(interaction.deferUpdate).not.toHaveBeenCalled();
	});

	it('should return early if no timer data exists', async () => {
		eventManager.setParticipants(
			mockMessage.id,
			new Map([
				[
					mockUser.id,
					{ userId: mockUser.id, role: WEAPON_ROLES[0], rank: null },
				],
			]),
		);

		await handleRoleSelection(interaction, eventManager);

		expect(interaction.editReply).not.toHaveBeenCalled();
	});

	it('should use fallback value if option label not found', async () => {
		// Re-create interaction with empty options
		interaction = {
			...interaction,
			component: {
				options: [],
			} as unknown as StringSelectMenuComponent,
			values: ['unknown'],
		} as unknown as StringSelectMenuInteraction;

		eventManager.setParticipants(
			mockMessage.id,
			new Map([
				[
					mockUser.id,
					{ userId: mockUser.id, role: WEAPON_ROLES[0], rank: null },
				],
			]),
		);
		eventManager.setTimer(mockMessage.id, {
			startTime: Date.now(),
			hasStarted: false,
		});

		await handleRoleSelection(interaction, eventManager);

		const participants = eventManager.getParticipants(mockMessage.id);
		const participant = participants?.get(mockUser.id);
		expect(participant?.role).toBe('unknown');
	});

	it('should preserve user rank when changing role', async () => {
		const initialRank = '3';
		eventManager.setParticipants(
			mockMessage.id,
			new Map([
				[
					mockUser.id,
					{ userId: mockUser.id, role: WEAPON_ROLES[0], rank: initialRank },
				],
			]),
		);
		eventManager.setTimer(mockMessage.id, {
			startTime: Date.now(),
			hasStarted: false,
		});

		await handleRoleSelection(interaction, eventManager);

		const participants = eventManager.getParticipants(mockMessage.id);
		const participant = participants?.get(mockUser.id);
		expect(participant?.rank).toBe('5'); // From mocked helper
	});
});
