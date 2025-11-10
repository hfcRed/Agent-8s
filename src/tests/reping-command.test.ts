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

vi.mock('../utils/helpers.js', () => ({
	getPingsForServer: vi.fn((_interaction, casual) =>
		casual ? '||<@&casual-role-id>||' : '||<@&comp-role-id>||',
	),
}));

describe('handleRepingCommand', () => {
	let eventManager: EventManager;
	let interaction: ChatInputCommandInteraction;
	let mockUser: User;
	let mockMessage: Message;
	let mockChannel: TextChannel;
	let mockClient: Client;

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
			reply: vi.fn(),
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

		expect(interaction.reply).toHaveBeenCalledWith({
			content: 'An error occurred while trying to re-ping roles.',
			flags: ['Ephemeral'],
		});
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
});
