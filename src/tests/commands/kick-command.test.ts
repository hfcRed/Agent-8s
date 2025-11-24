import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleKickCommand } from '../../commands/kick-command.js';
import { ERROR_MESSAGES, SUCCESS_MESSAGES } from '../../constants.js';

vi.mock('../../utils/error-handler.js', () => ({
	handleError: vi.fn(),
	ErrorSeverity: { LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH' },
}));

vi.mock('../../utils/helpers.js', () => ({
	checkProcessingStates: vi.fn().mockResolvedValue(false),
	safeReplyToInteraction: vi.fn(),
}));

vi.mock('../../utils/retry.js', () => ({
	withRetry: vi.fn((fn) => fn()),
	MEDIUM_RETRY_OPTIONS: {},
}));

vi.mock('../../utils/embed-utils.js', () => ({
	updateParticipantFields: vi.fn(),
	updateQueueField: vi.fn(),
}));

vi.mock('../../event/event-lifecycle.js', () => ({
	promoteNextFromQueue: vi.fn().mockResolvedValue(undefined),
}));

describe('kick-command', () => {
	let mockInteraction: ReturnType<typeof createMockInteraction>;
	let mockEventManager: ReturnType<typeof createMockEventManager>;
	let mockThreadManager: ReturnType<typeof createMockThreadManager>;
	let mockVoiceChannelManager: ReturnType<typeof createMockVoiceChannelManager>;
	let mockTelemetry: ReturnType<typeof createMockTelemetry>;

	function createMockInteraction() {
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

		const mockTargetUser = {
			id: 'target456',
			username: 'targetuser',
		};

		return {
			user: { id: 'user123' },
			guild: { id: 'guild123' },
			guildId: 'guild123',
			channelId: 'channel123',
			options: {
				getUser: vi.fn(() => mockTargetUser),
			},
			client: {
				channels: {
					fetch: vi.fn().mockResolvedValue(mockChannel),
				},
			},
			deferReply: vi.fn().mockResolvedValue(undefined),
			editReply: vi.fn().mockResolvedValue(undefined),
		};
	}

	function createMockEventManager() {
		const participants = new Map([
			['user123', { userId: 'user123', role: 'None', rank: null }],
			['target456', { userId: 'target456', role: 'Tank', rank: null }],
		]);

		return {
			userOwnsEvent: vi.fn(() => 'message123'),
			getParticipants: vi.fn(() => participants),
			getTimer: vi.fn(() => ({
				startTime: Date.now(),
				duration: undefined,
				hasStarted: false,
			})),
			getChannelId: vi.fn(() => 'channel123'),
			getThread: vi.fn(),
			getVoiceChannels: vi.fn(),
			getMatchId: vi.fn(() => 'match123'),
			removeParticipant: vi.fn(),
			getQueue: vi.fn(() => []),
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
			trackUserKicked: vi.fn(),
		};
	}

	beforeEach(() => {
		mockInteraction = createMockInteraction();
		mockEventManager = createMockEventManager();
		mockThreadManager = createMockThreadManager();
		mockVoiceChannelManager = createMockVoiceChannelManager();
		mockTelemetry = createMockTelemetry();
	});

	describe('handleKickCommand', () => {
		it('should kick user and update embed', async () => {
			await handleKickCommand(
				mockInteraction as never,
				mockEventManager as never,
				mockThreadManager as never,
				mockVoiceChannelManager as never,
				mockTelemetry as never,
			);

			expect(mockEventManager.removeParticipant).toHaveBeenCalledWith(
				'message123',
				'target456',
			);
			expect(mockInteraction.editReply).toHaveBeenCalledWith({
				content: SUCCESS_MESSAGES.KICK_SUCCESS('target456'),
			});
		});

		it('should reject if user does not own event', async () => {
			mockEventManager.userOwnsEvent.mockReturnValue(false as never);

			await handleKickCommand(
				mockInteraction as never,
				mockEventManager as never,
				mockThreadManager as never,
				mockVoiceChannelManager as never,
				mockTelemetry as never,
			);

			expect(mockInteraction.editReply).toHaveBeenCalledWith({
				content: ERROR_MESSAGES.NO_EVENT_OWNED,
			});
		});

		it('should reject kicking self', async () => {
			mockInteraction.options.getUser.mockReturnValue({
				id: 'user123',
				username: 'self',
			});

			await handleKickCommand(
				mockInteraction as never,
				mockEventManager as never,
				mockThreadManager as never,
				mockVoiceChannelManager as never,
				mockTelemetry as never,
			);

			expect(mockInteraction.editReply).toHaveBeenCalledWith({
				content: ERROR_MESSAGES.KICK_SELF,
			});
		});

		it('should reject if target not in event', async () => {
			const participants = new Map([
				['user123', { userId: 'user123', role: 'None', rank: null }],
			]);
			mockEventManager.getParticipants.mockReturnValue(participants);

			await handleKickCommand(
				mockInteraction as never,
				mockEventManager as never,
				mockThreadManager as never,
				mockVoiceChannelManager as never,
				mockTelemetry as never,
			);

			expect(mockInteraction.editReply).toHaveBeenCalledWith({
				content: ERROR_MESSAGES.KICK_NOT_PARTICIPANT('target456'),
			});
		});

		it('should remove thread access', async () => {
			mockEventManager.getThread.mockReturnValue('thread123' as never);

			await handleKickCommand(
				mockInteraction as never,
				mockEventManager as never,
				mockThreadManager as never,
				mockVoiceChannelManager as never,
				mockTelemetry as never,
			);

			expect(mockThreadManager.removeMember).toHaveBeenCalled();
		});

		it('should revoke voice channel access', async () => {
			mockEventManager.getVoiceChannels.mockReturnValue(['voice123'] as never);

			await handleKickCommand(
				mockInteraction as never,
				mockEventManager as never,
				mockThreadManager as never,
				mockVoiceChannelManager as never,
				mockTelemetry as never,
			);

			expect(
				mockVoiceChannelManager.revokeAccessFromChannels,
			).toHaveBeenCalledWith(
				mockInteraction.client,
				['voice123'],
				'target456',
				mockInteraction.guild,
			);
		});

		it('should track kick with telemetry', async () => {
			await handleKickCommand(
				mockInteraction as never,
				mockEventManager as never,
				mockThreadManager as never,
				mockVoiceChannelManager as never,
				mockTelemetry as never,
			);

			expect(mockTelemetry.trackUserKicked).toHaveBeenCalledWith(
				expect.objectContaining({
					userId: 'user123',
					targetUserId: 'target456',
					matchId: 'match123',
				}),
			);
		});

		it('should reject if channel not found', async () => {
			mockEventManager.getChannelId.mockReturnValue(undefined as never);

			await handleKickCommand(
				mockInteraction as never,
				mockEventManager as never,
				mockThreadManager as never,
				mockVoiceChannelManager as never,
				mockTelemetry as never,
			);

			expect(mockInteraction.editReply).toHaveBeenCalledWith({
				content: ERROR_MESSAGES.CHANNEL_NOT_FOUND,
			});
		});
	});
});
