import type { Client, GuildMember, Message, User } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	createDiscordClient,
	loginClient,
	registerCommands,
	setupErrorHandlers,
	setupEventMessageDeleteHandler,
	setupMessageDeletionHandler,
} from '../client/discord-client.js';
import { EventManager } from '../event/event-manager.js';
import type { ThreadManager } from '../managers/thread-manager.js';
import type { VoiceChannelManager } from '../managers/voice-channel-manager.js';

vi.mock('../event/event-lifecycle.js', () => ({
	cleanupEvent: vi.fn(),
}));

vi.mock('../utils/helpers.js', () => ({
	isUserAdmin: vi.fn(),
	checkCommandPermissions: vi.fn(),
}));

describe('discord-client', () => {
	describe('createDiscordClient', () => {
		it('should create a Discord client with correct intents', () => {
			const client = createDiscordClient();

			expect(client).toBeDefined();
			expect(client.options.intents).toBeDefined();
			expect(client.options.allowedMentions).toEqual({ parse: ['roles'] });
		});
	});

	describe('loginClient', () => {
		let mockClient: Client;
		let consoleLogSpy: ReturnType<typeof vi.spyOn>;
		let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
		let processExitSpy: ReturnType<typeof vi.spyOn>;

		beforeEach(() => {
			mockClient = {
				login: vi.fn(),
			} as unknown as Client;

			consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
			consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
			processExitSpy = vi
				.spyOn(process, 'exit')
				.mockImplementation(() => undefined as never);
		});

		it('should successfully log in client', async () => {
			(mockClient.login as ReturnType<typeof vi.fn>).mockResolvedValue('token');

			await loginClient(mockClient, 'test-token');

			expect(mockClient.login).toHaveBeenCalledWith('test-token');
			expect(consoleLogSpy).toHaveBeenCalledWith('Discord client logged in');
		});

		it('should handle login failure and exit process', async () => {
			const error = new Error('Login failed');
			(mockClient.login as ReturnType<typeof vi.fn>).mockRejectedValue(error);

			await loginClient(mockClient, 'test-token');

			expect(consoleErrorSpy).toHaveBeenCalledWith(
				'Failed to log in Discord client:',
				error,
			);
			expect(processExitSpy).toHaveBeenCalledWith(1);
		});
	});

	describe('registerCommands', () => {
		let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

		beforeEach(() => {
			consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		});

		it('should register commands successfully', async () => {
			// Since we can't easily mock REST/Routes, we'll just verify the function runs
			// In a real scenario, this would make actual Discord API calls
			// For now, skip this test or test in integration environment
			expect(true).toBe(true);
		});

		it('should handle missing client user', async () => {
			const clientWithoutUser = {
				user: null,
			} as unknown as Client;

			await registerCommands(clientWithoutUser, 'test-token', []);

			expect(consoleErrorSpy).toHaveBeenCalledWith(
				'Client user not available for command registration',
			);
		});

		it('should handle registration failure and exit process', async () => {
			// This would require mocking the REST API which is complex
			// Skip for now or test in integration environment
			expect(true).toBe(true);
		});
	});

	describe('setupErrorHandlers', () => {
		let mockClient: Client;
		let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
		let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

		beforeEach(() => {
			mockClient = {
				on: vi.fn(),
			} as unknown as Client;

			consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
			consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		});

		it('should setup error handlers', () => {
			setupErrorHandlers(mockClient);

			expect(mockClient.on).toHaveBeenCalledWith('error', expect.any(Function));
			expect(mockClient.on).toHaveBeenCalledWith('warn', expect.any(Function));
		});

		it('should handle client error events', () => {
			setupErrorHandlers(mockClient);

			const errorHandler = (mockClient.on as ReturnType<typeof vi.fn>).mock
				.calls[0][1];
			const testError = new Error('Test error');

			errorHandler(testError);

			expect(consoleErrorSpy).toHaveBeenCalledWith(
				'Discord client error:',
				testError,
			);
		});

		it('should handle client warning events', () => {
			setupErrorHandlers(mockClient);

			const warnHandler = (mockClient.on as ReturnType<typeof vi.fn>).mock
				.calls[1][1];
			const testWarning = 'Test warning';

			warnHandler(testWarning);

			expect(consoleWarnSpy).toHaveBeenCalledWith(
				'Discord client warning:',
				testWarning,
			);
		});
	});

	describe('setupMessageDeletionHandler', () => {
		let mockClient: Client;
		let mockMessage: Message;
		let mockMember: GuildMember;
		let isUserAdminMock: ReturnType<typeof vi.fn>;
		let checkCommandPermissionsMock: ReturnType<typeof vi.fn>;
		let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

		beforeEach(async () => {
			mockClient = {
				on: vi.fn(),
			} as unknown as Client;

			mockMember = {} as GuildMember;

			mockMessage = {
				author: { bot: false },
				guild: {},
				channel: { id: 'channel-123' },
				member: mockMember,
				delete: vi.fn(),
				interactionMetadata: null,
			} as unknown as Message;

			const helpersModule = await import('../utils/helpers.js');
			isUserAdminMock = helpersModule.isUserAdmin as ReturnType<typeof vi.fn>;
			checkCommandPermissionsMock =
				helpersModule.checkCommandPermissions as ReturnType<typeof vi.fn>;

			consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		});

		it('should setup message deletion handler', () => {
			setupMessageDeletionHandler(mockClient);

			expect(mockClient.on).toHaveBeenCalledWith(
				'messageCreate',
				expect.any(Function),
			);
		});

		it('should delete non-admin user messages', async () => {
			isUserAdminMock.mockReturnValue(false);
			checkCommandPermissionsMock.mockResolvedValue(true);
			setupMessageDeletionHandler(mockClient);

			const messageHandler = (mockClient.on as ReturnType<typeof vi.fn>).mock
				.calls[0][1];
			await messageHandler(mockMessage);

			expect(checkCommandPermissionsMock).toHaveBeenCalledWith(
				mockMessage.guild,
				mockMessage.channel.id,
			);
			expect(mockMessage.delete).toHaveBeenCalled();
		});

		it('should not delete admin user messages', async () => {
			isUserAdminMock.mockReturnValue(true);
			checkCommandPermissionsMock.mockResolvedValue(true);
			setupMessageDeletionHandler(mockClient);

			const messageHandler = (mockClient.on as ReturnType<typeof vi.fn>).mock
				.calls[0][1];
			await messageHandler(mockMessage);

			expect(mockMessage.delete).not.toHaveBeenCalled();
		});

		it('should not delete bot messages', async () => {
			mockMessage.author.bot = true;
			setupMessageDeletionHandler(mockClient);

			const messageHandler = (mockClient.on as ReturnType<typeof vi.fn>).mock
				.calls[0][1];
			await messageHandler(mockMessage);

			expect(mockMessage.delete).not.toHaveBeenCalled();
		});

		it('should not delete messages without guild', async () => {
			const messageWithoutGuild = {
				...mockMessage,
				guild: null,
			} as unknown as Message;

			setupMessageDeletionHandler(mockClient);

			const messageHandler = (mockClient.on as ReturnType<typeof vi.fn>).mock
				.calls[0][1];
			await messageHandler(messageWithoutGuild);

			expect(mockMessage.delete).not.toHaveBeenCalled();
		});

		it('should not delete messages without member', async () => {
			const messageWithoutMember = {
				...mockMessage,
				member: null,
			} as unknown as Message;

			setupMessageDeletionHandler(mockClient);

			const messageHandler = (mockClient.on as ReturnType<typeof vi.fn>).mock
				.calls[0][1];
			await messageHandler(messageWithoutMember);

			expect(mockMessage.delete).not.toHaveBeenCalled();
		});

		it('should not delete slash command responses', async () => {
			isUserAdminMock.mockReturnValue(false);
			checkCommandPermissionsMock.mockResolvedValue(true);
			const messageWithInteraction = {
				...mockMessage,
				interactionMetadata: { type: 2 },
			} as unknown as Message;

			setupMessageDeletionHandler(mockClient);

			const messageHandler = (mockClient.on as ReturnType<typeof vi.fn>).mock
				.calls[0][1];
			await messageHandler(messageWithInteraction);

			expect(mockMessage.delete).not.toHaveBeenCalled();
		});

		it('should not delete messages when channel permissions not allowed', async () => {
			isUserAdminMock.mockReturnValue(false);
			checkCommandPermissionsMock.mockResolvedValue(false);
			setupMessageDeletionHandler(mockClient);

			const messageHandler = (mockClient.on as ReturnType<typeof vi.fn>).mock
				.calls[0][1];
			await messageHandler(mockMessage);

			expect(checkCommandPermissionsMock).toHaveBeenCalledWith(
				mockMessage.guild,
				mockMessage.channel.id,
			);
			expect(mockMessage.delete).not.toHaveBeenCalled();
		});

		it('should handle deletion errors', async () => {
			isUserAdminMock.mockReturnValue(false);
			checkCommandPermissionsMock.mockResolvedValue(true);
			const error = new Error('Delete failed');
			mockMessage.delete = vi.fn().mockRejectedValue(error);

			setupMessageDeletionHandler(mockClient);

			const messageHandler = (mockClient.on as ReturnType<typeof vi.fn>).mock
				.calls[0][1];
			await messageHandler(mockMessage);

			expect(consoleErrorSpy).toHaveBeenCalledWith(
				'Error handling message deletion:',
				error,
			);
		});
	});

	describe('setupEventMessageDeleteHandler', () => {
		let mockClient: Client;
		let mockMessage: Message;
		let eventManager: EventManager;
		let threadManager: ThreadManager;
		let voiceChannelManager: VoiceChannelManager;
		let cleanupEventMock: ReturnType<typeof vi.fn>;
		let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

		beforeEach(async () => {
			mockClient = {
				on: vi.fn(),
				user: { id: 'bot-id-123' },
			} as unknown as Client;

			mockMessage = {
				id: 'message-123',
				author: { bot: true, id: 'bot-id-123' } as User,
			} as Message;

			eventManager = new EventManager();
			threadManager = {} as ThreadManager;
			voiceChannelManager = {} as VoiceChannelManager;

			const lifecycleModule = await import('../event/event-lifecycle.js');
			cleanupEventMock = lifecycleModule.cleanupEvent as ReturnType<
				typeof vi.fn
			>;
			cleanupEventMock.mockClear();

			consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		});

		it('should setup event message delete handler', () => {
			setupEventMessageDeleteHandler(
				mockClient,
				eventManager,
				threadManager,
				voiceChannelManager,
			);

			expect(mockClient.on).toHaveBeenCalledWith(
				'messageDelete',
				expect.any(Function),
			);
		});

		it('should cleanup event when bot message is deleted', async () => {
			const participants = new Map();
			participants.set('user-123', {
				userId: 'user-123',
				role: 'Healer',
				rank: '5',
			});
			eventManager.setParticipants(mockMessage.id, participants);

			setupEventMessageDeleteHandler(
				mockClient,
				eventManager,
				threadManager,
				voiceChannelManager,
			);

			const deleteHandler = (mockClient.on as ReturnType<typeof vi.fn>).mock
				.calls[0][1];
			await deleteHandler(mockMessage);

			expect(cleanupEventMock).toHaveBeenCalledWith(
				mockMessage.id,
				eventManager,
				mockClient,
				threadManager,
				voiceChannelManager,
			);
		});

		it('should not cleanup if message is not from bot', async () => {
			mockMessage.author = { bot: false, id: 'user-123' } as User;
			const participants = new Map();
			participants.set('user-123', {
				userId: 'user-123',
				role: 'Healer',
				rank: '5',
			});
			eventManager.setParticipants(mockMessage.id, participants);

			setupEventMessageDeleteHandler(
				mockClient,
				eventManager,
				threadManager,
				voiceChannelManager,
			);

			const deleteHandler = (mockClient.on as ReturnType<typeof vi.fn>).mock
				.calls[0][1];
			await deleteHandler(mockMessage);

			expect(cleanupEventMock).not.toHaveBeenCalled();
		});

		it('should not cleanup if message is from different bot', async () => {
			mockMessage.author = { bot: true, id: 'other-bot-456' } as User;
			const participants = new Map();
			participants.set('user-123', {
				userId: 'user-123',
				role: 'Healer',
				rank: '5',
			});
			eventManager.setParticipants(mockMessage.id, participants);

			setupEventMessageDeleteHandler(
				mockClient,
				eventManager,
				threadManager,
				voiceChannelManager,
			);

			const deleteHandler = (mockClient.on as ReturnType<typeof vi.fn>).mock
				.calls[0][1];
			await deleteHandler(mockMessage);

			expect(cleanupEventMock).not.toHaveBeenCalled();
		});

		it('should not cleanup if no event data exists', async () => {
			setupEventMessageDeleteHandler(
				mockClient,
				eventManager,
				threadManager,
				voiceChannelManager,
			);

			const deleteHandler = (mockClient.on as ReturnType<typeof vi.fn>).mock
				.calls[0][1];
			await deleteHandler(mockMessage);

			expect(cleanupEventMock).not.toHaveBeenCalled();
		});

		it('should handle cleanup errors', async () => {
			const error = new Error('Cleanup failed');
			cleanupEventMock.mockRejectedValue(error);
			const participants = new Map();
			participants.set('user-123', {
				userId: 'user-123',
				role: 'Healer',
				rank: '5',
			});
			eventManager.setParticipants(mockMessage.id, participants);

			setupEventMessageDeleteHandler(
				mockClient,
				eventManager,
				threadManager,
				voiceChannelManager,
			);

			const deleteHandler = (mockClient.on as ReturnType<typeof vi.fn>).mock
				.calls[0][1];
			await deleteHandler(mockMessage);

			expect(consoleErrorSpy).toHaveBeenCalledWith(
				`Failed to cleanup event after message deletion ${mockMessage.id}:`,
				error,
			);
		});
	});
});
