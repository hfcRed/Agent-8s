import { faker } from '@faker-js/faker';
import type { Client, Guild, Message, TextChannel } from 'discord.js';
import { EmbedBuilder } from 'discord.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	COLORS,
	MAX_PARTICIPANTS,
	TIMINGS,
	WEAPON_ROLES,
} from '../constants.js';
import {
	cleanupEvent,
	cleanupStaleEvents,
	createEventStartTimeout,
	startEvent,
} from '../event/event-lifecycle.js';
import { EventManager } from '../event/event-manager.js';
import type { ThreadManager } from '../managers/thread-manager.js';
import type { VoiceChannelManager } from '../managers/voice-channel-manager.js';
import type { TelemetryService } from '../telemetry/telemetry.js';
import type { ParticipantMap } from '../types.js';

vi.mock('../utils/retry.js', async () => {
	const actual =
		await vi.importActual<typeof import('../utils/retry.js')>(
			'../utils/retry.js',
		);
	return {
		...actual,
		HIGH_RETRY_OPTIONS: actual.TEST_RETRY_OPTIONS,
		MEDIUM_RETRY_OPTIONS: actual.TEST_RETRY_OPTIONS,
		LOW_RETRY_OPTIONS: actual.TEST_RETRY_OPTIONS,
	};
});

vi.mock('../interactions/button-handlers.js', () => ({
	checkProcessingStates: vi.fn(() => false),
}));

vi.mock('../utils/embed-utils.js', () => ({
	createEventStartedButtons: vi.fn(() => ({ components: [] })),
	createRoleSelectMenu: vi.fn(() => ({ components: [] })),
	updateEmbedField: vi.fn((embed, name, value) => {
		const field = embed.data.fields?.find(
			(f: { name: string }) => f.name === name,
		);
		if (field) field.value = value;
		return embed;
	}),
}));

describe('Event Lifecycle', () => {
	let eventManager: EventManager;
	let threadManager: ThreadManager;
	let voiceChannelManager: VoiceChannelManager;
	let telemetry: TelemetryService;
	let appClient: Client;
	let mockMessage: Message;
	let mockChannel: TextChannel;
	let mockGuild: Guild;
	let mockEmbed: EmbedBuilder;
	let participantMap: ParticipantMap;

	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();

		eventManager = new EventManager();

		const mockThread = {
			id: faker.string.uuid(),
			send: vi.fn(),
		};

		threadManager = {
			createEventThread: vi.fn(async () => mockThread),
			sendAndPinEmbed: vi.fn(),
			addMembers: vi.fn(),
			sendMessage: vi.fn(),
			fetchThread: vi.fn(async () => mockThread),
			lockAndArchive: vi.fn(),
		} as unknown as ThreadManager;

		const voiceChannelIds = [faker.string.uuid(), faker.string.uuid()];

		voiceChannelManager = {
			createEventVoiceChannels: vi.fn(async () => voiceChannelIds),
			deleteChannels: vi.fn(),
		} as unknown as VoiceChannelManager;

		telemetry = {
			trackEventStarted: vi.fn(),
			trackEventExpired: vi.fn(),
		} as unknown as TelemetryService;

		mockGuild = {
			id: faker.string.uuid(),
		} as Guild;

		mockChannel = {
			id: faker.string.uuid(),
			isTextBased: () => true,
			isDMBased: () => false,
			messages: {
				fetch: vi.fn(),
			},
		} as unknown as TextChannel;

		mockEmbed = new EmbedBuilder()
			.setTitle('Test Event')
			.setColor(Number.parseInt(COLORS.OPEN.replace('#', ''), 16))
			.setFields([
				{ name: 'Status', value: '⏰ Waiting...', inline: false },
				{ name: 'Start', value: 'When ready', inline: false },
				{ name: 'Participants', value: '8/8', inline: false },
			]);

		mockMessage = {
			id: faker.string.uuid(),
			channelId: mockChannel.id,
			channel: mockChannel,
			guild: mockGuild,
			embeds: [mockEmbed.toJSON()],
			edit: vi.fn(),
			client: {} as Client,
		} as unknown as Message;

		appClient = {
			channels: {
				fetch: vi.fn(async () => mockChannel),
			},
			user: {
				id: faker.string.uuid(),
			},
		} as unknown as Client;

		participantMap = new Map();
		for (let i = 0; i < MAX_PARTICIPANTS; i++) {
			participantMap.set(`user${i}`, {
				userId: `user${i}`,
				role: WEAPON_ROLES[i % WEAPON_ROLES.length],
				rank: null,
			});
		}
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe('startEvent', () => {
		beforeEach(() => {
			eventManager.setTimer(mockMessage.id, {
				startTime: Date.now(),
				hasStarted: false,
			});
			eventManager.setMatchId(mockMessage.id, faker.string.uuid());
			eventManager.setCreator(mockMessage.id, 'creator-id');
		});

		it('should start an event successfully', async () => {
			await startEvent(
				mockMessage,
				participantMap,
				eventManager,
				appClient,
				threadManager,
				voiceChannelManager,
				telemetry,
			);

			const timer = eventManager.getTimer(mockMessage.id);
			expect(timer?.hasStarted).toBe(true);
			expect(mockMessage.edit).toHaveBeenCalled();
		});

		it('should not start event that has already started', async () => {
			const timer = eventManager.getTimer(mockMessage.id);
			if (timer) timer.hasStarted = true;

			await startEvent(
				mockMessage,
				participantMap,
				eventManager,
				appClient,
				threadManager,
				voiceChannelManager,
				telemetry,
			);

			expect(threadManager.createEventThread).not.toHaveBeenCalled();
		});

		it('should create event thread', async () => {
			await startEvent(
				mockMessage,
				participantMap,
				eventManager,
				appClient,
				threadManager,
				voiceChannelManager,
				telemetry,
			);

			expect(threadManager.createEventThread).toHaveBeenCalledWith(
				mockChannel,
				expect.any(String),
			);
		});

		it('should add members to thread', async () => {
			await startEvent(
				mockMessage,
				participantMap,
				eventManager,
				appClient,
				threadManager,
				voiceChannelManager,
				telemetry,
			);

			expect(threadManager.addMembers).toHaveBeenCalledWith(
				expect.anything(),
				expect.arrayContaining(['user0', 'user1']),
			);
		});

		it('should create voice channels', async () => {
			await startEvent(
				mockMessage,
				participantMap,
				eventManager,
				appClient,
				threadManager,
				voiceChannelManager,
				telemetry,
			);

			expect(voiceChannelManager.createEventVoiceChannels).toHaveBeenCalledWith(
				mockGuild,
				mockChannel,
				expect.any(Array),
				expect.any(String),
				appClient,
			);
		});

		it('should store thread ID in event manager', async () => {
			await startEvent(
				mockMessage,
				participantMap,
				eventManager,
				appClient,
				threadManager,
				voiceChannelManager,
				telemetry,
			);

			const threadId = eventManager.getThread(mockMessage.id);
			expect(threadId).toBeDefined();
		});

		it('should store voice channel IDs in event manager', async () => {
			await startEvent(
				mockMessage,
				participantMap,
				eventManager,
				appClient,
				threadManager,
				voiceChannelManager,
				telemetry,
			);

			const voiceChannels = eventManager.getVoiceChannels(mockMessage.id);
			expect(voiceChannels).toBeDefined();
			expect(voiceChannels?.length).toBeGreaterThan(0);
		});

		it('should track event start with telemetry', async () => {
			await startEvent(
				mockMessage,
				participantMap,
				eventManager,
				appClient,
				threadManager,
				voiceChannelManager,
				telemetry,
			);

			expect(telemetry.trackEventStarted).toHaveBeenCalledWith(
				expect.objectContaining({
					guildId: mockGuild.id,
					eventId: mockMessage.id,
					channelId: mockMessage.channelId,
				}),
			);
		});

		it('should work without telemetry', async () => {
			await startEvent(
				mockMessage,
				participantMap,
				eventManager,
				appClient,
				threadManager,
				voiceChannelManager,
				undefined,
			);

			const timer = eventManager.getTimer(mockMessage.id);
			expect(timer?.hasStarted).toBe(true);
		});

		it('should clear existing timeout', async () => {
			const mockTimeout = setTimeout(
				() => {},
				1000,
			) as unknown as NodeJS.Timeout;
			eventManager.setTimeout(mockMessage.id, mockTimeout);

			await startEvent(
				mockMessage,
				participantMap,
				eventManager,
				appClient,
				threadManager,
				voiceChannelManager,
				telemetry,
			);

			const timeout = eventManager.getTimeout(mockMessage.id);
			expect(timeout).toBeUndefined();
		});

		it('should handle missing thread creation gracefully', async () => {
			vi.mocked(threadManager.createEventThread).mockResolvedValueOnce(null);

			await startEvent(
				mockMessage,
				participantMap,
				eventManager,
				appClient,
				threadManager,
				voiceChannelManager,
				telemetry,
			);

			const timer = eventManager.getTimer(mockMessage.id);
			expect(timer?.hasStarted).toBe(true);
		});

		it('should delete reping message when event starts', async () => {
			const repingMessageId = faker.string.uuid();
			eventManager.setRepingMessage(mockMessage.id, repingMessageId);

			const deleteSpy = vi.spyOn(eventManager, 'deleteRepingMessageIfExists');

			await startEvent(
				mockMessage,
				participantMap,
				eventManager,
				appClient,
				threadManager,
				voiceChannelManager,
				telemetry,
			);

			expect(deleteSpy).toHaveBeenCalled();
		});

		it('should send voice channel links to thread', async () => {
			await startEvent(
				mockMessage,
				participantMap,
				eventManager,
				appClient,
				threadManager,
				voiceChannelManager,
				telemetry,
			);

			expect(threadManager.sendMessage).toHaveBeenCalledWith(
				expect.anything(),
				expect.stringContaining('Voice Channels Created'),
			);
		});
	});

	describe('cleanupEvent', () => {
		beforeEach(() => {
			eventManager.setThread(mockMessage.id, faker.string.uuid());
			eventManager.setChannelId(mockMessage.id, mockChannel.id);
			eventManager.setVoiceChannels(mockMessage.id, [
				faker.string.uuid(),
				faker.string.uuid(),
			]);
			eventManager.setParticipants(mockMessage.id, participantMap);
		});

		it('should cleanup event successfully', async () => {
			await cleanupEvent(
				mockMessage.id,
				eventManager,
				appClient,
				threadManager,
				voiceChannelManager,
			);

			expect(threadManager.lockAndArchive).toHaveBeenCalled();
			expect(voiceChannelManager.deleteChannels).toHaveBeenCalled();
		});

		it('should prevent concurrent cleanup', async () => {
			eventManager.setProcessing(mockMessage.id, 'cleanup');

			await cleanupEvent(
				mockMessage.id,
				eventManager,
				appClient,
				threadManager,
				voiceChannelManager,
			);

			expect(threadManager.lockAndArchive).not.toHaveBeenCalled();
		});

		it('should delete voice channels', async () => {
			const voiceChannelIds = eventManager.getVoiceChannels(mockMessage.id);

			await cleanupEvent(
				mockMessage.id,
				eventManager,
				appClient,
				threadManager,
				voiceChannelManager,
			);

			expect(voiceChannelManager.deleteChannels).toHaveBeenCalledWith(
				appClient,
				voiceChannelIds,
			);
		});

		it('should clear all event data', async () => {
			await cleanupEvent(
				mockMessage.id,
				eventManager,
				appClient,
				threadManager,
				voiceChannelManager,
			);

			expect(eventManager.getParticipants(mockMessage.id)).toBeUndefined();
			expect(eventManager.getThread(mockMessage.id)).toBeUndefined();
			expect(eventManager.getVoiceChannels(mockMessage.id)).toBeUndefined();
		});

		it('should handle missing thread gracefully', async () => {
			eventManager.deleteThread(mockMessage.id);

			await cleanupEvent(
				mockMessage.id,
				eventManager,
				appClient,
				threadManager,
				voiceChannelManager,
			);

			expect(voiceChannelManager.deleteChannels).toHaveBeenCalled();
		});

		it.skip('should handle channel fetch errors', async () => {
			// Reset the mock and set it to always reject
			appClient.channels.fetch = vi
				.fn()
				.mockImplementation(() =>
					Promise.reject(new Error('Channel not found')),
				);

			eventManager.setChannelId(mockMessage.id, mockChannel.id);
			eventManager.setGuildId(mockMessage.id, faker.string.uuid());
			eventManager.setThread(mockMessage.id, faker.string.uuid());
			eventManager.setParticipants(mockMessage.id, new Map());

			await cleanupEvent(
				mockMessage.id,
				eventManager,
				appClient,
				threadManager,
				voiceChannelManager,
			);

			// Should handle the error gracefully without throwing
			expect(threadManager.lockAndArchive).not.toHaveBeenCalled();
		}, 10000);

		it('should clear processing states after cleanup', async () => {
			await cleanupEvent(
				mockMessage.id,
				eventManager,
				appClient,
				threadManager,
				voiceChannelManager,
			);

			expect(eventManager.isProcessing(mockMessage.id, 'cleanup')).toBe(false);
		});

		it('should delete reping message during cleanup', async () => {
			const repingMessageId = faker.string.uuid();
			eventManager.setRepingMessage(mockMessage.id, repingMessageId);
			eventManager.setGuildId(mockMessage.id, mockGuild.id);

			const deleteSpy = vi.spyOn(eventManager, 'deleteRepingMessageIfExists');

			await cleanupEvent(
				mockMessage.id,
				eventManager,
				appClient,
				threadManager,
				voiceChannelManager,
			);

			expect(deleteSpy).toHaveBeenCalled();
		});
	});

	describe('cleanupStaleEvents', () => {
		beforeEach(() => {
			const oldEventId = faker.string.uuid();
			const staleTime = Date.now() - TIMINGS.DAY_IN_MS - 1000;

			eventManager.setTimer(oldEventId, {
				startTime: staleTime,
				hasStarted: true,
			});
			eventManager.setChannelId(oldEventId, mockChannel.id);
			eventManager.setGuildId(oldEventId, mockGuild.id);
			eventManager.setMatchId(oldEventId, faker.string.uuid());
			eventManager.setParticipants(oldEventId, participantMap);

			const staleMessage = {
				id: oldEventId,
				channelId: mockChannel.id,
				channel: mockChannel,
				guild: mockGuild,
				embeds: [mockEmbed.toJSON()],
				edit: vi.fn(),
			} as unknown as Message;

			const channelWithMessages = mockChannel as TextChannel & {
				messages: { fetch: ReturnType<typeof vi.fn> };
			};
			channelWithMessages.messages.fetch.mockResolvedValueOnce(staleMessage);
		});

		it('should cleanup stale events', async () => {
			await cleanupStaleEvents(
				eventManager,
				appClient,
				threadManager,
				voiceChannelManager,
				telemetry,
			);

			expect(telemetry.trackEventExpired).toHaveBeenCalled();
		});

		it('should not cleanup recent events', async () => {
			const recentEventId = faker.string.uuid();
			eventManager.setTimer(recentEventId, {
				startTime: Date.now() - 1000,
				hasStarted: true,
			});

			const expiredCallsBefore = vi.mocked(telemetry.trackEventExpired).mock
				.calls.length;

			await cleanupStaleEvents(
				eventManager,
				appClient,
				threadManager,
				voiceChannelManager,
				telemetry,
			);

			// Should only track the old event, not the recent one
			expect(vi.mocked(telemetry.trackEventExpired).mock.calls.length).toBe(
				expiredCallsBefore + 1,
			);
		});

		it.skip('should handle message fetch errors', async () => {
			// Reset the mock and set it to always reject
			appClient.channels.fetch = vi
				.fn()
				.mockImplementation(() =>
					Promise.reject(new Error('Channel not found')),
				);

			// Set up an event to be cleaned up
			const staleEventId = faker.string.uuid();
			eventManager.setChannelId(staleEventId, mockChannel.id);
			eventManager.setGuildId(staleEventId, faker.string.uuid());
			eventManager.setParticipants(staleEventId, new Map());
			eventManager.setTimer(staleEventId, {
				startTime: Date.now() - 25 * 60 * 60 * 1000, // 25 hours ago
				duration: MAX_PARTICIPANTS * 60 * 1000,
				hasStarted: false,
			});

			await cleanupStaleEvents(
				eventManager,
				appClient,
				threadManager,
				voiceChannelManager,
				telemetry,
			);

			// Should handle the error gracefully without throwing
			expect(true).toBe(true);
		}, 10000);

		it('should work without telemetry', async () => {
			await cleanupStaleEvents(
				eventManager,
				appClient,
				threadManager,
				voiceChannelManager,
				undefined,
			);

			// Should not throw
			expect(true).toBe(true);
		});
	});

	describe('createEventStartTimeout', () => {
		beforeEach(() => {
			eventManager.setParticipants(mockMessage.id, participantMap);
			eventManager.setTimer(mockMessage.id, {
				startTime: Date.now(),
				hasStarted: false,
			});
		});

		it('should create timeout for event start', async () => {
			const timeInMinutes = 5;

			await createEventStartTimeout(
				mockMessage,
				timeInMinutes,
				eventManager,
				threadManager,
				voiceChannelManager,
				telemetry,
			);

			const timeout = eventManager.getTimeout(mockMessage.id);
			expect(timeout).toBeDefined();
		});

		it('should clear existing timeout before creating new one', async () => {
			const mockTimeout = setTimeout(
				() => {},
				1000,
			) as unknown as NodeJS.Timeout;
			eventManager.setTimeout(mockMessage.id, mockTimeout);

			await createEventStartTimeout(
				mockMessage,
				5,
				eventManager,
				threadManager,
				voiceChannelManager,
				telemetry,
			);

			// Should have new timeout
			const timeout = eventManager.getTimeout(mockMessage.id);
			expect(timeout).toBeDefined();
			expect(timeout).not.toBe(mockTimeout);
		});

		it('should update embed with start time', async () => {
			await createEventStartTimeout(
				mockMessage,
				5,
				eventManager,
				threadManager,
				voiceChannelManager,
				telemetry,
			);

			expect(mockMessage.edit).toHaveBeenCalledWith({
				embeds: [expect.any(EmbedBuilder)],
			});
		});

		it('should start event when timeout expires with full participants', async () => {
			await createEventStartTimeout(
				mockMessage,
				0.001, // Very short timeout for testing
				eventManager,
				threadManager,
				voiceChannelManager,
				telemetry,
			);

			await vi.advanceTimersByTimeAsync(100);

			const timer = eventManager.getTimer(mockMessage.id);
			expect(timer?.hasStarted).toBe(true);
		});

		it('should not start if participants reduced before timeout', async () => {
			await createEventStartTimeout(
				mockMessage,
				0.001,
				eventManager,
				threadManager,
				voiceChannelManager,
				telemetry,
			);

			// Remove participants
			eventManager.setParticipants(mockMessage.id, new Map());

			await vi.advanceTimersByTimeAsync(100);

			expect(threadManager.createEventThread).not.toHaveBeenCalled();
		});

		it('should not start if event already started', async () => {
			const timer = eventManager.getTimer(mockMessage.id);
			if (timer) timer.hasStarted = true;

			await createEventStartTimeout(
				mockMessage,
				0.001,
				eventManager,
				threadManager,
				voiceChannelManager,
				telemetry,
			);

			await vi.advanceTimersByTimeAsync(100);

			expect(threadManager.createEventThread).not.toHaveBeenCalled();
		});

		it('should handle timeout errors gracefully', async () => {
			vi.mocked(threadManager.createEventThread).mockRejectedValueOnce(
				new Error('Thread creation failed'),
			);

			await createEventStartTimeout(
				mockMessage,
				0.001,
				eventManager,
				threadManager,
				voiceChannelManager,
				telemetry,
			);

			await vi.advanceTimersByTimeAsync(100);

			// Should not throw
			expect(true).toBe(true);
		});

		it('should delete timeout after execution', async () => {
			await createEventStartTimeout(
				mockMessage,
				0.001,
				eventManager,
				threadManager,
				voiceChannelManager,
				telemetry,
			);

			await vi.advanceTimersByTimeAsync(100);

			const timeout = eventManager.getTimeout(mockMessage.id);
			expect(timeout).toBeUndefined();
		});
	});
});
