import { faker } from '@faker-js/faker';
import type {
	ChatInputCommandInteraction,
	Client,
	CommandInteractionOptionResolver,
	Message,
	TextChannel,
	ThreadChannel,
	User,
} from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleKickCommand } from '../commands/kick-command.js';
import { ERROR_MESSAGES } from '../constants.js';
import { EventManager } from '../event/event-manager.js';
import { ThreadManager } from '../managers/thread-manager.js';
import { VoiceChannelManager } from '../managers/voice-channel-manager.js';

vi.mock('../utils/embed-utils.js', () => ({
	updateParticipantFields: vi.fn(),
}));

vi.mock('../utils/helpers.js', () => ({
	safeReplyToInteraction: vi.fn(),
}));

// biome-ignore lint: test mock type casting
type AnyThreadChannel = any;

describe('handleKickCommand', () => {
	let eventManager: EventManager;
	let threadManager: ThreadManager;
	let voiceChannelManager: VoiceChannelManager;
	let interaction: ChatInputCommandInteraction;
	let mockUser: User;
	let mockTargetUser: User;
	let mockMessage: Message;
	let mockChannel: TextChannel;
	let mockThread: ThreadChannel;
	let mockClient: Client;

	beforeEach(() => {
		eventManager = new EventManager();
		threadManager = new ThreadManager();
		voiceChannelManager = new VoiceChannelManager();

		mockUser = {
			id: faker.string.uuid(),
			username: 'TestUser',
		} as unknown as User;

		mockTargetUser = {
			id: faker.string.uuid(),
			username: 'TargetUser',
		} as unknown as User;

		mockMessage = {
			id: faker.string.uuid(),
			embeds: [
				{
					title: '[Competitive] 8s Sign Up',
					fields: [],
				},
			],
			edit: vi.fn(),
		} as unknown as Message;

		mockThread = {
			id: faker.string.uuid(),
			name: 'Test Thread',
		} as unknown as ThreadChannel;

		mockChannel = {
			isTextBased: vi.fn(() => true),
			messages: {
				fetch: vi.fn(async () => mockMessage),
			},
			threads: {
				fetch: vi.fn(async () => mockThread),
			},
		} as unknown as TextChannel;

		mockClient = {
			channels: {
				fetch: vi.fn(async () => mockChannel),
			},
		} as unknown as Client;

		interaction = {
			user: mockUser,
			client: mockClient,
			guildId: faker.string.uuid(),
			deferReply: vi.fn(),
			editReply: vi.fn(),
			options: {
				getUser: vi.fn(() => mockTargetUser),
			} as unknown as CommandInteractionOptionResolver,
		} as unknown as ChatInputCommandInteraction;
	});

	it('should reply when user does not own any events', async () => {
		await handleKickCommand(
			interaction,
			eventManager,
			threadManager,
			voiceChannelManager,
		);

		expect(interaction.deferReply).toHaveBeenCalledWith({
			flags: ['Ephemeral'],
		});
		expect(interaction.editReply).toHaveBeenCalledWith({
			content: ERROR_MESSAGES.NO_EVENT_OWNED,
		});
	});

	it('should prevent user from kicking themselves', async () => {
		const eventId = faker.string.uuid();
		eventManager.setCreator(eventId, mockUser.id);

		// Mock options.getUser to return the same user
		interaction.options.getUser = vi.fn(() => mockUser);

		await handleKickCommand(
			interaction,
			eventManager,
			threadManager,
			voiceChannelManager,
		);

		expect(interaction.deferReply).toHaveBeenCalledWith({
			flags: ['Ephemeral'],
		});
		expect(interaction.editReply).toHaveBeenCalledWith({
			content: 'You cannot kick yourself from your own event.',
		});
	});

	it('should reply when target user is not signed up', async () => {
		const eventId = faker.string.uuid();
		eventManager.setCreator(eventId, mockUser.id);
		eventManager.setParticipants(
			eventId,
			new Map([
				[mockUser.id, { userId: mockUser.id, role: '⚫ None', rank: null }],
			]),
		);

		await handleKickCommand(
			interaction,
			eventManager,
			threadManager,
			voiceChannelManager,
		);

		expect(interaction.deferReply).toHaveBeenCalledWith({
			flags: ['Ephemeral'],
		});
		expect(interaction.editReply).toHaveBeenCalledWith({
			content: `<@${mockTargetUser.id}> is not signed up for your event.`,
		});
	});

	it('should handle when channel is not found', async () => {
		const eventId = faker.string.uuid();
		eventManager.setCreator(eventId, mockUser.id);
		eventManager.setParticipants(
			eventId,
			new Map([
				[mockUser.id, { userId: mockUser.id, role: '⚫ None', rank: null }],
				[
					mockTargetUser.id,
					{ userId: mockTargetUser.id, role: '⚫ None', rank: null },
				],
			]),
		);

		await handleKickCommand(
			interaction,
			eventManager,
			threadManager,
			voiceChannelManager,
		);

		expect(interaction.deferReply).toHaveBeenCalledWith({
			flags: ['Ephemeral'],
		});
		expect(interaction.editReply).toHaveBeenCalledWith({
			content: ERROR_MESSAGES.CHANNEL_NOT_FOUND,
		});
	});

	it('should handle when channel cannot be accessed', async () => {
		const eventId = faker.string.uuid();
		const channelId = faker.string.uuid();

		eventManager.setCreator(eventId, mockUser.id);
		eventManager.setChannelId(eventId, channelId);
		eventManager.setParticipants(
			eventId,
			new Map([
				[mockUser.id, { userId: mockUser.id, role: '⚫ None', rank: null }],
				[
					mockTargetUser.id,
					{ userId: mockTargetUser.id, role: '⚫ None', rank: null },
				],
			]),
		);

		mockClient.channels.fetch = vi.fn(async () => null);

		await handleKickCommand(
			interaction,
			eventManager,
			threadManager,
			voiceChannelManager,
		);

		expect(interaction.deferReply).toHaveBeenCalledWith({
			flags: ['Ephemeral'],
		});
		expect(interaction.editReply).toHaveBeenCalledWith({
			content: ERROR_MESSAGES.CHANNEL_NO_ACCESS,
		});
	});

	it('should handle when message is not found', async () => {
		const eventId = faker.string.uuid();
		const channelId = faker.string.uuid();

		eventManager.setCreator(eventId, mockUser.id);
		eventManager.setChannelId(eventId, channelId);
		eventManager.setParticipants(
			eventId,
			new Map([
				[mockUser.id, { userId: mockUser.id, role: '⚫ None', rank: null }],
				[
					mockTargetUser.id,
					{ userId: mockTargetUser.id, role: '⚫ None', rank: null },
				],
			]),
		);

		// @ts-expect-error - Mock override for testing
		mockChannel.messages.fetch = vi.fn(async () => {
			return null as unknown as Message;
		});

		await handleKickCommand(
			interaction,
			eventManager,
			threadManager,
			voiceChannelManager,
		);

		expect(interaction.deferReply).toHaveBeenCalledWith({
			flags: ['Ephemeral'],
		});
		expect(interaction.editReply).toHaveBeenCalledWith({
			content: ERROR_MESSAGES.MESSAGE_NOT_FOUND,
		});
	});

	it('should successfully kick a user from the event', async () => {
		const eventId = faker.string.uuid();
		const channelId = faker.string.uuid();
		const threadId = faker.string.uuid();

		mockMessage.id = eventId;
		mockThread.id = threadId;

		eventManager.setCreator(eventId, mockUser.id);
		eventManager.setChannelId(eventId, channelId);
		eventManager.setParticipants(
			eventId,
			new Map([
				[mockUser.id, { userId: mockUser.id, role: '⚫ None', rank: null }],
				[
					mockTargetUser.id,
					{ userId: mockTargetUser.id, role: '⚫ None', rank: null },
				],
			]),
		);
		eventManager.setThread(eventId, threadId);
		eventManager.setTimer(eventId, {
			startTime: Date.now(),
			duration: 60000,
			hasStarted: false,
		});

		const removeMemberSpy = vi
			.spyOn(threadManager, 'removeMember')
			.mockResolvedValue(true);
		const fetchThreadSpy = vi
			.spyOn(threadManager, 'fetchThread')
			.mockResolvedValue(mockThread as AnyThreadChannel);

		await handleKickCommand(
			interaction,
			eventManager,
			threadManager,
			voiceChannelManager,
		);

		expect(interaction.deferReply).toHaveBeenCalledWith({
			flags: ['Ephemeral'],
		});
		expect(mockClient.channels.fetch).toHaveBeenCalledWith(channelId);
		expect(mockChannel.messages.fetch).toHaveBeenCalledWith(eventId);
		expect(fetchThreadSpy).toHaveBeenCalledWith(mockChannel, threadId);
		expect(removeMemberSpy).toHaveBeenCalledWith(mockThread, mockTargetUser.id);
		expect(mockMessage.edit).toHaveBeenCalled();
		expect(interaction.editReply).toHaveBeenCalledWith({
			content: `Successfully kicked <@${mockTargetUser.id}> from your event.`,
		});

		// Verify participant was removed
		const participants = eventManager.getParticipants(eventId);
		expect(participants?.has(mockTargetUser.id)).toBe(false);
	});

	it('should kick user and revoke voice channel access', async () => {
		const eventId = faker.string.uuid();
		const channelId = faker.string.uuid();
		const voiceChannelIds = [faker.string.uuid(), faker.string.uuid()];

		mockMessage.id = eventId;

		eventManager.setCreator(eventId, mockUser.id);
		eventManager.setChannelId(eventId, channelId);
		eventManager.setParticipants(
			eventId,
			new Map([
				[mockUser.id, { userId: mockUser.id, role: '⚫ None', rank: null }],
				[
					mockTargetUser.id,
					{ userId: mockTargetUser.id, role: '⚫ None', rank: null },
				],
			]),
		);
		eventManager.setVoiceChannels(eventId, voiceChannelIds);
		eventManager.setTimer(eventId, {
			startTime: Date.now(),
			duration: 60000,
			hasStarted: false,
		});

		const revokeAccessSpy = vi
			.spyOn(voiceChannelManager, 'revokeAccessFromChannels')
			.mockResolvedValue(undefined);

		await handleKickCommand(
			interaction,
			eventManager,
			threadManager,
			voiceChannelManager,
		);

		expect(interaction.deferReply).toHaveBeenCalledWith({
			flags: ['Ephemeral'],
		});
		expect(revokeAccessSpy).toHaveBeenCalledWith(
			mockClient,
			voiceChannelIds,
			mockTargetUser.id,
		);
		expect(interaction.editReply).toHaveBeenCalledWith({
			content: `Successfully kicked <@${mockTargetUser.id}> from your event.`,
		});
	});

	it('should handle errors gracefully', async () => {
		const eventId = faker.string.uuid();
		const channelId = faker.string.uuid();

		eventManager.setCreator(eventId, mockUser.id);
		eventManager.setChannelId(eventId, channelId);
		eventManager.setParticipants(
			eventId,
			new Map([
				[mockUser.id, { userId: mockUser.id, role: '⚫ None', rank: null }],
				[
					mockTargetUser.id,
					{ userId: mockTargetUser.id, role: '⚫ None', rank: null },
				],
			]),
		);

		mockChannel.messages.fetch = vi
			.fn()
			.mockRejectedValue(new Error('Fetch failed'));

		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		await handleKickCommand(
			interaction,
			eventManager,
			threadManager,
			voiceChannelManager,
		);

		expect(interaction.deferReply).toHaveBeenCalledWith({
			flags: ['Ephemeral'],
		});
		expect(consoleSpy).toHaveBeenCalled();
		const errorOutput = consoleSpy.mock.calls[0][0] as string;
		expect(errorOutput).toContain('[MEDIUM] Error executing kick command');
		const { safeReplyToInteraction } = await import('../utils/helpers.js');
		expect(vi.mocked(safeReplyToInteraction)).toHaveBeenCalledWith(
			interaction,
			'An error occurred while trying to kick the user.',
		);

		consoleSpy.mockRestore();
	});

	it('should kick user without thread if no thread exists', async () => {
		const eventId = faker.string.uuid();
		const channelId = faker.string.uuid();

		mockMessage.id = eventId;

		eventManager.setCreator(eventId, mockUser.id);
		eventManager.setChannelId(eventId, channelId);
		eventManager.setParticipants(
			eventId,
			new Map([
				[mockUser.id, { userId: mockUser.id, role: '⚫ None', rank: null }],
				[
					mockTargetUser.id,
					{ userId: mockTargetUser.id, role: '⚫ None', rank: null },
				],
			]),
		);
		eventManager.setTimer(eventId, {
			startTime: Date.now(),
			duration: 60000,
			hasStarted: false,
		});

		const removeMemberSpy = vi.spyOn(threadManager, 'removeMember');
		const fetchThreadSpy = vi.spyOn(threadManager, 'fetchThread');

		await handleKickCommand(
			interaction,
			eventManager,
			threadManager,
			voiceChannelManager,
		);

		expect(interaction.deferReply).toHaveBeenCalledWith({
			flags: ['Ephemeral'],
		});
		expect(fetchThreadSpy).not.toHaveBeenCalled();
		expect(removeMemberSpy).not.toHaveBeenCalled();
		expect(interaction.editReply).toHaveBeenCalledWith({
			content: `Successfully kicked <@${mockTargetUser.id}> from your event.`,
		});
	});

	it('should kick user without voice channels if none exist', async () => {
		const eventId = faker.string.uuid();
		const channelId = faker.string.uuid();

		mockMessage.id = eventId;

		eventManager.setCreator(eventId, mockUser.id);
		eventManager.setChannelId(eventId, channelId);
		eventManager.setParticipants(
			eventId,
			new Map([
				[mockUser.id, { userId: mockUser.id, role: '⚫ None', rank: null }],
				[
					mockTargetUser.id,
					{ userId: mockTargetUser.id, role: '⚫ None', rank: null },
				],
			]),
		);
		eventManager.setTimer(eventId, {
			startTime: Date.now(),
			duration: 60000,
			hasStarted: false,
		});

		const revokeAccessSpy = vi.spyOn(
			voiceChannelManager,
			'revokeAccessFromChannels',
		);

		await handleKickCommand(
			interaction,
			eventManager,
			threadManager,
			voiceChannelManager,
		);

		expect(interaction.deferReply).toHaveBeenCalledWith({
			flags: ['Ephemeral'],
		});
		expect(revokeAccessSpy).not.toHaveBeenCalled();
		expect(interaction.editReply).toHaveBeenCalledWith({
			content: `Successfully kicked <@${mockTargetUser.id}> from your event.`,
		});
	});
});
