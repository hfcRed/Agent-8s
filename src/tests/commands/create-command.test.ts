import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleCreateCommand } from '../../commands/create-command.js';
import { ERROR_MESSAGES } from '../../constants.js';

vi.mock('../../utils/embed-utils.js', () => ({
	createEventButtons: vi.fn(() => ({ components: [] })),
	createEventEmbed: vi.fn(() => ({ data: {} })),
	createRoleSelectMenu: vi.fn(() => ({ components: [] })),
}));

vi.mock('../../utils/helpers.js', () => ({
	getExcaliburRankOfUser: vi.fn(() => null),
	getPingsForServer: vi.fn(() => '<@&role123>'),
	safeReplyToInteraction: vi.fn(),
}));

vi.mock('../../utils/error-handler.js', () => ({
	handleError: vi.fn(),
	ErrorSeverity: { LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH' },
}));

vi.mock('../../event/event-lifecycle.js', () => ({
	createEventStartTimeout: vi.fn(),
}));

describe('create-command', () => {
	let mockInteraction: ReturnType<typeof createMockInteraction>;
	let mockEventManager: ReturnType<typeof createMockEventManager>;
	let mockThreadManager: Record<string, never>;
	let mockVoiceChannelManager: Record<string, never>;
	let mockTelemetry: ReturnType<typeof createMockTelemetry>;

	function createMockInteraction() {
		return {
			user: {
				id: 'user123',
				username: 'testuser',
				displayAvatarURL: vi.fn(() => 'http://avatar.url'),
			},
			guild: { id: 'guild123' },
			guildId: 'guild123',
			channelId: 'channel123',
			client: {},
			options: {
				getBoolean: vi.fn(() => false),
				getString: vi.fn(() => null),
				getInteger: vi.fn(() => null),
			},
			reply: vi.fn().mockResolvedValue({
				fetch: vi.fn().mockResolvedValue({
					id: 'message123',
					channelId: 'channel123',
				}),
			}),
			deferReply: vi.fn().mockResolvedValue({
				fetch: vi.fn().mockResolvedValue({
					id: 'message123',
					channelId: 'channel123',
				}),
			}),
			editReply: vi.fn().mockResolvedValue({
				fetch: vi.fn().mockResolvedValue({
					id: 'message123',
					channelId: 'channel123',
				}),
			}),
		};
	}

	function createMockEventManager() {
		return {
			isUserInAnyEvent: vi.fn(() => false),
			setCreator: vi.fn(),
			setMatchId: vi.fn(),
			setChannelId: vi.fn(),
			setTimer: vi.fn(),
			setParticipants: vi.fn(),
			setGuildId: vi.fn(),
			setMessageData: vi.fn(),
			getParticipants: vi.fn(() => new Map()),
			removeUserFromAllQueues: vi.fn().mockResolvedValue(undefined),
		};
	}

	function createMockTelemetry() {
		return {
			trackEventCreated: vi.fn(),
		};
	}

	beforeEach(() => {
		vi.clearAllMocks();
		mockInteraction = createMockInteraction();
		mockEventManager = createMockEventManager();
		mockThreadManager = {};
		mockVoiceChannelManager = {};
		mockTelemetry = createMockTelemetry();
	});

	describe('user already in event', () => {
		it('should reject if user is already in an event', async () => {
			mockEventManager.isUserInAnyEvent.mockReturnValue(true);

			await handleCreateCommand(
				mockInteraction as never,
				mockEventManager as never,
				mockThreadManager as never,
				mockVoiceChannelManager as never,
				mockTelemetry as never,
			);

			expect(mockInteraction.reply).toHaveBeenCalledWith({
				content: ERROR_MESSAGES.ALREADY_SIGNED_UP,
				flags: ['Ephemeral'],
			});
			expect(mockInteraction.reply).toHaveBeenCalledWith({
				content: ERROR_MESSAGES.ALREADY_SIGNED_UP,
				flags: ['Ephemeral'],
			});
		});
	});

	describe('event creation flow', () => {
		it('should defer reply and create event when user is available', async () => {
			await handleCreateCommand(
				mockInteraction as never,
				mockEventManager as never,
				mockThreadManager as never,
				mockVoiceChannelManager as never,
				mockTelemetry as never,
			);

			expect(mockInteraction.reply).toHaveBeenCalled();
			expect(mockEventManager.setCreator).toHaveBeenCalledWith(
				'message123',
				'user123',
			);
		});

		it('should store event metadata', async () => {
			await handleCreateCommand(
				mockInteraction as never,
				mockEventManager as never,
				mockThreadManager as never,
				mockVoiceChannelManager as never,
				mockTelemetry as never,
			);

			expect(mockEventManager.setMatchId).toHaveBeenCalled();
			expect(mockEventManager.setChannelId).toHaveBeenCalled();
			expect(mockEventManager.setTimer).toHaveBeenCalled();
			expect(mockEventManager.setParticipants).toHaveBeenCalled();
		});

		it('should add creator as first participant', async () => {
			await handleCreateCommand(
				mockInteraction as never,
				mockEventManager as never,
				mockThreadManager as never,
				mockVoiceChannelManager as never,
				mockTelemetry as never,
			);

			const setParticipantsCall =
				mockEventManager.setParticipants.mock.calls[0];
			const participantMap = setParticipantsCall[1];
			expect(participantMap.has('user123')).toBe(true);
			expect(participantMap.get('user123')).toEqual(
				expect.objectContaining({
					userId: 'user123',
					role: expect.any(String),
				}),
			);
		});
	});

	describe('command options', () => {
		it('should handle casual mode', async () => {
			mockInteraction.options.getBoolean.mockImplementation(
				((key: string) => key === 'casual') as never,
			);

			await handleCreateCommand(
				mockInteraction as never,
				mockEventManager as never,
				mockThreadManager as never,
				mockVoiceChannelManager as never,
				mockTelemetry as never,
			);

			expect(mockEventManager.setCreator).toHaveBeenCalled();
		});

		it('should handle custom time and create timeout', async () => {
			mockInteraction.options.getInteger.mockImplementation(((key: string) =>
				key === 'time' ? 30 : null) as never);
			const { createEventStartTimeout } = await import(
				'../../event/event-lifecycle.js'
			);

			await handleCreateCommand(
				mockInteraction as never,
				mockEventManager as never,
				mockThreadManager as never,
				mockVoiceChannelManager as never,
				mockTelemetry as never,
			);

			expect(createEventStartTimeout).toHaveBeenCalled();
			const timerCall = mockEventManager.setTimer.mock.calls[0][1];
			expect(timerCall).toHaveProperty('duration');
		});

		it('should handle info text', async () => {
			mockInteraction.options.getString.mockImplementation(((key: string) =>
				key === 'info' ? 'Test event info' : null) as never);

			await handleCreateCommand(
				mockInteraction as never,
				mockEventManager as never,
				mockThreadManager as never,
				mockVoiceChannelManager as never,
				mockTelemetry as never,
			);

			expect(mockEventManager.setCreator).toHaveBeenCalled();
		});

		it('should not create timeout without time option', async () => {
			const { createEventStartTimeout } = await import(
				'../../event/event-lifecycle.js'
			);
			(createEventStartTimeout as ReturnType<typeof vi.fn>).mockClear();

			await handleCreateCommand(
				mockInteraction as never,
				mockEventManager as never,
				mockThreadManager as never,
				mockVoiceChannelManager as never,
				mockTelemetry as never,
			);

			expect(createEventStartTimeout).not.toHaveBeenCalled();
		});
	});

	describe('telemetry', () => {
		it('should track event creation with telemetry', async () => {
			await handleCreateCommand(
				mockInteraction as never,
				mockEventManager as never,
				mockThreadManager as never,
				mockVoiceChannelManager as never,
				mockTelemetry as never,
			);

			expect(mockTelemetry.trackEventCreated).toHaveBeenCalledWith(
				expect.objectContaining({
					guildId: 'guild123',
					userId: 'user123',
					channelId: 'channel123',
				}),
			);
		});

		it('should work without telemetry service', async () => {
			await handleCreateCommand(
				mockInteraction as never,
				mockEventManager as never,
				mockThreadManager as never,
				mockVoiceChannelManager as never,
			);

			expect(mockEventManager.setCreator).toHaveBeenCalled();
		});
	});

	describe('error handling', () => {
		it('should handle errors and call safeReplyToInteraction', async () => {
			mockInteraction.reply.mockRejectedValue(new Error('Network error'));
			const { safeReplyToInteraction } = await import('../../utils/helpers.js');

			await handleCreateCommand(
				mockInteraction as never,
				mockEventManager as never,
				mockThreadManager as never,
				mockVoiceChannelManager as never,
				mockTelemetry as never,
			);

			expect(safeReplyToInteraction).toHaveBeenCalled();
		});
	});
});
