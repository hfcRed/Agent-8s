import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FIELD_NAMES, STATUS_MESSAGES } from '../../constants.js';
import {
	cleanupEvent,
	createEventStartTimeout,
	startEvent,
} from '../../event/event-lifecycle.js';

vi.mock('../../utils/error-handler.js', () => ({
	handleError: vi.fn(),
	ErrorSeverity: { LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH' },
}));

vi.mock('../../utils/helpers.js', () => ({
	checkProcessingStates: vi.fn().mockResolvedValue(false),
}));

vi.mock('../../utils/retry.js', () => ({
	withRetry: vi.fn((fn) => fn()),
	withRetryOrNull: vi.fn((fn) => fn()),
	LOW_RETRY_OPTIONS: {},
	MEDIUM_RETRY_OPTIONS: {},
}));

vi.mock('../../utils/embed-utils.js', () => ({
	createEventStartedButtons: vi.fn(() => ({ type: 1, components: [] })),
	createRoleSelectMenu: vi.fn(() => ({ type: 1, components: [] })),
	updateEmbedField: vi.fn(),
}));

describe('event-lifecycle', () => {
	let mockMessage: ReturnType<typeof createMockMessage>;
	let mockEventManager: ReturnType<typeof createMockEventManager>;
	let mockClient: ReturnType<typeof createMockClient>;
	let mockThreadManager: ReturnType<typeof createMockThreadManager>;
	let mockVoiceChannelManager: ReturnType<typeof createMockVoiceChannelManager>;
	let mockTelemetry: ReturnType<typeof createMockTelemetry>;

	function createMockMessage() {
		return {
			id: 'message123',
			embeds: [
				{
					data: {
						title: 'Event',
						color: 0x00ff00,
						fields: [{ name: FIELD_NAMES.STATUS, value: STATUS_MESSAGES.OPEN }],
					},
				},
			],
			channel: {
				id: 'channel123',
				isTextBased: () => true,
				isDMBased: () => false,
			},
			channelId: 'channel123',
			guild: { id: 'guild123' },
			client: {},
			edit: vi.fn().mockResolvedValue(undefined),
		};
	}

	function createMockEventManager() {
		const participants = new Map([
			['user1', { userId: 'user1', role: 'Tank', rank: null }],
			['user2', { userId: 'user2', role: 'DPS', rank: null }],
		]);

		return {
			getTimer: vi.fn(() => ({
				startTime: Date.now(),
				duration: undefined,
				hasStarted: false,
			})),
			getMatchId: vi.fn(() => 'match123'),
			getCreator: vi.fn(() => 'user1'),
			getParticipants: vi.fn(() => participants),
			getThread: vi.fn(),
			getVoiceChannels: vi.fn(),
			getChannelId: vi.fn(() => 'channel123'),
			getGuildId: vi.fn(() => 'guild123'),
			getTimeout: vi.fn(),
			getAllTimers: vi.fn(() => []),
			setProcessing: vi.fn(),
			clearProcessing: vi.fn(),
			isProcessing: vi.fn(() => false),
			setThread: vi.fn(),
			setVoiceChannels: vi.fn(),
			setTimeout: vi.fn(),
			deleteTimeout: vi.fn(),
			deleteRepingMessageIfExists: vi.fn().mockResolvedValue(undefined),
			clearAllEventData: vi.fn(),
			deleteProcessingStates: vi.fn(),
			queueUpdate: vi.fn(),
		};
	}

	function createMockClient() {
		return {
			user: { id: 'bot123' },
			channels: {
				fetch: vi.fn().mockResolvedValue({
					id: 'channel123',
					isTextBased: () => true,
					isDMBased: () => false,
					messages: {
						fetch: vi.fn().mockResolvedValue({
							id: 'message123',
							embeds: [{ data: {} }],
							edit: vi.fn(),
						}),
					},
				}),
			},
		};
	}

	function createMockThreadManager() {
		return {
			createEventThread: vi.fn().mockResolvedValue({
				id: 'thread123',
				name: 'Event Thread',
			}),
			fetchThread: vi.fn().mockResolvedValue({
				id: 'thread123',
				name: 'Event Thread',
			}),
			sendAndPinEmbed: vi.fn().mockResolvedValue(undefined),
			sendMessage: vi.fn().mockResolvedValue(undefined),
			addMembers: vi.fn().mockResolvedValue(undefined),
			lockAndArchive: vi.fn().mockResolvedValue(undefined),
		};
	}

	function createMockVoiceChannelManager() {
		return {
			createEventVoiceChannels: vi.fn().mockResolvedValue(['voice1', 'voice2']),
			deleteChannels: vi.fn().mockResolvedValue(undefined),
		};
	}

	function createMockTelemetry() {
		return {
			trackEventStarted: vi.fn(),
			trackEventExpired: vi.fn(),
		};
	}

	beforeEach(() => {
		mockMessage = createMockMessage();
		mockEventManager = createMockEventManager();
		mockClient = createMockClient();
		mockThreadManager = createMockThreadManager();
		mockVoiceChannelManager = createMockVoiceChannelManager();
		mockTelemetry = createMockTelemetry();
		vi.clearAllTimers();
	});

	describe('startEvent', () => {
		it('should start event and create resources', async () => {
			const participants = new Map([
				['user1', { userId: 'user1', role: 'Tank', rank: null }],
			]);

			await startEvent(
				mockMessage as never,
				participants,
				mockEventManager as never,
				mockClient as never,
				mockThreadManager as never,
				mockVoiceChannelManager as never,
				mockTelemetry as never,
			);

			expect(mockThreadManager.createEventThread).toHaveBeenCalled();
			expect(
				mockVoiceChannelManager.createEventVoiceChannels,
			).toHaveBeenCalled();
		});

		it('should set processing state during start', async () => {
			const participants = new Map();

			await startEvent(
				mockMessage as never,
				participants,
				mockEventManager as never,
				mockClient as never,
				mockThreadManager as never,
				mockVoiceChannelManager as never,
				mockTelemetry as never,
			);

			expect(mockEventManager.setProcessing).toHaveBeenCalledWith(
				'message123',
				'starting',
			);
			expect(mockEventManager.clearProcessing).toHaveBeenCalledWith(
				'message123',
				'starting',
			);
		});

		it('should delete reping message', async () => {
			const participants = new Map();

			await startEvent(
				mockMessage as never,
				participants,
				mockEventManager as never,
				mockClient as never,
				mockThreadManager as never,
				mockVoiceChannelManager as never,
				mockTelemetry as never,
			);

			expect(mockEventManager.deleteRepingMessageIfExists).toHaveBeenCalledWith(
				'message123',
				mockClient,
			);
		});

		it('should clear existing timeout', async () => {
			const participants = new Map();
			const mockTimeout = setTimeout(() => {}, 1000);
			mockEventManager.getTimeout.mockReturnValue(mockTimeout as never);

			await startEvent(
				mockMessage as never,
				participants,
				mockEventManager as never,
				mockClient as never,
				mockThreadManager as never,
				mockVoiceChannelManager as never,
				mockTelemetry as never,
			);

			expect(mockEventManager.deleteTimeout).toHaveBeenCalledWith('message123');
		});

		it('should add members to thread', async () => {
			const participants = new Map([
				['user1', { userId: 'user1', role: 'Tank', rank: null }],
				['user2', { userId: 'user2', role: 'DPS', rank: null }],
			]);

			await startEvent(
				mockMessage as never,
				participants,
				mockEventManager as never,
				mockClient as never,
				mockThreadManager as never,
				mockVoiceChannelManager as never,
				mockTelemetry as never,
			);

			expect(mockThreadManager.addMembers).toHaveBeenCalledWith(
				expect.anything(),
				['user1', 'user2'],
			);
		});

		it('should track event start with telemetry', async () => {
			const participants = new Map([
				['user1', { userId: 'user1', role: 'Tank', rank: null }],
			]);

			await startEvent(
				mockMessage as never,
				participants,
				mockEventManager as never,
				mockClient as never,
				mockThreadManager as never,
				mockVoiceChannelManager as never,
				mockTelemetry as never,
			);

			expect(mockTelemetry.trackEventStarted).toHaveBeenCalledWith(
				expect.objectContaining({
					matchId: 'match123',
					eventId: 'message123',
				}),
			);
		});

		it('should not start if already started', async () => {
			const participants = new Map();
			mockEventManager.getTimer.mockReturnValue({
				startTime: Date.now(),
				duration: undefined,
				hasStarted: true,
			});

			await startEvent(
				mockMessage as never,
				participants,
				mockEventManager as never,
				mockClient as never,
				mockThreadManager as never,
				mockVoiceChannelManager as never,
				mockTelemetry as never,
			);

			expect(mockThreadManager.createEventThread).not.toHaveBeenCalled();
		});
	});

	describe('cleanupEvent', () => {
		it('should cleanup all event resources', async () => {
			mockEventManager.getThread.mockReturnValue('thread123' as never);
			mockEventManager.getVoiceChannels.mockReturnValue(['voice1'] as never);

			await cleanupEvent(
				'message123',
				mockEventManager as never,
				mockClient as never,
				mockThreadManager as never,
				mockVoiceChannelManager as never,
			);

			expect(mockThreadManager.lockAndArchive).toHaveBeenCalled();
			expect(mockVoiceChannelManager.deleteChannels).toHaveBeenCalled();
			expect(mockEventManager.clearAllEventData).toHaveBeenCalledWith(
				'message123',
			);
		});

		it('should set processing state during cleanup', async () => {
			await cleanupEvent(
				'message123',
				mockEventManager as never,
				mockClient as never,
				mockThreadManager as never,
				mockVoiceChannelManager as never,
			);

			expect(mockEventManager.setProcessing).toHaveBeenCalledWith(
				'message123',
				'cleanup',
			);
			expect(mockEventManager.clearProcessing).toHaveBeenCalledWith(
				'message123',
				'cleanup',
			);
		});

		it('should not cleanup if already processing', async () => {
			mockEventManager.isProcessing.mockReturnValue(true);

			await cleanupEvent(
				'message123',
				mockEventManager as never,
				mockClient as never,
				mockThreadManager as never,
				mockVoiceChannelManager as never,
			);

			expect(mockEventManager.clearAllEventData).not.toHaveBeenCalled();
		});

		it('should delete reping message', async () => {
			await cleanupEvent(
				'message123',
				mockEventManager as never,
				mockClient as never,
				mockThreadManager as never,
				mockVoiceChannelManager as never,
			);

			expect(mockEventManager.deleteRepingMessageIfExists).toHaveBeenCalledWith(
				'message123',
				mockClient,
			);
		});

		it('should delete processing states', async () => {
			await cleanupEvent(
				'message123',
				mockEventManager as never,
				mockClient as never,
				mockThreadManager as never,
				mockVoiceChannelManager as never,
			);

			expect(mockEventManager.deleteProcessingStates).toHaveBeenCalledWith(
				'message123',
			);
		});
	});

	describe('createEventStartTimeout', () => {
		beforeEach(() => {
			vi.useFakeTimers();
		});

		afterEach(() => {
			vi.useRealTimers();
		});

		it('should create timeout and update embed', async () => {
			await createEventStartTimeout(
				mockMessage as never,
				5,
				mockEventManager as never,
				mockThreadManager as never,
				mockVoiceChannelManager as never,
				mockTelemetry as never,
			);

			expect(mockEventManager.setTimeout).toHaveBeenCalled();
			expect(mockEventManager.queueUpdate).toHaveBeenCalledWith('message123');
		});

		it('should clear existing timeout', async () => {
			const existingTimeout = setTimeout(() => {}, 1000);
			mockEventManager.getTimeout.mockReturnValue(existingTimeout as never);

			await createEventStartTimeout(
				mockMessage as never,
				5,
				mockEventManager as never,
				mockThreadManager as never,
				mockVoiceChannelManager as never,
				mockTelemetry as never,
			);

			expect(mockEventManager.deleteTimeout).toHaveBeenCalled();
		});
	});
});
