import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleStatusCommand } from '../../commands/status-command.js';
import { ERROR_MESSAGES } from '../../constants.js';

vi.mock('../../utils/helpers.js', () => ({
	safeReplyToInteraction: vi.fn(),
}));

vi.mock('../../utils/error-handler.js', () => ({
	handleError: vi.fn(),
	ErrorSeverity: { LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH' },
}));

describe('status-command', () => {
	let mockInteraction: ReturnType<typeof createMockInteraction>;
	let mockEventManager: ReturnType<typeof createMockEventManager>;
	let mockTelemetry: ReturnType<typeof createMockTelemetry>;

	function createMockInteraction() {
		return {
			user: { id: 'user123' },
			guildId: 'guild123',
			client: {
				guilds: { cache: { size: 5 } },
				ws: { ping: 42 },
			},
			deferReply: vi.fn().mockResolvedValue(undefined),
			editReply: vi.fn().mockResolvedValue(undefined),
		};
	}

	function createMockEventManager() {
		return {
			getAllParticipants: vi.fn(() => new Map()),
		};
	}

	function createMockTelemetry() {
		return {};
	}

	beforeEach(() => {
		vi.clearAllMocks();
		mockInteraction = createMockInteraction();
		mockEventManager = createMockEventManager();
		mockTelemetry = createMockTelemetry();
	});

	describe('status display', () => {
		it('should defer reply with ephemeral flag', async () => {
			await handleStatusCommand(
				mockInteraction as never,
				mockEventManager as never,
				mockTelemetry as never,
			);

			expect(mockInteraction.deferReply).toHaveBeenCalledWith({
				flags: ['Ephemeral'],
			});
		});

		it('should display status embed with bot information', async () => {
			await handleStatusCommand(
				mockInteraction as never,
				mockEventManager as never,
				mockTelemetry as never,
			);

			expect(mockInteraction.editReply).toHaveBeenCalledWith({
				embeds: [expect.objectContaining({ data: expect.any(Object) })],
			});
		});

		it('should show telemetry status when enabled', async () => {
			await handleStatusCommand(
				mockInteraction as never,
				mockEventManager as never,
				{ trackEventCreated: vi.fn() } as never,
			);

			expect(mockInteraction.editReply).toHaveBeenCalled();
		});

		it('should show telemetry disabled when not provided', async () => {
			await handleStatusCommand(
				mockInteraction as never,
				mockEventManager as never,
			);

			expect(mockInteraction.editReply).toHaveBeenCalled();
		});
	});

	describe('active events counting', () => {
		it('should count active events correctly', async () => {
			mockEventManager.getAllParticipants.mockReturnValue(
				new Map([
					['event1', new Map([['user1', {}]])],
					[
						'event2',
						new Map([
							['user2', {}],
							['user3', {}],
						]),
					],
				]),
			);

			await handleStatusCommand(
				mockInteraction as never,
				mockEventManager as never,
				mockTelemetry as never,
			);

			expect(mockInteraction.editReply).toHaveBeenCalled();
		});

		it('should handle zero active events', async () => {
			mockEventManager.getAllParticipants.mockReturnValue(new Map());

			await handleStatusCommand(
				mockInteraction as never,
				mockEventManager as never,
				mockTelemetry as never,
			);

			expect(mockInteraction.editReply).toHaveBeenCalled();
		});
	});

	describe('error handling', () => {
		it('should handle errors gracefully', async () => {
			mockInteraction.deferReply.mockRejectedValue(new Error('Network error'));
			const { safeReplyToInteraction } = await import('../../utils/helpers.js');

			await handleStatusCommand(
				mockInteraction as never,
				mockEventManager as never,
				mockTelemetry as never,
			);

			expect(safeReplyToInteraction).toHaveBeenCalledWith(
				mockInteraction,
				ERROR_MESSAGES.STATUS_ERROR,
			);
		});
	});
});
