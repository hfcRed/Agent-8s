import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleRepingCommand } from '../../commands/reping-command.js';
import { ERROR_MESSAGES, TIMINGS } from '../../constants.js';

vi.mock('../../utils/error-handler.js', () => ({
	handleError: vi.fn(),
	ErrorSeverity: { LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH' },
}));

vi.mock('../../utils/helpers.js', () => ({
	checkProcessingStates: vi.fn().mockResolvedValue(false),
	safeReplyToInteraction: vi.fn(),
	getPingsForServer: vi.fn(() => '<@&role123>'),
}));

vi.mock('../../utils/retry.js', () => ({
	withRetry: vi.fn((fn) => fn()),
	MEDIUM_RETRY_OPTIONS: {},
}));

describe('reping-command', () => {
	let mockInteraction: ReturnType<typeof createMockInteraction>;
	let mockEventManager: ReturnType<typeof createMockEventManager>;
	let mockTelemetry: ReturnType<typeof createMockTelemetry>;

	function createMockInteraction() {
		const mockMessage = {
			id: 'message123',
			embeds: [{ title: 'Event Title' }],
		};

		const mockReply = {
			id: 'reply456',
			fetch: vi.fn().mockResolvedValue({ id: 'reply456' }),
		};

		const mockChannel = {
			id: 'channel123',
			isTextBased: () => true,
			messages: {
				fetch: vi.fn().mockResolvedValue(mockMessage),
			},
		};

		return {
			user: { id: 'user123' },
			guild: { id: 'guild123' },
			guildId: 'guild123',
			channelId: 'channel123',
			client: {
				channels: {
					fetch: vi.fn().mockResolvedValue(mockChannel),
				},
			},
			reply: vi.fn().mockResolvedValue(mockReply),
			deferreply: vi.fn().mockResolvedValue(mockReply),
			editReply: vi.fn().mockResolvedValue(mockReply),
		};
	}

	function createMockEventManager() {
		const participants = new Map([
			['user123', { userId: 'user123', role: 'None', rank: null }],
		]);

		return {
			getUserEventId: vi.fn(() => 'message123'),
			getParticipants: vi.fn(() => participants),
			getRepingCooldown: vi.fn(),
			getChannelId: vi.fn(() => 'channel123'),
			getMatchId: vi.fn(() => 'match123'),
			deleteRepingMessageIfExists: vi.fn().mockResolvedValue(undefined),
			setRepingMessage: vi.fn(),
			setRepingCooldown: vi.fn(),
		};
	}

	function createMockTelemetry() {
		return {
			trackEventRepinged: vi.fn(),
		};
	}

	beforeEach(() => {
		mockInteraction = createMockInteraction();
		mockEventManager = createMockEventManager();
		mockTelemetry = createMockTelemetry();
	});

	describe('handleRepingCommand', () => {
		it('should send reping message successfully', async () => {
			await handleRepingCommand(
				mockInteraction as never,
				mockEventManager as never,
				mockTelemetry as never,
			);

			expect(mockEventManager.setRepingMessage).toHaveBeenCalledWith(
				'message123',
				'reply456',
			);
			expect(mockEventManager.setRepingCooldown).toHaveBeenCalled();
		});

		it('should reject if user is not in any event', async () => {
			const mockReply = vi.fn().mockResolvedValue(undefined);
			mockInteraction.reply = mockReply;
			mockEventManager.getUserEventId.mockReturnValue(undefined as never);

			await handleRepingCommand(
				mockInteraction as never,
				mockEventManager as never,
				mockTelemetry as never,
			);

			expect(mockReply).toHaveBeenCalledWith({
				content: ERROR_MESSAGES.NOT_IN_EVENT,
				flags: ['Ephemeral'],
			});
		});

		it('should enforce cooldown period', async () => {
			const mockReply = vi.fn().mockResolvedValue(undefined);
			mockInteraction.reply = mockReply;
			const now = Date.now();
			mockEventManager.getRepingCooldown.mockReturnValue(
				now - TIMINGS.REPING_COOLDOWN_MS / 2,
			);

			await handleRepingCommand(
				mockInteraction as never,
				mockEventManager as never,
				mockTelemetry as never,
			);

			expect(mockReply).toHaveBeenCalledWith(
				expect.objectContaining({
					content: expect.stringContaining('wait'),
					flags: ['Ephemeral'],
				}),
			);
		});

		it('should reject if event is full', async () => {
			const mockReply = vi.fn().mockResolvedValue(undefined);
			mockInteraction.reply = mockReply;
			const participants = new Map([
				['user1', { userId: 'user1', role: 'None', rank: null }],
				['user2', { userId: 'user2', role: 'Tank', rank: null }],
				['user3', { userId: 'user3', role: 'DPS', rank: null }],
				['user4', { userId: 'user4', role: 'Healer', rank: null }],
				['user5', { userId: 'user5', role: 'None', rank: null }],
				['user6', { userId: 'user6', role: 'None', rank: null }],
				['user7', { userId: 'user7', role: 'None', rank: null }],
				['user8', { userId: 'user8', role: 'None', rank: null }],
			]);
			mockEventManager.getParticipants.mockReturnValue(participants);

			await handleRepingCommand(
				mockInteraction as never,
				mockEventManager as never,
				mockTelemetry as never,
			);

			expect(mockReply).toHaveBeenCalledWith({
				content: ERROR_MESSAGES.REPING_EVENT_FULL,
				flags: ['Ephemeral'],
			});
		});

		it('should delete existing reping message', async () => {
			await handleRepingCommand(
				mockInteraction as never,
				mockEventManager as never,
				mockTelemetry as never,
			);

			expect(mockEventManager.deleteRepingMessageIfExists).toHaveBeenCalledWith(
				'message123',
				mockInteraction.client,
			);
		});

		it('should track reping with telemetry', async () => {
			await handleRepingCommand(
				mockInteraction as never,
				mockEventManager as never,
				mockTelemetry as never,
			);

			expect(mockTelemetry.trackEventRepinged).toHaveBeenCalledWith(
				expect.objectContaining({
					userId: 'user123',
					matchId: 'match123',
				}),
			);
		});

		it('should reject if channel not found', async () => {
			const mockReply = vi.fn().mockResolvedValue(undefined);
			mockInteraction.reply = mockReply;
			mockEventManager.getChannelId.mockReturnValue(undefined as never);

			await handleRepingCommand(
				mockInteraction as never,
				mockEventManager as never,
				mockTelemetry as never,
			);

			expect(mockReply).toHaveBeenCalledWith({
				content: ERROR_MESSAGES.CHANNEL_NOT_FOUND,
				flags: ['Ephemeral'],
			});
		});

		it('should allow reping after cooldown expires', async () => {
			const pastTime = Date.now() - TIMINGS.REPING_COOLDOWN_MS - 1000;
			mockEventManager.getRepingCooldown.mockReturnValue(pastTime);

			await handleRepingCommand(
				mockInteraction as never,
				mockEventManager as never,
				mockTelemetry as never,
			);

			expect(mockEventManager.setRepingMessage).toHaveBeenCalled();
		});
	});
});
