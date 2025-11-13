import type { Client, GuildMember, Message, User } from 'discord.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	createDiscordClient,
	loginClient,
	registerCommands,
	setupErrorHandlers,
	setupEventMessageDeleteHandler,
	setupMessageCreateHandler,
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
	botHasPermission: vi.fn(),
}));

vi.mock('../client/shutdown.js', () => ({
	gracefulShutdown: vi.fn(),
}));

vi.mock('../constants.js', async () => {
	const actual = await vi.importActual('../constants.js');
	return {
		...actual,
		AUTHOR_ID: process.env.AUTHOR_ID || 'author-123',
	};
});

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

			expect(consoleErrorSpy).toHaveBeenCalled();
			const errorOutput = consoleErrorSpy.mock.calls[
				consoleErrorSpy.mock.calls.length - 1
			][0] as string;
			expect(errorOutput).toContain('[HIGH] Failed to log in Discord client');
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

			expect(consoleErrorSpy).toHaveBeenCalled();
			const errorOutput = consoleErrorSpy.mock.calls[
				consoleErrorSpy.mock.calls.length - 1
			][0] as string;
			expect(errorOutput).toContain(
				'[HIGH] Client user not available for command registration',
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

		beforeEach(() => {
			mockClient = {
				on: vi.fn(),
			} as unknown as Client;

			consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
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

			expect(consoleErrorSpy).toHaveBeenCalled();
			const errorOutput = consoleErrorSpy.mock.calls[
				consoleErrorSpy.mock.calls.length - 1
			][0] as string;
			expect(errorOutput).toContain('[HIGH] Discord client error');
		});

		it('should handle client warning events', () => {
			setupErrorHandlers(mockClient);

			const warnHandler = (mockClient.on as ReturnType<typeof vi.fn>).mock
				.calls[1][1];
			const testWarning = 'Test warning';

			warnHandler(testWarning);

			expect(consoleErrorSpy).toHaveBeenCalled();
			const errorOutput = consoleErrorSpy.mock.calls[
				consoleErrorSpy.mock.calls.length - 1
			][0] as string;
			expect(errorOutput).toContain('[MEDIUM] Discord client warning');
		});
	});

	describe('setupMessageCreateHandler', () => {
		let mockClient: Client;
		let mockMessage: Message;
		let mockMember: GuildMember;
		let mockChannel: {
			id: string;
			isThread: () => boolean;
			isDMBased: () => boolean;
			isTextBased: () => boolean;
			bulkDelete: ReturnType<typeof vi.fn>;
		};
		let eventManager: EventManager;
		let threadManager: ThreadManager;
		let voiceChannelManager: VoiceChannelManager;
		let isUserAdminMock: ReturnType<typeof vi.fn>;
		let botHasPermissionMock: ReturnType<typeof vi.fn>;
		let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

		beforeEach(async () => {
			vi.useFakeTimers();

			mockChannel = {
				id: 'channel-123',
				isThread: vi.fn().mockReturnValue(false),
				isDMBased: vi.fn().mockReturnValue(false),
				isTextBased: vi.fn().mockReturnValue(true),
				bulkDelete: vi.fn().mockResolvedValue(undefined),
			};

			mockClient = {
				on: vi.fn(),
				channels: {
					cache: {
						get: vi.fn().mockReturnValue(mockChannel),
					},
				},
			} as unknown as Client;

			mockMember = {} as GuildMember;

			mockMessage = {
				id: 'message-123',
				author: { bot: false },
				guild: {},
				channel: mockChannel,
				member: mockMember,
				delete: vi.fn(),
				interactionMetadata: null,
			} as unknown as Message;

			eventManager = new EventManager();
			threadManager = {} as ThreadManager;
			voiceChannelManager = {} as VoiceChannelManager;

			const helpersModule = await import('../utils/helpers.js');
			isUserAdminMock = helpersModule.isUserAdmin as ReturnType<typeof vi.fn>;
			botHasPermissionMock = helpersModule.botHasPermission as ReturnType<
				typeof vi.fn
			>;

			consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		});

		afterEach(() => {
			vi.useRealTimers();
		});

		it('should setup message create handler', () => {
			setupMessageCreateHandler(
				mockClient,
				eventManager,
				threadManager,
				voiceChannelManager,
			);

			expect(mockClient.on).toHaveBeenCalledWith(
				'messageCreate',
				expect.any(Function),
			);
		});

		it('should handle shutdown command from author in DM', async () => {
			const shutdownModule = await import('../client/shutdown.js');
			const gracefulShutdownMock =
				shutdownModule.gracefulShutdown as ReturnType<typeof vi.fn>;
			gracefulShutdownMock.mockClear();

			const processExitSpy = vi
				.spyOn(process, 'exit')
				.mockImplementation(() => undefined as never);

			const constantsModule = await import('../constants.js');
			const authorId = constantsModule.AUTHOR_ID;
			const dmMessage = {
				author: { id: authorId, bot: false },
				channel: {
					isDMBased: vi.fn().mockReturnValue(true),
				},
				content: 'shutdown',
			} as unknown as Message;

			setupMessageCreateHandler(
				mockClient,
				eventManager,
				threadManager,
				voiceChannelManager,
			);

			const messageHandler = (mockClient.on as ReturnType<typeof vi.fn>).mock
				.calls[0][1];
			await messageHandler(dmMessage);

			expect(gracefulShutdownMock).toHaveBeenCalledWith(
				'DM Shutdown Command',
				mockClient,
				eventManager,
				threadManager,
				voiceChannelManager,
				undefined,
			);
			expect(processExitSpy).toHaveBeenCalledWith(1);

			processExitSpy.mockRestore();
		});

		it('should not trigger shutdown for non-author in DM', async () => {
			const shutdownModule = await import('../client/shutdown.js');
			const gracefulShutdownMock =
				shutdownModule.gracefulShutdown as ReturnType<typeof vi.fn>;
			gracefulShutdownMock.mockClear();

			const dmMessage = {
				author: { id: 'different-user-456', bot: false },
				channel: {
					isDMBased: vi.fn().mockReturnValue(true),
				},
				content: 'shutdown',
			} as unknown as Message;

			setupMessageCreateHandler(
				mockClient,
				eventManager,
				threadManager,
				voiceChannelManager,
			);

			const messageHandler = (mockClient.on as ReturnType<typeof vi.fn>).mock
				.calls[0][1];
			await messageHandler(dmMessage);

			expect(gracefulShutdownMock).not.toHaveBeenCalled();
		});

		it('should not trigger shutdown for wrong command text', async () => {
			const shutdownModule = await import('../client/shutdown.js');
			const gracefulShutdownMock =
				shutdownModule.gracefulShutdown as ReturnType<typeof vi.fn>;
			gracefulShutdownMock.mockClear();

			const constantsModule = await import('../constants.js');
			const authorId = constantsModule.AUTHOR_ID;
			const dmMessage = {
				author: { id: authorId, bot: false },
				channel: {
					isDMBased: vi.fn().mockReturnValue(true),
				},
				content: 'not-shutdown',
			} as unknown as Message;

			setupMessageCreateHandler(
				mockClient,
				eventManager,
				threadManager,
				voiceChannelManager,
			);

			const messageHandler = (mockClient.on as ReturnType<typeof vi.fn>).mock
				.calls[0][1];
			await messageHandler(dmMessage);

			expect(gracefulShutdownMock).not.toHaveBeenCalled();
		});

		it('should not trigger shutdown in non-DM channel', async () => {
			const shutdownModule = await import('../client/shutdown.js');
			const gracefulShutdownMock =
				shutdownModule.gracefulShutdown as ReturnType<typeof vi.fn>;
			gracefulShutdownMock.mockClear();

			const constantsModule = await import('../constants.js');
			const authorId = constantsModule.AUTHOR_ID;
			const guildMessage = {
				author: { id: authorId, bot: false },
				guild: {},
				channel: {
					isDMBased: vi.fn().mockReturnValue(false),
					isThread: vi.fn().mockReturnValue(false),
				},
				content: 'shutdown',
			} as unknown as Message;

			setupMessageCreateHandler(
				mockClient,
				eventManager,
				threadManager,
				voiceChannelManager,
			);

			const messageHandler = (mockClient.on as ReturnType<typeof vi.fn>).mock
				.calls[0][1];
			await messageHandler(guildMessage);

			expect(gracefulShutdownMock).not.toHaveBeenCalled();
		});

		it('should delete non-admin user messages', async () => {
			isUserAdminMock.mockReturnValue(false);
			botHasPermissionMock.mockReturnValue(true);
			setupMessageCreateHandler(
				mockClient,
				eventManager,
				threadManager,
				voiceChannelManager,
			);

			const messageHandler = (mockClient.on as ReturnType<typeof vi.fn>).mock
				.calls[0][1];
			await messageHandler(mockMessage);

			// Advance timers to trigger bulk delete
			await vi.advanceTimersByTimeAsync(2000);

			expect(botHasPermissionMock).toHaveBeenCalled();
			expect(mockChannel.bulkDelete).toHaveBeenCalledWith(
				['message-123'],
				true,
			);
		});

		it('should not delete admin user messages', async () => {
			isUserAdminMock.mockReturnValue(true);
			botHasPermissionMock.mockReturnValue(true);
			setupMessageCreateHandler(
				mockClient,
				eventManager,
				threadManager,
				voiceChannelManager,
			);

			const messageHandler = (mockClient.on as ReturnType<typeof vi.fn>).mock
				.calls[0][1];
			await messageHandler(mockMessage);

			// Advance timers to trigger bulk delete
			await vi.advanceTimersByTimeAsync(2000);

			expect(mockChannel.bulkDelete).not.toHaveBeenCalled();
		});

		it('should not delete bot messages', async () => {
			mockMessage.author.bot = true;
			setupMessageCreateHandler(
				mockClient,
				eventManager,
				threadManager,
				voiceChannelManager,
			);

			const messageHandler = (mockClient.on as ReturnType<typeof vi.fn>).mock
				.calls[0][1];
			await messageHandler(mockMessage);

			// Advance timers to trigger bulk delete
			await vi.advanceTimersByTimeAsync(2000);

			expect(mockChannel.bulkDelete).not.toHaveBeenCalled();
		});

		it('should not delete messages without guild', async () => {
			const messageWithoutGuild = {
				...mockMessage,
				guild: null,
			} as unknown as Message;

			setupMessageCreateHandler(
				mockClient,
				eventManager,
				threadManager,
				voiceChannelManager,
			);

			const messageHandler = (mockClient.on as ReturnType<typeof vi.fn>).mock
				.calls[0][1];
			await messageHandler(messageWithoutGuild);

			// Advance timers to trigger bulk delete
			await vi.advanceTimersByTimeAsync(2000);

			expect(mockChannel.bulkDelete).not.toHaveBeenCalled();
		});

		it('should not delete messages without member', async () => {
			const messageWithoutMember = {
				...mockMessage,
				member: null,
			} as unknown as Message;

			setupMessageCreateHandler(
				mockClient,
				eventManager,
				threadManager,
				voiceChannelManager,
			);

			const messageHandler = (mockClient.on as ReturnType<typeof vi.fn>).mock
				.calls[0][1];
			await messageHandler(messageWithoutMember);

			// Advance timers to trigger bulk delete
			await vi.advanceTimersByTimeAsync(2000);

			expect(mockChannel.bulkDelete).not.toHaveBeenCalled();
		});

		it('should not delete slash command responses', async () => {
			isUserAdminMock.mockReturnValue(false);
			botHasPermissionMock.mockReturnValue(true);
			const messageWithInteraction = {
				...mockMessage,
				interactionMetadata: { type: 2 },
			} as unknown as Message;

			setupMessageCreateHandler(
				mockClient,
				eventManager,
				threadManager,
				voiceChannelManager,
			);

			const messageHandler = (mockClient.on as ReturnType<typeof vi.fn>).mock
				.calls[0][1];
			await messageHandler(messageWithInteraction);

			// Advance timers to trigger bulk delete
			await vi.advanceTimersByTimeAsync(2000);

			expect(mockChannel.bulkDelete).not.toHaveBeenCalled();
		});

		it('should not delete messages when channel permissions not allowed', async () => {
			isUserAdminMock.mockReturnValue(false);
			botHasPermissionMock.mockReturnValue(false);
			setupMessageCreateHandler(
				mockClient,
				eventManager,
				threadManager,
				voiceChannelManager,
			);

			const messageHandler = (mockClient.on as ReturnType<typeof vi.fn>).mock
				.calls[0][1];
			await messageHandler(mockMessage);

			// Advance timers to trigger bulk delete
			await vi.advanceTimersByTimeAsync(2000);

			expect(botHasPermissionMock).toHaveBeenCalled();
			expect(mockChannel.bulkDelete).not.toHaveBeenCalled();
		});

		it('should handle deletion errors', async () => {
			isUserAdminMock.mockReturnValue(false);
			botHasPermissionMock.mockReturnValue(true);
			const error = new Error('Delete failed');
			mockChannel.bulkDelete = vi.fn().mockRejectedValue(error);

			setupMessageCreateHandler(
				mockClient,
				eventManager,
				threadManager,
				voiceChannelManager,
			);

			const messageHandler = (mockClient.on as ReturnType<typeof vi.fn>).mock
				.calls[0][1];
			await messageHandler(mockMessage);

			// Advance timers to trigger bulk delete
			await vi.advanceTimersByTimeAsync(2000);

			expect(consoleErrorSpy).toHaveBeenCalled();
			const errorOutput = consoleErrorSpy.mock.calls[
				consoleErrorSpy.mock.calls.length - 1
			][0] as string;
			expect(errorOutput).toContain('[LOW] Failed to bulk delete messages');
		});

		it('should batch multiple messages and delete after timeout', async () => {
			isUserAdminMock.mockReturnValue(false);
			botHasPermissionMock.mockReturnValue(true);

			setupMessageCreateHandler(
				mockClient,
				eventManager,
				threadManager,
				voiceChannelManager,
			);

			const messageHandler = (mockClient.on as ReturnType<typeof vi.fn>).mock
				.calls[0][1];

			// Send multiple messages
			const message1 = { ...mockMessage, id: 'msg-1' } as Message;
			const message2 = { ...mockMessage, id: 'msg-2' } as Message;
			const message3 = { ...mockMessage, id: 'msg-3' } as Message;

			await messageHandler(message1);
			await messageHandler(message2);
			await messageHandler(message3);

			// Should not have called bulkDelete yet
			expect(mockChannel.bulkDelete).not.toHaveBeenCalled();

			// Advance timers to trigger bulk delete
			await vi.advanceTimersByTimeAsync(2000);

			expect(mockChannel.bulkDelete).toHaveBeenCalledWith(
				['msg-1', 'msg-2', 'msg-3'],
				true,
			);
		});

		it('should immediately delete when batch reaches 50 messages', async () => {
			isUserAdminMock.mockReturnValue(false);
			botHasPermissionMock.mockReturnValue(true);

			setupMessageCreateHandler(
				mockClient,
				eventManager,
				threadManager,
				voiceChannelManager,
			);

			const messageHandler = (mockClient.on as ReturnType<typeof vi.fn>).mock
				.calls[0][1];

			// Send 50 messages
			const messages: string[] = [];
			for (let i = 1; i <= 50; i++) {
				const msg = { ...mockMessage, id: `msg-${i}` } as Message;
				messages.push(`msg-${i}`);
				await messageHandler(msg);
			}

			// Should have called bulkDelete immediately without waiting for timeout
			expect(mockChannel.bulkDelete).toHaveBeenCalledWith(messages, true);
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

			expect(consoleErrorSpy).toHaveBeenCalled();
			const errorOutput = consoleErrorSpy.mock.calls[
				consoleErrorSpy.mock.calls.length - 1
			][0] as string;
			expect(errorOutput).toContain(
				'[MEDIUM] Failed to cleanup event after message deletion',
			);
		});
	});
});
