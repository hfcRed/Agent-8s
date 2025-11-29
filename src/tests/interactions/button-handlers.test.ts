import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ERROR_MESSAGES, MAX_PARTICIPANTS } from '../../constants.js';
import {
	handleCancelButton,
	handleDropInButton,
	handleDropOutButton,
	handleFinishButton,
	handleSignOutButton,
	handleSignUpButton,
	handleSpectateButton,
	handleStartNowButton,
} from '../../interactions/button-handlers.js';

vi.mock('../../utils/embed-utils.js', () => ({
	updateEmbedField: vi.fn(),
	updateParticipantFields: vi.fn(),
	updateQueueField: vi.fn(),
	createEventStartedButtons: vi.fn(() => ({ components: [] })),
	createRoleSelectMenu: vi.fn(() => ({ components: [] })),
}));

vi.mock('../../utils/helpers.js', () => ({
	getExcaliburRankOfUser: vi.fn(() => null),
	isUserAdmin: vi.fn(() => false),
	safeReplyToInteraction: vi.fn(),
	checkProcessingStates: vi.fn(() => Promise.resolve(false)),
}));

vi.mock('../../utils/error-handler.js', () => ({
	handleError: vi.fn(),
	ErrorSeverity: { LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH' },
}));

vi.mock('../../event/event-lifecycle.js', () => ({
	startEvent: vi.fn().mockResolvedValue(undefined),
	cleanupEvent: vi.fn().mockResolvedValue(undefined),
	createEventStartTimeout: vi.fn(),
	promoteNextFromQueue: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../utils/retry.js', () => ({
	withRetry: vi.fn((fn) => fn()),
	MEDIUM_RETRY_OPTIONS: {},
}));

describe('button-handlers', () => {
	let mockInteraction: ReturnType<typeof createMockInteraction>;
	let mockEventManager: ReturnType<typeof createMockEventManager>;
	let mockThreadManager: ReturnType<typeof createMockThreadManager>;
	let mockVoiceChannelManager: ReturnType<typeof createMockVoiceChannelManager>;
	let mockTelemetry: ReturnType<typeof createMockTelemetry>;

	function createMockInteraction() {
		return {
			user: { id: 'user123' },
			guild: { id: 'guild123' },
			guildId: 'guild123',
			channelId: 'channel123',
			channel: null,
			member: { roles: { cache: new Map() } },
			message: {
				id: 'message123',
				embeds: [{ data: {} }],
				client: {},
			},
			deferUpdate: vi.fn().mockResolvedValue(undefined),
			editReply: vi.fn().mockResolvedValue(undefined),
			followUp: vi.fn().mockResolvedValue(undefined),
			client: {},
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
			getCreator: vi.fn(() => 'user123'),
			getMatchId: vi.fn(() => 'match123'),
			getThread: vi.fn(),
			getVoiceChannels: vi.fn(),
			isUserInAnyEvent: vi.fn(() => false),
			addParticipant: vi.fn(),
			removeParticipant: vi.fn(),
			setProcessing: vi.fn(),
			clearProcessing: vi.fn(),
			isProcessing: vi.fn(() => false),
			deleteRepingMessageIfExists: vi.fn().mockResolvedValue(undefined),
			getTimeout: vi.fn(() => undefined),
			deleteTimeout: vi.fn(),
			removeUserFromAllQueues: vi.fn().mockResolvedValue(undefined),
			getQueue: vi.fn(() => []),
			setTerminalState: vi.fn(),
			queueUpdate: vi.fn(),
			transferOwnership: vi.fn(),
			isUserSpectating: vi.fn(() => false),
			isSpectatorsFull: vi.fn(() => false),
			addSpectator: vi.fn(),
			removeSpectator: vi.fn(),
		};
	}

	function createMockThreadManager() {
		return {
			fetchThread: vi.fn().mockResolvedValue(null),
			addMember: vi.fn().mockResolvedValue(undefined),
			removeMember: vi.fn().mockResolvedValue(undefined),
		};
	}

	function createMockVoiceChannelManager() {
		return {
			grantAccessToChannels: vi.fn().mockResolvedValue(undefined),
			revokeAccessFromChannels: vi.fn().mockResolvedValue(undefined),
		};
	}

	function createMockTelemetry() {
		return {
			trackUserSignUp: vi.fn(),
			trackUserSignOut: vi.fn(),
			trackEventCancelled: vi.fn(),
			trackEventFinished: vi.fn(),
			trackUserDropOut: vi.fn(),
			trackUserDropIn: vi.fn(),
			trackUserStartedSpectating: vi.fn(),
			trackUserStoppedSpectating: vi.fn(),
		};
	}

	beforeEach(() => {
		vi.clearAllMocks();
		mockInteraction = createMockInteraction();
		mockEventManager = createMockEventManager();
		mockThreadManager = createMockThreadManager();
		mockVoiceChannelManager = createMockVoiceChannelManager();
		mockTelemetry = createMockTelemetry();
	});

	describe('handleSignUpButton', () => {
		it('should defer update and add user to event', async () => {
			const participants = new Map();
			mockEventManager.getParticipants.mockReturnValue(participants);

			await handleSignUpButton(
				mockInteraction as never,
				mockEventManager as never,
				mockThreadManager as never,
				mockVoiceChannelManager as never,
				mockTelemetry as never,
			);

			expect(mockInteraction.deferUpdate).toHaveBeenCalled();
			expect(mockEventManager.addParticipant).toHaveBeenCalledWith(
				'message123',
				'user123',
				expect.objectContaining({ userId: 'user123' }),
			);
		});

		it('should reject when event is full', async () => {
			const participants = new Map();
			for (let i = 0; i < MAX_PARTICIPANTS; i++) {
				participants.set(`user${i}`, {
					userId: `user${i}`,
					role: 'None',
					rank: null,
				});
			}
			mockEventManager.getParticipants.mockReturnValue(participants);

			await handleSignUpButton(
				mockInteraction as never,
				mockEventManager as never,
				mockThreadManager as never,
				mockVoiceChannelManager as never,
				mockTelemetry as never,
			);

			expect(mockInteraction.followUp).toHaveBeenCalledWith({
				content: ERROR_MESSAGES.EVENT_FULL,
				flags: ['Ephemeral'],
			});
		});

		it('should reject if user is already in another event', async () => {
			mockEventManager.isUserInAnyEvent.mockReturnValue(true);

			await handleSignUpButton(
				mockInteraction as never,
				mockEventManager as never,
				mockThreadManager as never,
				mockVoiceChannelManager as never,
				mockTelemetry as never,
			);

			expect(mockInteraction.followUp).toHaveBeenCalledWith({
				content: ERROR_MESSAGES.ALREADY_SIGNED_UP,
				flags: ['Ephemeral'],
			});
		});

		it('should track sign up with telemetry', async () => {
			const participants = new Map();
			mockEventManager.getParticipants.mockReturnValue(participants);

			await handleSignUpButton(
				mockInteraction as never,
				mockEventManager as never,
				mockThreadManager as never,
				mockVoiceChannelManager as never,
				mockTelemetry as never,
			);

			expect(mockTelemetry.trackUserSignUp).toHaveBeenCalledWith(
				expect.objectContaining({
					userId: 'user123',
					matchId: 'match123',
				}),
			);
		});
	});

	describe('handleSignOutButton', () => {
		it('should remove user from event', async () => {
			mockEventManager.getCreator.mockReturnValue('creator456');

			await handleSignOutButton(
				mockInteraction as never,
				mockEventManager as never,
				mockThreadManager as never,
				mockVoiceChannelManager as never,
				mockTelemetry as never,
			);

			expect(mockEventManager.removeParticipant).toHaveBeenCalledWith(
				'message123',
				'user123',
			);
		});

		it('should reject if user is creator', async () => {
			mockEventManager.getCreator.mockReturnValue('user123');

			await handleSignOutButton(
				mockInteraction as never,
				mockEventManager as never,
				mockThreadManager as never,
				mockVoiceChannelManager as never,
				mockTelemetry as never,
			);

			expect(mockInteraction.followUp).toHaveBeenCalledWith({
				content: ERROR_MESSAGES.CREATOR_CANNOT_SIGNOUT,
				flags: ['Ephemeral'],
			});
		});

		it('should track sign out with telemetry', async () => {
			mockEventManager.getCreator.mockReturnValue('creator456');

			await handleSignOutButton(
				mockInteraction as never,
				mockEventManager as never,
				mockThreadManager as never,
				mockVoiceChannelManager as never,
				mockTelemetry as never,
			);

			expect(mockTelemetry.trackUserSignOut).toHaveBeenCalled();
		});
	});

	describe('handleCancelButton', () => {
		it('should cancel event and cleanup resources', async () => {
			const { cleanupEvent } = await import('../../event/event-lifecycle.js');

			await handleCancelButton(
				mockInteraction as never,
				mockEventManager as never,
				mockInteraction.message.client as never,
				mockThreadManager as never,
				mockVoiceChannelManager as never,
				mockTelemetry as never,
			);

			expect(mockEventManager.setProcessing).toHaveBeenCalledWith(
				'message123',
				'cancelling',
			);
			expect(mockEventManager.setTerminalState).toHaveBeenCalledWith(
				'message123',
				'cancelled',
			);
			expect(mockEventManager.queueUpdate).toHaveBeenCalledWith(
				'message123',
				true,
			);
			expect(cleanupEvent).toHaveBeenCalled();
			expect(mockEventManager.clearProcessing).toHaveBeenCalledWith(
				'message123',
				'cancelling',
			);
		});

		it('should reject if not creator or admin', async () => {
			mockEventManager.getCreator.mockReturnValue('creator456');
			const { isUserAdmin } = await import('../../utils/helpers.js');
			(isUserAdmin as ReturnType<typeof vi.fn>).mockReturnValue(false);

			await handleCancelButton(
				mockInteraction as never,
				mockEventManager as never,
				mockInteraction.message.client as never,
				mockThreadManager as never,
				mockVoiceChannelManager as never,
				mockTelemetry as never,
			);

			expect(mockInteraction.followUp).toHaveBeenCalledWith({
				content: ERROR_MESSAGES.CREATOR_ONLY_CANCEL,
				flags: ['Ephemeral'],
			});
		});

		it('should track cancellation with telemetry', async () => {
			await handleCancelButton(
				mockInteraction as never,
				mockEventManager as never,
				mockInteraction.message.client as never,
				mockThreadManager as never,
				mockVoiceChannelManager as never,
				mockTelemetry as never,
			);

			expect(mockTelemetry.trackEventCancelled).toHaveBeenCalled();
		});
	});

	describe('handleStartNowButton', () => {
		it('should start event when full and creator clicks', async () => {
			const participants = new Map();
			for (let i = 0; i < MAX_PARTICIPANTS; i++) {
				participants.set(`user${i}`, {
					userId: `user${i}`,
					role: 'None',
					rank: null,
				});
			}
			mockEventManager.getParticipants.mockReturnValue(participants);
			const { startEvent } = await import('../../event/event-lifecycle.js');

			await handleStartNowButton(
				mockInteraction as never,
				mockEventManager as never,
				mockInteraction.message.client as never,
				mockThreadManager as never,
				mockVoiceChannelManager as never,
				mockTelemetry as never,
			);

			expect(startEvent).toHaveBeenCalled();
		});

		it('should reject if not creator', async () => {
			mockEventManager.getCreator.mockReturnValue('creator456');

			await handleStartNowButton(
				mockInteraction as never,
				mockEventManager as never,
				mockInteraction.message.client as never,
				mockThreadManager as never,
				mockVoiceChannelManager as never,
				mockTelemetry as never,
			);

			expect(mockInteraction.followUp).toHaveBeenCalledWith({
				content: ERROR_MESSAGES.CREATOR_ONLY_START,
				flags: ['Ephemeral'],
			});
		});

		it('should reject if not enough participants', async () => {
			const participants = new Map([
				['user1', { userId: 'user1', role: 'None', rank: null }],
			]);
			mockEventManager.getParticipants.mockReturnValue(participants);

			await handleStartNowButton(
				mockInteraction as never,
				mockEventManager as never,
				mockInteraction.message.client as never,
				mockThreadManager as never,
				mockVoiceChannelManager as never,
				mockTelemetry as never,
			);

			expect(mockInteraction.followUp).toHaveBeenCalledWith({
				content: ERROR_MESSAGES.NOT_ENOUGH_PARTICIPANTS,
				flags: ['Ephemeral'],
			});
		});
	});

	describe('handleFinishButton', () => {
		it('should finish event and cleanup', async () => {
			const { cleanupEvent } = await import('../../event/event-lifecycle.js');

			await handleFinishButton(
				mockInteraction as never,
				mockEventManager as never,
				mockInteraction.message.client as never,
				mockThreadManager as never,
				mockVoiceChannelManager as never,
				mockTelemetry as never,
			);

			expect(mockEventManager.setTerminalState).toHaveBeenCalledWith(
				'message123',
				'finished',
			);
			expect(mockEventManager.queueUpdate).toHaveBeenCalledWith(
				'message123',
				true,
			);
			expect(cleanupEvent).toHaveBeenCalled();
			expect(mockTelemetry.trackEventFinished).toHaveBeenCalled();
		});

		it('should allow admin to finish', async () => {
			mockEventManager.getCreator.mockReturnValue('creator456');
			const { isUserAdmin } = await import('../../utils/helpers.js');
			(isUserAdmin as ReturnType<typeof vi.fn>).mockReturnValue(true);
			const { cleanupEvent } = await import('../../event/event-lifecycle.js');

			await handleFinishButton(
				mockInteraction as never,
				mockEventManager as never,
				mockInteraction.message.client as never,
				mockThreadManager as never,
				mockVoiceChannelManager as never,
				mockTelemetry as never,
			);

			expect(cleanupEvent).toHaveBeenCalled();
		});
	});

	describe('handleDropOutButton', () => {
		it('should remove user from started event', async () => {
			mockEventManager.getCreator.mockReturnValue('creator456');

			await handleDropOutButton(
				mockInteraction as never,
				mockEventManager as never,
				mockInteraction.message.client as never,
				mockThreadManager as never,
				mockVoiceChannelManager as never,
				mockTelemetry as never,
			);

			expect(mockEventManager.removeParticipant).toHaveBeenCalled();
		});

		it('should revoke thread and voice access', async () => {
			mockEventManager.getCreator.mockReturnValue('creator456');
			mockEventManager.getThread.mockReturnValue('thread123' as never);
			mockEventManager.getVoiceChannels.mockReturnValue(['voice123'] as never);
			mockInteraction.channel = { isTextBased: () => true } as never;

			await handleDropOutButton(
				mockInteraction as never,
				mockEventManager as never,
				mockInteraction.message.client as never,
				mockThreadManager as never,
				mockVoiceChannelManager as never,
				mockTelemetry as never,
			);

			expect(
				mockVoiceChannelManager.revokeAccessFromChannels,
			).toHaveBeenCalled();
		});

		it('should allow owner to drop out when other participants exist', async () => {
			const participants = new Map([
				['user123', { userId: 'user123', role: 'None', rank: null }],
				['user456', { userId: 'user456', role: 'None', rank: null }],
			]);
			mockEventManager.getParticipants.mockReturnValue(participants);
			mockEventManager.getCreator.mockReturnValue('user123');
			mockEventManager.transferOwnership = vi.fn().mockResolvedValue('user456');

			await handleDropOutButton(
				mockInteraction as never,
				mockEventManager as never,
				mockInteraction.message.client as never,
				mockThreadManager as never,
				mockVoiceChannelManager as never,
				mockTelemetry as never,
			);

			expect(mockEventManager.transferOwnership).toHaveBeenCalled();
			expect(mockEventManager.removeParticipant).toHaveBeenCalledWith(
				'message123',
				'user123',
			);
		});

		it('should reject owner drop out when they are the only participant', async () => {
			const participants = new Map([
				['user123', { userId: 'user123', role: 'None', rank: null }],
			]);
			mockEventManager.getParticipants.mockReturnValue(participants);
			mockEventManager.getCreator.mockReturnValue('user123');

			await handleDropOutButton(
				mockInteraction as never,
				mockEventManager as never,
				mockInteraction.message.client as never,
				mockThreadManager as never,
				mockVoiceChannelManager as never,
				mockTelemetry as never,
			);

			expect(mockInteraction.followUp).toHaveBeenCalledWith({
				content: ERROR_MESSAGES.OWNER_ONLY_PARTICIPANT,
				flags: ['Ephemeral'],
			});
			expect(mockEventManager.removeParticipant).not.toHaveBeenCalled();
		});

		it('should reject if user is not signed up', async () => {
			const participants = new Map([
				['creator456', { userId: 'creator456', role: 'None', rank: null }],
			]);
			mockEventManager.getParticipants.mockReturnValue(participants);
			mockEventManager.getCreator.mockReturnValue('creator456');

			await handleDropOutButton(
				mockInteraction as never,
				mockEventManager as never,
				mockInteraction.message.client as never,
				mockThreadManager as never,
				mockVoiceChannelManager as never,
				mockTelemetry as never,
			);

			expect(mockInteraction.followUp).toHaveBeenCalledWith({
				content: ERROR_MESSAGES.NOT_SIGNED_UP,
				flags: ['Ephemeral'],
			});
		});
	});

	describe('handleDropInButton', () => {
		it('should add user to started event', async () => {
			const participants = new Map();
			mockEventManager.getParticipants.mockReturnValue(participants);

			await handleDropInButton(
				mockInteraction as never,
				mockEventManager as never,
				mockInteraction.message.client as never,
				mockThreadManager as never,
				mockVoiceChannelManager as never,
				mockTelemetry as never,
			);

			expect(mockEventManager.addParticipant).toHaveBeenCalled();
		});

		it('should grant thread and voice access', async () => {
			const participants = new Map();
			mockEventManager.getParticipants.mockReturnValue(participants);
			mockEventManager.getThread.mockReturnValue('thread123' as never);
			mockEventManager.getVoiceChannels.mockReturnValue(['voice123'] as never);
			mockInteraction.channel = { isTextBased: () => true } as never;

			await handleDropInButton(
				mockInteraction as never,
				mockEventManager as never,
				mockInteraction.message.client as never,
				mockThreadManager as never,
				mockVoiceChannelManager as never,
				mockTelemetry as never,
			);

			expect(mockVoiceChannelManager.grantAccessToChannels).toHaveBeenCalled();
		});

		it('should reject if already in event', async () => {
			const participants = new Map([
				['user123', { userId: 'user123', role: 'None', rank: null }],
			]);
			mockEventManager.getParticipants.mockReturnValue(participants);

			await handleDropInButton(
				mockInteraction as never,
				mockEventManager as never,
				mockInteraction.message.client as never,
				mockThreadManager as never,
				mockVoiceChannelManager as never,
				mockTelemetry as never,
			);

			expect(mockInteraction.followUp).toHaveBeenCalledWith({
				content: ERROR_MESSAGES.ALREADY_SIGNED_UP,
				flags: ['Ephemeral'],
			});
		});

		it('should reject if event is full', async () => {
			const participants = new Map();
			for (let i = 0; i < MAX_PARTICIPANTS; i++) {
				participants.set(`user${i}`, {
					userId: `user${i}`,
					role: 'None',
					rank: null,
				});
			}
			mockEventManager.getParticipants.mockReturnValue(participants);

			await handleDropInButton(
				mockInteraction as never,
				mockEventManager as never,
				mockInteraction.message.client as never,
				mockThreadManager as never,
				mockVoiceChannelManager as never,
				mockTelemetry as never,
			);

			expect(mockInteraction.followUp).toHaveBeenCalledWith({
				content: ERROR_MESSAGES.EVENT_FULL,
				flags: ['Ephemeral'],
			});
		});
	});

	describe('handleSpectateButton', () => {
		it('should add user as spectator when not a participant', async () => {
			const participants = new Map([
				['creator456', { userId: 'creator456', role: 'None', rank: null }],
			]);
			mockEventManager.getParticipants.mockReturnValue(participants);
			mockEventManager.getCreator.mockReturnValue('creator456');

			await handleSpectateButton(
				mockInteraction as never,
				mockEventManager as never,
				mockInteraction.message.client as never,
				mockThreadManager as never,
				mockVoiceChannelManager as never,
				mockTelemetry as never,
			);

			expect(mockEventManager.addSpectator).toHaveBeenCalledWith(
				'message123',
				'user123',
			);
			expect(mockTelemetry.trackUserStartedSpectating).toHaveBeenCalled();
		});

		it('should reject if already spectating', async () => {
			const participants = new Map();
			mockEventManager.getParticipants.mockReturnValue(participants);
			mockEventManager.getCreator.mockReturnValue('creator456');
			mockEventManager.isUserSpectating.mockReturnValue(true as never);

			await handleSpectateButton(
				mockInteraction as never,
				mockEventManager as never,
				mockInteraction.message.client as never,
				mockThreadManager as never,
				mockVoiceChannelManager as never,
				mockTelemetry as never,
			);

			expect(mockInteraction.followUp).toHaveBeenCalledWith({
				content: ERROR_MESSAGES.SPECTATE_ALREADY_SPECTATING,
				flags: ['Ephemeral'],
			});
		});

		it('should reject if spectators are full', async () => {
			const participants = new Map();
			mockEventManager.getParticipants.mockReturnValue(participants);
			mockEventManager.getCreator.mockReturnValue('creator456');
			mockEventManager.isSpectatorsFull.mockReturnValue(true as never);

			await handleSpectateButton(
				mockInteraction as never,
				mockEventManager as never,
				mockInteraction.message.client as never,
				mockThreadManager as never,
				mockVoiceChannelManager as never,
				mockTelemetry as never,
			);

			expect(mockInteraction.followUp).toHaveBeenCalledWith({
				content: ERROR_MESSAGES.SPECTATE_FULL,
				flags: ['Ephemeral'],
			});
		});

		it('should allow non-owner participant to switch to spectator', async () => {
			const participants = new Map([
				['user123', { userId: 'user123', role: 'None', rank: null }],
				['creator456', { userId: 'creator456', role: 'None', rank: null }],
			]);
			mockEventManager.getParticipants.mockReturnValue(participants);
			mockEventManager.getCreator.mockReturnValue('creator456');

			await handleSpectateButton(
				mockInteraction as never,
				mockEventManager as never,
				mockInteraction.message.client as never,
				mockThreadManager as never,
				mockVoiceChannelManager as never,
				mockTelemetry as never,
			);

			expect(mockEventManager.addSpectator).toHaveBeenCalledWith(
				'message123',
				'user123',
			);
			expect(mockEventManager.removeParticipant).toHaveBeenCalledWith(
				'message123',
				'user123',
			);
			expect(mockTelemetry.trackUserDropOut).toHaveBeenCalled();
			expect(mockTelemetry.trackUserStartedSpectating).toHaveBeenCalled();
		});

		it('should allow owner to switch to spectator when other participants exist', async () => {
			const participants = new Map([
				['user123', { userId: 'user123', role: 'None', rank: null }],
				['user456', { userId: 'user456', role: 'None', rank: null }],
			]);
			mockEventManager.getParticipants.mockReturnValue(participants);
			mockEventManager.getCreator.mockReturnValue('user123');
			mockEventManager.transferOwnership = vi.fn().mockResolvedValue('user456');

			await handleSpectateButton(
				mockInteraction as never,
				mockEventManager as never,
				mockInteraction.message.client as never,
				mockThreadManager as never,
				mockVoiceChannelManager as never,
				mockTelemetry as never,
			);

			expect(mockEventManager.transferOwnership).toHaveBeenCalledWith(
				'message123',
				'user123',
				mockThreadManager,
				mockTelemetry,
			);
			expect(mockEventManager.addSpectator).toHaveBeenCalledWith(
				'message123',
				'user123',
			);
			expect(mockEventManager.removeParticipant).toHaveBeenCalledWith(
				'message123',
				'user123',
			);
		});

		it('should reject owner spectate when they are the only participant', async () => {
			const participants = new Map([
				['user123', { userId: 'user123', role: 'None', rank: null }],
			]);
			mockEventManager.getParticipants.mockReturnValue(participants);
			mockEventManager.getCreator.mockReturnValue('user123');

			await handleSpectateButton(
				mockInteraction as never,
				mockEventManager as never,
				mockInteraction.message.client as never,
				mockThreadManager as never,
				mockVoiceChannelManager as never,
				mockTelemetry as never,
			);

			expect(mockInteraction.followUp).toHaveBeenCalledWith({
				content: ERROR_MESSAGES.OWNER_ONLY_PARTICIPANT,
				flags: ['Ephemeral'],
			});
			expect(mockEventManager.removeSpectator).toHaveBeenCalledWith(
				'message123',
				'user123',
			);
			expect(mockEventManager.removeParticipant).not.toHaveBeenCalled();
		});

		it('should revert spectator addition if ownership transfer fails', async () => {
			const participants = new Map([
				['user123', { userId: 'user123', role: 'None', rank: null }],
				['user456', { userId: 'user456', role: 'None', rank: null }],
			]);
			mockEventManager.getParticipants.mockReturnValue(participants);
			mockEventManager.getCreator.mockReturnValue('user123');
			mockEventManager.transferOwnership = vi.fn().mockResolvedValue(null);

			await handleSpectateButton(
				mockInteraction as never,
				mockEventManager as never,
				mockInteraction.message.client as never,
				mockThreadManager as never,
				mockVoiceChannelManager as never,
				mockTelemetry as never,
			);

			expect(mockInteraction.followUp).toHaveBeenCalledWith({
				content: ERROR_MESSAGES.SPECTATE_ERROR,
				flags: ['Ephemeral'],
			});
			expect(mockEventManager.removeSpectator).toHaveBeenCalledWith(
				'message123',
				'user123',
			);
			expect(mockEventManager.removeParticipant).not.toHaveBeenCalled();
		});

		it('should grant thread and voice access for new spectators', async () => {
			const participants = new Map([
				['creator456', { userId: 'creator456', role: 'None', rank: null }],
			]);
			mockEventManager.getParticipants.mockReturnValue(participants);
			mockEventManager.getCreator.mockReturnValue('creator456');
			mockEventManager.getThread.mockReturnValue('thread123' as never);
			mockEventManager.getVoiceChannels.mockReturnValue(['voice123'] as never);
			mockInteraction.channel = { isTextBased: () => true } as never;

			await handleSpectateButton(
				mockInteraction as never,
				mockEventManager as never,
				mockInteraction.message.client as never,
				mockThreadManager as never,
				mockVoiceChannelManager as never,
				mockTelemetry as never,
			);

			expect(mockVoiceChannelManager.grantAccessToChannels).toHaveBeenCalled();
		});
	});
});
