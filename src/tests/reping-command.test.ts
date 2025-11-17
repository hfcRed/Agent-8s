import { faker } from '@faker-js/faker';
import type {
	ChatInputCommandInteraction,
	Client,
	Message,
	TextChannel,
	User,
} from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleRepingCommand } from '../commands/reping-command.js';
import { ERROR_MESSAGES } from '../constants.js';
import { EventManager } from '../event/event-manager.js';

vi.mock('../utils/retry.js', async () => {
	const actual =
		await vi.importActual<typeof import('../utils/retry.js')>(
			'../utils/retry.js',
		);
	return {
		...actual,
		MEDIUM_RETRY_OPTIONS: actual.TEST_RETRY_OPTIONS,
		LOW_RETRY_OPTIONS: actual.TEST_RETRY_OPTIONS,
	};
});

vi.mock('../utils/helpers.js', () => ({
	getPingsForServer: vi.fn((_interaction, casual) =>
		casual ? '||<@&casual-role-id>||' : '||<@&comp-role-id>||',
	),
	safeReplyToInteraction: vi.fn(),
}));

describe('handleRepingCommand', () => {
	let eventManager: EventManager;
	let interaction: ChatInputCommandInteraction;
	let mockUser: User;
	let mockMessage: Message;
	let mockChannel: TextChannel;
	let mockClient: Client;
	let mockReplyMessage: Message;

	beforeEach(() => {
		eventManager = new EventManager();

		mockUser = {
			id: faker.string.uuid(),
			username: 'TestUser',
		} as unknown as User;

		mockMessage = {
			id: faker.string.uuid(),
			embeds: [
				{
					title: '[Competitive] 8s Sign Up',
				},
			],
		} as unknown as Message;

		mockReplyMessage = {
			id: faker.string.uuid(),
			fetch: vi.fn(async () => mockReplyMessage),
		} as unknown as Message;

		mockChannel = {
			isTextBased: vi.fn(() => true),
			messages: {
				fetch: vi.fn(async () => mockMessage),
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
			reply: vi.fn(async () => mockReplyMessage),
		} as unknown as ChatInputCommandInteraction;
	});

	it('should reply when user does not own any events', async () => {
		await handleRepingCommand(interaction, eventManager);

		expect(interaction.reply).toHaveBeenCalledWith({
			content: ERROR_MESSAGES.NO_EVENT_OWNED,
			flags: ['Ephemeral'],
		});
	});

	it('should re-ping competitive roles for competitive event', async () => {
		const eventId = faker.string.uuid();
		const channelId = faker.string.uuid();
		const guildId = faker.string.uuid();

		mockMessage.id = eventId;
		eventManager.setCreator(eventId, mockUser.id);
		eventManager.setChannelId(eventId, channelId);
		eventManager.setParticipants(
			eventId,
			new Map([
				[mockUser.id, { userId: mockUser.id, role: '⚫ None', rank: null }],
			]),
		);

		interaction.guildId = guildId;

		await handleRepingCommand(interaction, eventManager);

		expect(mockClient.channels.fetch).toHaveBeenCalledWith(channelId);
		expect(mockChannel.messages.fetch).toHaveBeenCalledWith(eventId);
		expect(interaction.reply).toHaveBeenCalledWith({
			content: `||<@&comp-role-id>||\nLooking for **+7** for https://discord.com/channels/${guildId}/${channelId}/${eventId}`,
		});
	});

	it('should re-ping casual roles for casual event', async () => {
		const eventId = faker.string.uuid();
		const channelId = faker.string.uuid();
		const guildId = faker.string.uuid();

		mockMessage.id = eventId;
		mockMessage.embeds = [
			{
				title: '[Casual] 8s Sign Up',
			},
		] as unknown as Message['embeds'];

		eventManager.setCreator(eventId, mockUser.id);
		eventManager.setChannelId(eventId, channelId);
		eventManager.setParticipants(
			eventId,
			new Map([
				[mockUser.id, { userId: mockUser.id, role: '⚫ None', rank: null }],
				[
					faker.string.uuid(),
					{ userId: faker.string.uuid(), role: '⚫ None', rank: null },
				],
				[
					faker.string.uuid(),
					{ userId: faker.string.uuid(), role: '⚫ None', rank: null },
				],
			]),
		);

		interaction.guildId = guildId;

		await handleRepingCommand(interaction, eventManager);

		expect(mockClient.channels.fetch).toHaveBeenCalledWith(channelId);
		expect(mockChannel.messages.fetch).toHaveBeenCalledWith(eventId);
		expect(interaction.reply).toHaveBeenCalledWith({
			content: `||<@&casual-role-id>||\nLooking for **+5** for https://discord.com/channels/${guildId}/${channelId}/${eventId}`,
		});
	});

	it('should show singular "player" when only 1 player is needed', async () => {
		const eventId = faker.string.uuid();
		const channelId = faker.string.uuid();
		const guildId = faker.string.uuid();

		mockMessage.id = eventId;
		eventManager.setCreator(eventId, mockUser.id);
		eventManager.setChannelId(eventId, channelId);

		// Create 7 participants (need 1 more)
		const participants = new Map();
		for (let i = 0; i < 7; i++) {
			const id = faker.string.uuid();
			participants.set(id, { userId: id, role: '⚫ None', rank: null });
		}
		eventManager.setParticipants(eventId, participants);

		interaction.guildId = guildId;

		await handleRepingCommand(interaction, eventManager);

		expect(interaction.reply).toHaveBeenCalledWith({
			content: `||<@&comp-role-id>||\nLooking for **+1** for https://discord.com/channels/${guildId}/${channelId}/${eventId}`,
		});
	});

	it('should handle when channel is not found', async () => {
		const eventId = faker.string.uuid();

		eventManager.setCreator(eventId, mockUser.id);

		await handleRepingCommand(interaction, eventManager);

		expect(interaction.reply).toHaveBeenCalledWith({
			content: ERROR_MESSAGES.CHANNEL_NOT_FOUND,
			flags: ['Ephemeral'],
		});
	});

	it('should handle when channel cannot be accessed', async () => {
		const eventId = faker.string.uuid();
		const channelId = faker.string.uuid();

		eventManager.setCreator(eventId, mockUser.id);
		eventManager.setChannelId(eventId, channelId);

		mockClient.channels.fetch = vi.fn(async () => null);

		await handleRepingCommand(interaction, eventManager);

		expect(interaction.reply).toHaveBeenCalledWith({
			content: ERROR_MESSAGES.CHANNEL_NO_ACCESS,
			flags: ['Ephemeral'],
		});
	});

	it('should handle when message is not found', async () => {
		const eventId = faker.string.uuid();
		const channelId = faker.string.uuid();

		eventManager.setCreator(eventId, mockUser.id);
		eventManager.setChannelId(eventId, channelId);

		mockChannel.messages.fetch = vi.fn(async () => {
			throw new Error('Message not found');
		});

		await handleRepingCommand(interaction, eventManager);

		const { safeReplyToInteraction } = await import('../utils/helpers.js');
		expect(vi.mocked(safeReplyToInteraction)).toHaveBeenCalledWith(
			interaction,
			'An error occurred while trying to re-ping roles.',
		);
	});

	it('should handle when no role ping is available', async () => {
		const eventId = faker.string.uuid();
		const channelId = faker.string.uuid();

		mockMessage.id = eventId;
		eventManager.setCreator(eventId, mockUser.id);
		eventManager.setChannelId(eventId, channelId);

		// Mock getPingsForServer to return null
		const { getPingsForServer } = await import('../utils/helpers.js');
		vi.mocked(getPingsForServer).mockReturnValueOnce(null);

		await handleRepingCommand(interaction, eventManager);

		expect(interaction.reply).toHaveBeenCalledWith({
			content: ERROR_MESSAGES.ROLE_NOT_FOUND,
			flags: ['Ephemeral'],
		});
	});

	it('should enforce cooldown when re-ping is used again within 15 minutes', async () => {
		const eventId = faker.string.uuid();
		const channelId = faker.string.uuid();
		const guildId = faker.string.uuid();

		mockMessage.id = eventId;
		eventManager.setCreator(eventId, mockUser.id);
		eventManager.setChannelId(eventId, channelId);
		eventManager.setParticipants(
			eventId,
			new Map([
				[mockUser.id, { userId: mockUser.id, role: '⚫ None', rank: null }],
			]),
		);

		interaction.guildId = guildId;

		// First re-ping should succeed
		await handleRepingCommand(interaction, eventManager);

		expect(interaction.reply).toHaveBeenCalledWith({
			content: `||<@&comp-role-id>||\nLooking for **+7** for https://discord.com/channels/${guildId}/${channelId}/${eventId}`,
		});

		// Reset the mock
		vi.mocked(interaction.reply).mockClear();

		// Second re-ping immediately should fail with cooldown message
		await handleRepingCommand(interaction, eventManager);

		expect(interaction.reply).toHaveBeenCalledWith({
			content: 'Please wait 15 more minutes before re-pinging again.',
			flags: ['Ephemeral'],
		});
	});

	it('should allow re-ping after cooldown period has passed', async () => {
		const eventId = faker.string.uuid();
		const channelId = faker.string.uuid();
		const guildId = faker.string.uuid();

		mockMessage.id = eventId;
		eventManager.setCreator(eventId, mockUser.id);
		eventManager.setChannelId(eventId, channelId);
		eventManager.setParticipants(
			eventId,
			new Map([
				[mockUser.id, { userId: mockUser.id, role: '⚫ None', rank: null }],
			]),
		);

		interaction.guildId = guildId;

		// Set cooldown to 16 minutes ago (past the 15 minute cooldown)
		const sixteenMinutesAgo = Date.now() - 16 * 60 * 1000;
		eventManager.setRepingCooldown(eventId, sixteenMinutesAgo);

		// Re-ping should succeed
		await handleRepingCommand(interaction, eventManager);

		expect(interaction.reply).toHaveBeenCalledWith({
			content: `||<@&comp-role-id>||\nLooking for **+7** for https://discord.com/channels/${guildId}/${channelId}/${eventId}`,
		});
	});

	it('should show correct remaining time in cooldown message', async () => {
		const eventId = faker.string.uuid();
		const channelId = faker.string.uuid();

		mockMessage.id = eventId;
		eventManager.setCreator(eventId, mockUser.id);
		eventManager.setChannelId(eventId, channelId);
		eventManager.setParticipants(
			eventId,
			new Map([
				[mockUser.id, { userId: mockUser.id, role: '⚫ None', rank: null }],
			]),
		);

		// Set cooldown to 10 minutes ago (5 minutes remaining)
		const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
		eventManager.setRepingCooldown(eventId, tenMinutesAgo);

		await handleRepingCommand(interaction, eventManager);

		expect(interaction.reply).toHaveBeenCalledWith({
			content: 'Please wait 5 more minutes before re-pinging again.',
			flags: ['Ephemeral'],
		});
	});

	it('should use singular "minute" when 1 minute remains', async () => {
		const eventId = faker.string.uuid();
		const channelId = faker.string.uuid();

		mockMessage.id = eventId;
		eventManager.setCreator(eventId, mockUser.id);
		eventManager.setChannelId(eventId, channelId);
		eventManager.setParticipants(
			eventId,
			new Map([
				[mockUser.id, { userId: mockUser.id, role: '⚫ None', rank: null }],
			]),
		);

		// Set cooldown to 14.5 minutes ago (30 seconds remaining, rounds up to 1 minute)
		const fourteenAndHalfMinutesAgo = Date.now() - 14.5 * 60 * 1000;
		eventManager.setRepingCooldown(eventId, fourteenAndHalfMinutesAgo);

		await handleRepingCommand(interaction, eventManager);

		expect(interaction.reply).toHaveBeenCalledWith({
			content: 'Please wait 1 more minute before re-pinging again.',
			flags: ['Ephemeral'],
		});
	});

	it('should update cooldown timestamp after successful re-ping', async () => {
		const eventId = faker.string.uuid();
		const channelId = faker.string.uuid();
		const guildId = faker.string.uuid();

		mockMessage.id = eventId;
		eventManager.setCreator(eventId, mockUser.id);
		eventManager.setChannelId(eventId, channelId);
		eventManager.setParticipants(
			eventId,
			new Map([
				[mockUser.id, { userId: mockUser.id, role: '⚫ None', rank: null }],
			]),
		);

		interaction.guildId = guildId;

		const beforeTimestamp = Date.now();

		await handleRepingCommand(interaction, eventManager);

		const afterTimestamp = eventManager.getRepingCooldown(eventId);

		expect(afterTimestamp).toBeDefined();
		expect(afterTimestamp).toBeGreaterThanOrEqual(beforeTimestamp);
	});

	it('should store the re-ping message ID after successful re-ping', async () => {
		const eventId = faker.string.uuid();
		const channelId = faker.string.uuid();
		const guildId = faker.string.uuid();

		mockMessage.id = eventId;
		eventManager.setCreator(eventId, mockUser.id);
		eventManager.setChannelId(eventId, channelId);
		eventManager.setParticipants(
			eventId,
			new Map([
				[mockUser.id, { userId: mockUser.id, role: '⚫ None', rank: null }],
			]),
		);

		interaction.guildId = guildId;

		await handleRepingCommand(interaction, eventManager);

		const storedMessageId = eventManager.getRepingMessage(eventId);
		expect(storedMessageId).toBe(mockReplyMessage.id);
	});

	it('should delete previous re-ping message when sending a new one', async () => {
		const eventId = faker.string.uuid();
		const channelId = faker.string.uuid();
		const guildId = faker.string.uuid();
		const previousMessageId = faker.string.uuid();

		const mockPreviousMessage = {
			id: previousMessageId,
			delete: vi.fn(),
		} as unknown as Message;

		mockMessage.id = eventId;
		eventManager.setCreator(eventId, mockUser.id);
		eventManager.setChannelId(eventId, channelId);
		eventManager.setParticipants(
			eventId,
			new Map([
				[mockUser.id, { userId: mockUser.id, role: '⚫ None', rank: null }],
			]),
		);
		eventManager.setRepingMessage(eventId, previousMessageId);

		// Set up the mock to return different messages based on the ID
		mockChannel.messages.fetch = vi.fn(async (id: unknown) => {
			if (id === eventId) return mockMessage;
			if (id === previousMessageId) return mockPreviousMessage;
			throw new Error('Message not found');
		}) as unknown as typeof mockChannel.messages.fetch;

		interaction.guildId = guildId;

		// Spy on the deleteRepingMessageIfExists method
		const deleteSpy = vi.spyOn(eventManager, 'deleteRepingMessageIfExists');

		// No cooldown set, so this is the first re-ping (or cooldown expired)
		await handleRepingCommand(interaction, eventManager);

		expect(deleteSpy).toHaveBeenCalled();
		expect(mockChannel.messages.fetch).toHaveBeenCalledWith(previousMessageId);
		expect(mockPreviousMessage.delete).toHaveBeenCalled();
	});

	it('should handle failure to delete previous re-ping message gracefully', async () => {
		const eventId = faker.string.uuid();
		const channelId = faker.string.uuid();
		const guildId = faker.string.uuid();
		const previousMessageId = faker.string.uuid();

		mockMessage.id = eventId;
		eventManager.setCreator(eventId, mockUser.id);
		eventManager.setChannelId(eventId, channelId);
		eventManager.setParticipants(
			eventId,
			new Map([
				[mockUser.id, { userId: mockUser.id, role: '⚫ None', rank: null }],
			]),
		);
		eventManager.setRepingMessage(eventId, previousMessageId);

		// Mock fetch to throw error for previous message
		mockChannel.messages.fetch = vi.fn(async (id: unknown) => {
			if (id === eventId) return mockMessage;
			if (id === previousMessageId)
				throw new Error('Previous message not found');
			throw new Error('Message not found');
		}) as unknown as typeof mockChannel.messages.fetch;

		interaction.guildId = guildId;

		// Spy on the deleteRepingMessageIfExists method
		const deleteSpy = vi.spyOn(eventManager, 'deleteRepingMessageIfExists');

		// No cooldown set, so re-ping is allowed
		await handleRepingCommand(interaction, eventManager);

		expect(deleteSpy).toHaveBeenCalled();
		// Should still send the new re-ping despite failure to delete old one
		expect(interaction.reply).toHaveBeenCalledWith({
			content: `||<@&comp-role-id>||\nLooking for **+7** for https://discord.com/channels/${guildId}/${channelId}/${eventId}`,
		});
	});
});
