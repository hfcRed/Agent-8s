import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ERROR_MESSAGES } from '../../constants.js';
import { handleRoleSelection } from '../../interactions/menu-handlers.js';

vi.mock('../../utils/error-handler.js', () => ({
	handleError: vi.fn(),
	ErrorSeverity: { LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH' },
}));

vi.mock('../../utils/helpers.js', () => ({
	safeReplyToInteraction: vi.fn(),
	getExcaliburRankOfUser: vi.fn(() => null),
}));

vi.mock('../../utils/embed-utils.js', () => ({
	updateParticipantFields: vi.fn(),
}));

describe('menu-handlers', () => {
	let mockInteraction: ReturnType<typeof createMockInteraction>;
	let mockEventManager: ReturnType<typeof createMockEventManager>;

	function createMockInteraction() {
		return {
			user: { id: 'user123' },
			message: {
				id: 'message123',
				embeds: [{ data: { fields: [] } }],
			},
			values: ['Tank'],
			component: {
				options: [
					{ value: 'Tank', label: 'Tank' },
					{ value: 'DPS', label: 'DPS' },
					{ value: 'Healer', label: 'Healer' },
				],
			},
			deferUpdate: vi.fn().mockResolvedValue(undefined),
			editReply: vi.fn().mockResolvedValue(undefined),
			followUp: vi.fn().mockResolvedValue(undefined),
		};
	}

	function createMockEventManager() {
		const participants = new Map([
			['user123', { userId: 'user123', role: 'None', rank: null }],
		]);

		return {
			getParticipants: vi.fn(() => participants),
			getTimer: vi.fn(() => ({
				startTime: Date.now(),
				duration: undefined,
				hasStarted: false,
			})),
			addParticipant: vi.fn(),
			queueUpdate: vi.fn(),
		};
	}

	beforeEach(() => {
		mockInteraction = createMockInteraction();
		mockEventManager = createMockEventManager();
	});

	describe('handleRoleSelection', () => {
		it('should update user role and embed', async () => {
			await handleRoleSelection(
				mockInteraction as never,
				mockEventManager as never,
			);

			expect(mockEventManager.addParticipant).toHaveBeenCalledWith(
				'message123',
				'user123',
				expect.objectContaining({
					userId: 'user123',
					role: 'Tank',
				}),
			);
			expect(mockEventManager.queueUpdate).toHaveBeenCalledWith('message123');
		});

		it('should reject if user not signed up', async () => {
			const emptyParticipants = new Map();
			mockEventManager.getParticipants.mockReturnValue(emptyParticipants);

			await handleRoleSelection(
				mockInteraction as never,
				mockEventManager as never,
			);

			expect(mockInteraction.followUp).toHaveBeenCalledWith({
				content: ERROR_MESSAGES.NOT_SIGNED_UP,
				flags: ['Ephemeral'],
			});
		});

		it('should handle different role selections', async () => {
			mockInteraction.values = ['Healer'];

			await handleRoleSelection(
				mockInteraction as never,
				mockEventManager as never,
			);

			expect(mockEventManager.addParticipant).toHaveBeenCalledWith(
				'message123',
				'user123',
				expect.objectContaining({
					role: 'Healer',
				}),
			);
		});

		it('should use label from selected option', async () => {
			mockInteraction.values = ['DPS'];

			await handleRoleSelection(
				mockInteraction as never,
				mockEventManager as never,
			);

			expect(mockEventManager.addParticipant).toHaveBeenCalledWith(
				'message123',
				'user123',
				expect.objectContaining({
					role: 'DPS',
				}),
			);
		});

		it('should defer update before processing', async () => {
			await handleRoleSelection(
				mockInteraction as never,
				mockEventManager as never,
			);

			expect(mockInteraction.deferUpdate).toHaveBeenCalled();
		});

		it('should handle missing participant map', async () => {
			mockEventManager.getParticipants.mockReturnValue(undefined as never);

			await handleRoleSelection(
				mockInteraction as never,
				mockEventManager as never,
			);

			expect(mockEventManager.addParticipant).not.toHaveBeenCalled();
		});

		it('should handle missing timer data', async () => {
			mockEventManager.getTimer.mockReturnValue(undefined as never);

			await handleRoleSelection(
				mockInteraction as never,
				mockEventManager as never,
			);

			expect(mockInteraction.editReply).not.toHaveBeenCalled();
		});
	});
});
