import { faker } from '@faker-js/faker';
import type {
	APIEmbedField,
	ButtonInteraction,
	Client,
	GuildMember,
	Message,
	TextChannel,
	User,
} from 'discord.js';
import { EmbedBuilder } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	COLORS,
	ERROR_MESSAGES,
	MAX_PARTICIPANTS,
	WEAPON_ROLES,
} from '../constants.js';
import { EventManager } from '../event/event-manager.js';
import {
	checkProcessingStates,
	handleCancelButton,
	handleDropInButton,
	handleDropOutButton,
	handleFinishButton,
	handleSignOutButton,
	handleSignUpButton,
	handleStartNowButton,
} from '../interactions/button-handlers.js';
import type { ThreadManager } from '../managers/thread-manager.js';
import type { VoiceChannelManager } from '../managers/voice-channel-manager.js';
import type { TelemetryService } from '../telemetry/telemetry.js';

vi.mock('../event/event-lifecycle.js', () => ({
	createEventStartTimeout: vi.fn(),
	startEvent: vi.fn(),
	cleanupEvent: vi.fn(),
}));

vi.mock('../utils/embed-utils.js', () => ({
	updateEmbedField: vi.fn((embed, name, value) => {
		const field = embed.data.fields?.find(
			(f: APIEmbedField) => f.name === name,
		);
		if (field) field.value = value;
		return embed;
	}),
	updateParticipantFields: vi.fn(),
}));

vi.mock('../utils/helpers.js', () => ({
	getExcaliburRankOfUser: vi.fn(() => '5'),
	isUserAdmin: vi.fn(() => false),
}));

describe('Button Handlers', () => {
	let eventManager: EventManager;
	let threadManager: ThreadManager;
	let voiceChannelManager: VoiceChannelManager;
	let telemetry: TelemetryService;
	let appClient: Client;
	let interaction: ButtonInteraction;
	let mockMessage: Message;
	let mockUser: User;
	let mockEmbed: EmbedBuilder;

	beforeEach(() => {
		eventManager = new EventManager();
		threadManager = {
			fetchThread: vi.fn(),
			addMember: vi.fn(),
			removeMember: vi.fn(),
		} as unknown as ThreadManager;
		voiceChannelManager = {
			grantAccessToChannels: vi.fn(),
			revokeAccessFromChannels: vi.fn(),
		} as unknown as VoiceChannelManager;
		telemetry = {
			trackUserSignUp: vi.fn(),
			trackUserSignOut: vi.fn(),
			trackEventCancelled: vi.fn(),
			trackEventFinished: vi.fn(),
			trackUserDropOut: vi.fn(),
			trackUserDropIn: vi.fn(),
		} as unknown as TelemetryService;
		appClient = {} as Client;

		mockUser = {
			id: faker.string.uuid(),
			username: 'TestUser',
		} as User;

		mockEmbed = new EmbedBuilder()
			.setTitle('Test Event')
			.setColor(COLORS.OPEN)
			.setFields([
				{ name: 'Status', value: '⏰ Waiting...', inline: false },
				{ name: 'Participants', value: '1/8', inline: false },
			]);

		mockMessage = {
			id: faker.string.uuid(),
			channelId: faker.string.uuid(),
			embeds: [mockEmbed.toJSON()],
		} as Message;

		interaction = {
			user: mockUser,
			message: mockMessage,
			guild: { id: faker.string.uuid() },
			channelId: faker.string.uuid(),
			member: {
				roles: { cache: new Map() },
			} as unknown as GuildMember,
			channel: {} as TextChannel,
			deferUpdate: vi.fn(),
			followUp: vi.fn(),
			editReply: vi.fn(),
			reply: vi.fn(),
		} as unknown as ButtonInteraction;
	});

	describe('handleSignUpButton', () => {
		beforeEach(() => {
			eventManager.setParticipants(mockMessage.id, new Map());
			eventManager.setTimer(mockMessage.id, {
				startTime: Date.now(),
				hasStarted: false,
			});
		});

		it('should allow user to sign up', async () => {
			await handleSignUpButton(
				interaction,
				eventManager,
				threadManager,
				voiceChannelManager,
				telemetry,
			);

			expect(interaction.deferUpdate).toHaveBeenCalled();
			const participants = eventManager.getParticipants(mockMessage.id);
			expect(participants?.has(mockUser.id)).toBe(true);
		});

		it('should prevent sign up if event is full', async () => {
			const fullMap = new Map();
			for (let i = 0; i < MAX_PARTICIPANTS; i++) {
				fullMap.set(`user${i}`, {
					userId: `user${i}`,
					role: WEAPON_ROLES[0],
					rank: null,
				});
			}
			eventManager.setParticipants(mockMessage.id, fullMap);

			await handleSignUpButton(
				interaction,
				eventManager,
				threadManager,
				voiceChannelManager,
				telemetry,
			);

			expect(interaction.followUp).toHaveBeenCalledWith({
				content: ERROR_MESSAGES.EVENT_FULL,
				flags: ['Ephemeral'],
			});
		});

		it('should prevent sign up if already in another event', async () => {
			const otherEventId = faker.string.uuid();
			eventManager.setParticipants(
				otherEventId,
				new Map([
					[
						mockUser.id,
						{ userId: mockUser.id, role: WEAPON_ROLES[0], rank: null },
					],
				]),
			);

			await handleSignUpButton(
				interaction,
				eventManager,
				threadManager,
				voiceChannelManager,
				telemetry,
			);

			expect(interaction.followUp).toHaveBeenCalledWith({
				content: ERROR_MESSAGES.ALREADY_SIGNED_UP,
				flags: ['Ephemeral'],
			});
		});

		it('should track sign up with telemetry', async () => {
			eventManager.setMatchId(mockMessage.id, faker.string.uuid());

			await handleSignUpButton(
				interaction,
				eventManager,
				threadManager,
				voiceChannelManager,
				telemetry,
			);

			expect(telemetry.trackUserSignUp).toHaveBeenCalled();
		});
	});

	describe('handleSignOutButton', () => {
		beforeEach(() => {
			eventManager.setParticipants(
				mockMessage.id,
				new Map([
					[
						mockUser.id,
						{ userId: mockUser.id, role: WEAPON_ROLES[0], rank: null },
					],
				]),
			);
			eventManager.setCreator(mockMessage.id, 'creator-id');
			eventManager.setTimer(mockMessage.id, {
				startTime: Date.now(),
				hasStarted: false,
			});
		});

		it('should allow user to sign out', async () => {
			await handleSignOutButton(
				interaction,
				eventManager,
				threadManager,
				voiceChannelManager,
				telemetry,
			);

			expect(interaction.deferUpdate).toHaveBeenCalled();
			const participants = eventManager.getParticipants(mockMessage.id);
			expect(participants?.has(mockUser.id)).toBe(false);
		});

		it('should prevent creator from signing out', async () => {
			eventManager.setCreator(mockMessage.id, mockUser.id);

			await handleSignOutButton(
				interaction,
				eventManager,
				threadManager,
				voiceChannelManager,
				telemetry,
			);

			expect(interaction.followUp).toHaveBeenCalledWith({
				content: ERROR_MESSAGES.CREATOR_CANNOT_SIGNOUT,
				flags: ['Ephemeral'],
			});
		});

		it('should track sign out with telemetry', async () => {
			eventManager.setMatchId(mockMessage.id, faker.string.uuid());

			await handleSignOutButton(
				interaction,
				eventManager,
				threadManager,
				voiceChannelManager,
				telemetry,
			);

			expect(telemetry.trackUserSignOut).toHaveBeenCalled();
		});
	});

	describe('handleCancelButton', () => {
		beforeEach(() => {
			eventManager.setParticipants(mockMessage.id, new Map());
			eventManager.setCreator(mockMessage.id, mockUser.id);
		});

		it('should allow creator to cancel event', async () => {
			await handleCancelButton(
				interaction,
				eventManager,
				appClient,
				threadManager,
				voiceChannelManager,
				telemetry,
			);

			expect(interaction.deferUpdate).toHaveBeenCalled();
			expect(interaction.editReply).toHaveBeenCalledWith({
				embeds: [expect.any(EmbedBuilder)],
				components: [],
			});
		});

		it('should prevent non-creator from cancelling', async () => {
			eventManager.setCreator(mockMessage.id, 'other-user');

			await handleCancelButton(
				interaction,
				eventManager,
				appClient,
				threadManager,
				voiceChannelManager,
				telemetry,
			);

			expect(interaction.followUp).toHaveBeenCalledWith({
				content: ERROR_MESSAGES.CREATOR_ONLY_CANCEL,
				flags: ['Ephemeral'],
			});
		});

		it('should track cancellation with telemetry', async () => {
			eventManager.setMatchId(mockMessage.id, faker.string.uuid());

			await handleCancelButton(
				interaction,
				eventManager,
				appClient,
				threadManager,
				voiceChannelManager,
				telemetry,
			);

			expect(telemetry.trackEventCancelled).toHaveBeenCalled();
		});
	});

	describe('handleStartNowButton', () => {
		beforeEach(() => {
			const fullMap = new Map();
			for (let i = 0; i < MAX_PARTICIPANTS; i++) {
				fullMap.set(`user${i}`, {
					userId: `user${i}`,
					role: WEAPON_ROLES[0],
					rank: null,
				});
			}
			eventManager.setParticipants(mockMessage.id, fullMap);
			eventManager.setCreator(mockMessage.id, mockUser.id);
		});

		it('should allow creator to start event with full participants', async () => {
			await handleStartNowButton(
				interaction,
				eventManager,
				appClient,
				threadManager,
				voiceChannelManager,
				telemetry,
			);

			expect(interaction.deferUpdate).toHaveBeenCalled();
		});

		it('should prevent non-creator from starting', async () => {
			eventManager.setCreator(mockMessage.id, 'other-user');

			await handleStartNowButton(
				interaction,
				eventManager,
				appClient,
				threadManager,
				voiceChannelManager,
				telemetry,
			);

			expect(interaction.followUp).toHaveBeenCalledWith({
				content: ERROR_MESSAGES.CREATOR_ONLY_START,
				flags: ['Ephemeral'],
			});
		});

		it('should prevent starting without enough participants', async () => {
			eventManager.setParticipants(mockMessage.id, new Map());

			await handleStartNowButton(
				interaction,
				eventManager,
				appClient,
				threadManager,
				voiceChannelManager,
				telemetry,
			);

			expect(interaction.followUp).toHaveBeenCalledWith({
				content: ERROR_MESSAGES.NOT_ENOUGH_PARTICIPANTS,
				flags: ['Ephemeral'],
			});
		});
	});

	describe('handleFinishButton', () => {
		beforeEach(() => {
			eventManager.setParticipants(mockMessage.id, new Map());
			eventManager.setCreator(mockMessage.id, mockUser.id);
		});

		it('should allow creator to finish event', async () => {
			await handleFinishButton(
				interaction,
				eventManager,
				appClient,
				threadManager,
				voiceChannelManager,
				telemetry,
			);

			expect(interaction.deferUpdate).toHaveBeenCalled();
			expect(interaction.editReply).toHaveBeenCalledWith({
				embeds: [expect.any(EmbedBuilder)],
				components: [],
			});
		});

		it('should prevent non-creator from finishing', async () => {
			eventManager.setCreator(mockMessage.id, 'other-user');

			await handleFinishButton(
				interaction,
				eventManager,
				appClient,
				threadManager,
				voiceChannelManager,
				telemetry,
			);

			expect(interaction.followUp).toHaveBeenCalledWith({
				content: ERROR_MESSAGES.CREATOR_ONLY_FINISH,
				flags: ['Ephemeral'],
			});
		});

		it('should track finish with telemetry', async () => {
			eventManager.setMatchId(mockMessage.id, faker.string.uuid());

			await handleFinishButton(
				interaction,
				eventManager,
				appClient,
				threadManager,
				voiceChannelManager,
				telemetry,
			);

			expect(telemetry.trackEventFinished).toHaveBeenCalled();
		});
	});

	describe('handleDropOutButton', () => {
		beforeEach(() => {
			eventManager.setParticipants(
				mockMessage.id,
				new Map([
					[
						mockUser.id,
						{ userId: mockUser.id, role: WEAPON_ROLES[0], rank: null },
					],
				]),
			);
			eventManager.setCreator(mockMessage.id, 'creator-id');
			eventManager.setTimer(mockMessage.id, {
				startTime: Date.now(),
				hasStarted: true,
			});
		});

		it('should allow user to drop out', async () => {
			await handleDropOutButton(
				interaction,
				eventManager,
				appClient,
				threadManager,
				voiceChannelManager,
				telemetry,
			);

			expect(interaction.deferUpdate).toHaveBeenCalled();
			const participants = eventManager.getParticipants(mockMessage.id);
			expect(participants?.has(mockUser.id)).toBe(false);
		});

		it('should prevent creator from dropping out', async () => {
			eventManager.setCreator(mockMessage.id, mockUser.id);

			await handleDropOutButton(
				interaction,
				eventManager,
				appClient,
				threadManager,
				voiceChannelManager,
				telemetry,
			);

			expect(interaction.followUp).toHaveBeenCalledWith({
				content: ERROR_MESSAGES.CREATOR_CANNOT_SIGNOUT,
				flags: ['Ephemeral'],
			});
		});

		it('should prevent drop out if not signed up', async () => {
			eventManager.setParticipants(mockMessage.id, new Map());

			await handleDropOutButton(
				interaction,
				eventManager,
				appClient,
				threadManager,
				voiceChannelManager,
				telemetry,
			);

			expect(interaction.followUp).toHaveBeenCalledWith({
				content: ERROR_MESSAGES.NOT_SIGNED_UP,
				flags: ['Ephemeral'],
			});
		});

		it('should track drop out with telemetry', async () => {
			eventManager.setMatchId(mockMessage.id, faker.string.uuid());

			await handleDropOutButton(
				interaction,
				eventManager,
				appClient,
				threadManager,
				voiceChannelManager,
				telemetry,
			);

			expect(telemetry.trackUserDropOut).toHaveBeenCalled();
		});
	});

	describe('handleDropInButton', () => {
		beforeEach(() => {
			eventManager.setParticipants(mockMessage.id, new Map());
			eventManager.setTimer(mockMessage.id, {
				startTime: Date.now(),
				hasStarted: true,
			});
		});

		it('should allow user to drop in', async () => {
			await handleDropInButton(
				interaction,
				eventManager,
				appClient,
				threadManager,
				voiceChannelManager,
				telemetry,
			);

			expect(interaction.deferUpdate).toHaveBeenCalled();
			const participants = eventManager.getParticipants(mockMessage.id);
			expect(participants?.has(mockUser.id)).toBe(true);
		});

		it('should prevent drop in if already signed up', async () => {
			eventManager.setParticipants(
				mockMessage.id,
				new Map([
					[
						mockUser.id,
						{ userId: mockUser.id, role: WEAPON_ROLES[0], rank: null },
					],
				]),
			);

			await handleDropInButton(
				interaction,
				eventManager,
				appClient,
				threadManager,
				voiceChannelManager,
				telemetry,
			);

			expect(interaction.followUp).toHaveBeenCalledWith({
				content: ERROR_MESSAGES.ALREADY_SIGNED_UP,
				flags: ['Ephemeral'],
			});
		});

		it('should prevent drop in if event is full', async () => {
			const fullMap = new Map();
			for (let i = 0; i < MAX_PARTICIPANTS; i++) {
				fullMap.set(`user${i}`, {
					userId: `user${i}`,
					role: WEAPON_ROLES[0],
					rank: null,
				});
			}
			eventManager.setParticipants(mockMessage.id, fullMap);

			await handleDropInButton(
				interaction,
				eventManager,
				appClient,
				threadManager,
				voiceChannelManager,
				telemetry,
			);

			expect(interaction.followUp).toHaveBeenCalledWith({
				content: ERROR_MESSAGES.EVENT_FULL,
				flags: ['Ephemeral'],
			});
		});

		it('should track drop in with telemetry', async () => {
			eventManager.setMatchId(mockMessage.id, faker.string.uuid());

			await handleDropInButton(
				interaction,
				eventManager,
				appClient,
				threadManager,
				voiceChannelManager,
				telemetry,
			);

			expect(telemetry.trackUserDropIn).toHaveBeenCalled();
		});
	});

	describe('checkProcessingStates', () => {
		it('should detect starting state', async () => {
			eventManager.setProcessing(mockMessage.id, 'starting');

			const result = await checkProcessingStates(
				mockMessage.id,
				eventManager,
				interaction,
			);

			expect(result).toBe(true);
			expect(interaction.reply).toHaveBeenCalled();
		});

		it('should detect finishing state', async () => {
			eventManager.setProcessing(mockMessage.id, 'finishing');

			const result = await checkProcessingStates(
				mockMessage.id,
				eventManager,
				interaction,
			);

			expect(result).toBe(true);
		});

		it('should detect cancelling state', async () => {
			eventManager.setProcessing(mockMessage.id, 'cancelling');

			const result = await checkProcessingStates(
				mockMessage.id,
				eventManager,
				interaction,
			);

			expect(result).toBe(true);
		});

		it('should detect cleanup state', async () => {
			eventManager.setProcessing(mockMessage.id, 'cleanup');

			const result = await checkProcessingStates(
				mockMessage.id,
				eventManager,
				interaction,
			);

			expect(result).toBe(true);
		});

		it('should return false when not processing', async () => {
			const result = await checkProcessingStates(
				mockMessage.id,
				eventManager,
				interaction,
			);

			expect(result).toBe(false);
		});
	});
});
