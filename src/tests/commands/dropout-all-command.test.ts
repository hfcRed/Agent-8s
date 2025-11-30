import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleDropoutAllCommand } from '../../commands/dropout-all-command.js';
import { ERROR_MESSAGES, SUCCESS_MESSAGES } from '../../constants.js';

vi.mock('../../utils/error-handler.js', () => ({
	handleError: vi.fn(),
	ErrorSeverity: { LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH' },
}));

vi.mock('../../utils/helpers.js', () => ({
	safeReplyToInteraction: vi.fn(),
}));

vi.mock('../../utils/retry.js', () => ({
	withRetryOrNull: vi.fn((fn) => fn()),
	LOW_RETRY_OPTIONS: {},
}));

vi.mock('../../event/event-lifecycle.js', () => ({
	cleanupEvent: vi.fn().mockResolvedValue(undefined),
	promoteNextFromQueue: vi.fn().mockResolvedValue(undefined),
}));

describe('dropout-all-command', () => {
	let mockInteraction: ReturnType<typeof createMockInteraction>;
	let mockEventManager: ReturnType<typeof createMockEventManager>;
	let mockAppClient: ReturnType<typeof createMockAppClient>;
	let mockThreadManager: ReturnType<typeof createMockThreadManager>;
	let mockVoiceChannelManager: ReturnType<typeof createMockVoiceChannelManager>;
	let mockTelemetry: ReturnType<typeof createMockTelemetry>;

	function createMockInteraction() {
		return {
			user: { id: 'user123' },
			guild: { id: 'guild123' },
			guildId: 'guild123',
			channelId: 'channel123',
			deferReply: vi.fn().mockResolvedValue(undefined),
			editReply: vi.fn().mockResolvedValue(undefined),
		};
	}

	function createMockAppClient() {
		const mockChannel = {
			id: 'channel123',
			isTextBased: () => true,
			messages: {
				fetch: vi.fn().mockResolvedValue({
					id: 'message123',
					embeds: [{ data: {} }],
					edit: vi.fn().mockResolvedValue(undefined),
				}),
			},
		};

		return {
			channels: {
				fetch: vi.fn().mockResolvedValue(mockChannel),
			},
			guilds: {
				cache: {
					get: vi.fn().mockReturnValue({ id: 'guild123' }),
				},
			},
		};
	}

	function createMockEventManager() {
		const participants = new Map([
			['user123', { userId: 'user123', role: 'None', rank: null }],
			['user456', { userId: 'user456', role: 'Tank', rank: null }],
		]);

		return {
			userOwnsEvent: vi.fn(() => undefined),
			getUserEventId: vi.fn(() => undefined),
			getParticipants: vi.fn(() => participants),
			getAllParticipants: vi.fn(() => []),
			getTimer: vi.fn(() => ({
				startTime: Date.now(),
				duration: undefined,
				hasStarted: false,
			})),
			getChannelId: vi.fn(() => 'channel123'),
			getGuildId: vi.fn(() => 'guild123'),
			getThread: vi.fn(() => undefined),
			getVoiceChannels: vi.fn(() => undefined),
			getMatchId: vi.fn(() => 'match123'),
			getQueue: vi.fn(() => []),
			removeParticipant: vi.fn(),
			removeSpectator: vi.fn(),
			removeFromQueue: vi.fn(),
			isUserSpectating: vi.fn(() => false),
			setProcessing: vi.fn(),
			clearProcessing: vi.fn(),
			setTerminalState: vi.fn(),
			queueUpdate: vi.fn(),
		};
	}

	function createMockThreadManager() {
		return {
			fetchThread: vi.fn().mockResolvedValue({
				id: 'thread123',
				name: 'thread',
			}),
			removeMember: vi.fn().mockResolvedValue(undefined),
		};
	}

	function createMockVoiceChannelManager() {
		return {
			revokeAccessFromChannels: vi.fn().mockResolvedValue(undefined),
		};
	}

	function createMockTelemetry() {
		return {
			trackEventCancelled: vi.fn(),
			trackUserDropOut: vi.fn(),
			trackUserLeftQueue: vi.fn(),
			trackUserStoppedSpectating: vi.fn(),
		};
	}

	beforeEach(() => {
		vi.clearAllMocks();
		mockInteraction = createMockInteraction();
		mockEventManager = createMockEventManager();
		mockAppClient = createMockAppClient();
		mockThreadManager = createMockThreadManager();
		mockVoiceChannelManager = createMockVoiceChannelManager();
		mockTelemetry = createMockTelemetry();
	});

	describe('handleDropoutAllCommand', () => {
		it('should respond with not in events message when user has no involvement', async () => {
			await handleDropoutAllCommand(
				mockInteraction as never,
				mockEventManager as never,
				mockAppClient as never,
				mockThreadManager as never,
				mockVoiceChannelManager as never,
				mockTelemetry as never,
			);

			expect(mockInteraction.editReply).toHaveBeenCalledWith({
				content: ERROR_MESSAGES.DROPOUT_ALL_NOT_IN_EVENTS,
			});
		});

		it('should cancel owned event and cleanup', async () => {
			mockEventManager.userOwnsEvent.mockReturnValue('event123' as never);

			await handleDropoutAllCommand(
				mockInteraction as never,
				mockEventManager as never,
				mockAppClient as never,
				mockThreadManager as never,
				mockVoiceChannelManager as never,
				mockTelemetry as never,
			);

			expect(mockEventManager.setProcessing).toHaveBeenCalledWith(
				'event123',
				'cancelling',
			);
			expect(mockEventManager.setTerminalState).toHaveBeenCalledWith(
				'event123',
				'cancelled',
			);
			expect(mockTelemetry.trackEventCancelled).toHaveBeenCalled();
			expect(mockInteraction.editReply).toHaveBeenCalledWith({
				content: SUCCESS_MESSAGES.DROPOUT_ALL_SUCCESS,
			});
		});

		it('should remove user from participating event', async () => {
			mockEventManager.getUserEventId.mockReturnValue('event456' as never);

			await handleDropoutAllCommand(
				mockInteraction as never,
				mockEventManager as never,
				mockAppClient as never,
				mockThreadManager as never,
				mockVoiceChannelManager as never,
				mockTelemetry as never,
			);

			expect(mockEventManager.removeParticipant).toHaveBeenCalledWith(
				'event456',
				'user123',
			);
			expect(mockTelemetry.trackUserDropOut).toHaveBeenCalled();
			expect(mockInteraction.editReply).toHaveBeenCalledWith({
				content: SUCCESS_MESSAGES.DROPOUT_ALL_SUCCESS,
			});
		});

		it('should remove user from all queues', async () => {
			const participantsMap = new Map([
				['other123', { userId: 'other123', role: 'None', rank: null }],
			]);
			mockEventManager.getAllParticipants.mockReturnValue([
				['event789', participantsMap],
			] as never);
			mockEventManager.getQueue.mockReturnValue([
				'user123',
				'other456',
			] as never);

			await handleDropoutAllCommand(
				mockInteraction as never,
				mockEventManager as never,
				mockAppClient as never,
				mockThreadManager as never,
				mockVoiceChannelManager as never,
				mockTelemetry as never,
			);

			expect(mockEventManager.removeFromQueue).toHaveBeenCalledWith(
				'event789',
				'user123',
			);
			expect(mockTelemetry.trackUserLeftQueue).toHaveBeenCalled();
			expect(mockInteraction.editReply).toHaveBeenCalledWith({
				content: SUCCESS_MESSAGES.DROPOUT_ALL_SUCCESS,
			});
		});

		it('should remove user from all spectator lists', async () => {
			const participantsMap = new Map([
				['other123', { userId: 'other123', role: 'None', rank: null }],
			]);
			mockEventManager.getAllParticipants.mockReturnValue([
				['event789', participantsMap],
			] as never);
			mockEventManager.isUserSpectating.mockReturnValue(true as never);

			await handleDropoutAllCommand(
				mockInteraction as never,
				mockEventManager as never,
				mockAppClient as never,
				mockThreadManager as never,
				mockVoiceChannelManager as never,
				mockTelemetry as never,
			);

			expect(mockEventManager.removeSpectator).toHaveBeenCalledWith(
				'event789',
				'user123',
			);
			expect(mockTelemetry.trackUserStoppedSpectating).toHaveBeenCalled();
			expect(mockInteraction.editReply).toHaveBeenCalledWith({
				content: SUCCESS_MESSAGES.DROPOUT_ALL_SUCCESS,
			});
		});

		it('should remove thread access when spectating', async () => {
			const participantsMap = new Map([
				['other123', { userId: 'other123', role: 'None', rank: null }],
			]);
			mockEventManager.getAllParticipants.mockReturnValue([
				['event789', participantsMap],
			] as never);
			mockEventManager.isUserSpectating.mockReturnValue(true as never);
			mockEventManager.getThread.mockReturnValue('thread123' as never);

			await handleDropoutAllCommand(
				mockInteraction as never,
				mockEventManager as never,
				mockAppClient as never,
				mockThreadManager as never,
				mockVoiceChannelManager as never,
				mockTelemetry as never,
			);

			expect(mockThreadManager.removeMember).toHaveBeenCalled();
		});

		it('should revoke voice channel access when spectating', async () => {
			const participantsMap = new Map([
				['other123', { userId: 'other123', role: 'None', rank: null }],
			]);
			mockEventManager.getAllParticipants.mockReturnValue([
				['event789', participantsMap],
			] as never);
			mockEventManager.isUserSpectating.mockReturnValue(true as never);
			mockEventManager.getVoiceChannels.mockReturnValue(['voice123'] as never);

			await handleDropoutAllCommand(
				mockInteraction as never,
				mockEventManager as never,
				mockAppClient as never,
				mockThreadManager as never,
				mockVoiceChannelManager as never,
				mockTelemetry as never,
			);

			expect(
				mockVoiceChannelManager.revokeAccessFromChannels,
			).toHaveBeenCalled();
		});

		it('should handle multiple cleanup scenarios at once', async () => {
			// User owns one event and is in queue for another
			mockEventManager.userOwnsEvent.mockReturnValue('ownedEvent' as never);

			const participantsMap = new Map([
				['other123', { userId: 'other123', role: 'None', rank: null }],
			]);
			mockEventManager.getAllParticipants.mockReturnValue([
				['queuedEvent', participantsMap],
			] as never);
			mockEventManager.getQueue.mockReturnValue(['user123'] as never);

			await handleDropoutAllCommand(
				mockInteraction as never,
				mockEventManager as never,
				mockAppClient as never,
				mockThreadManager as never,
				mockVoiceChannelManager as never,
				mockTelemetry as never,
			);

			expect(mockEventManager.setTerminalState).toHaveBeenCalledWith(
				'ownedEvent',
				'cancelled',
			);
			expect(mockEventManager.removeFromQueue).toHaveBeenCalledWith(
				'queuedEvent',
				'user123',
			);
			expect(mockInteraction.editReply).toHaveBeenCalledWith({
				content: SUCCESS_MESSAGES.DROPOUT_ALL_SUCCESS,
			});
		});

		it('should remove from thread when leaving participating event', async () => {
			mockEventManager.getUserEventId.mockReturnValue('event456' as never);
			mockEventManager.getThread.mockReturnValue('thread123' as never);

			await handleDropoutAllCommand(
				mockInteraction as never,
				mockEventManager as never,
				mockAppClient as never,
				mockThreadManager as never,
				mockVoiceChannelManager as never,
				mockTelemetry as never,
			);

			expect(mockThreadManager.removeMember).toHaveBeenCalled();
		});

		it('should revoke voice access when leaving participating event', async () => {
			mockEventManager.getUserEventId.mockReturnValue('event456' as never);
			mockEventManager.getVoiceChannels.mockReturnValue(['voice123'] as never);

			await handleDropoutAllCommand(
				mockInteraction as never,
				mockEventManager as never,
				mockAppClient as never,
				mockThreadManager as never,
				mockVoiceChannelManager as never,
				mockTelemetry as never,
			);

			expect(
				mockVoiceChannelManager.revokeAccessFromChannels,
			).toHaveBeenCalledWith(
				mockAppClient,
				['voice123'],
				'user123',
				mockInteraction.guild,
			);
		});

		it('should promote next from queue when leaving started event', async () => {
			const { promoteNextFromQueue } = await import(
				'../../event/event-lifecycle.js'
			);
			mockEventManager.getUserEventId.mockReturnValue('event456' as never);
			mockEventManager.getTimer.mockReturnValue({
				startTime: Date.now(),
				duration: undefined,
				hasStarted: true,
			} as never);

			await handleDropoutAllCommand(
				mockInteraction as never,
				mockEventManager as never,
				mockAppClient as never,
				mockThreadManager as never,
				mockVoiceChannelManager as never,
				mockTelemetry as never,
			);

			expect(promoteNextFromQueue).toHaveBeenCalled();
		});
	});
});
