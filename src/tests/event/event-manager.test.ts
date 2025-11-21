import type { Client, Message } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FIELD_NAMES, STATUS_MESSAGES } from '../../constants.js';
import {
	EventManager,
	type EventTimer,
	type ParticipantMap,
} from '../../event/event-manager.js';

vi.mock('../../utils/retry.js', () => ({
	withRetryOrNull: vi.fn((fn) => fn()),
	LOW_RETRY_OPTIONS: {},
}));

vi.mock('../../utils/error-handler.js', () => ({
	handleError: vi.fn(),
	ErrorSeverity: {
		LOW: 'LOW',
		MEDIUM: 'MEDIUM',
		HIGH: 'HIGH',
	},
}));

describe('EventManager', () => {
	let eventManager: EventManager;

	beforeEach(() => {
		eventManager = new EventManager();
		vi.clearAllMocks();
	});

	describe('participant management', () => {
		it('should store and retrieve participants', () => {
			const participants: ParticipantMap = new Map([
				['user1', { userId: 'user1', role: 'Slayer', rank: null }],
			]);

			eventManager.setParticipants('event1', participants);

			const retrieved = eventManager.getParticipants('event1');
			expect(retrieved).toBe(participants);
		});

		it('should add individual participant', () => {
			const participants: ParticipantMap = new Map();
			eventManager.setParticipants('event1', participants);

			eventManager.addParticipant('event1', 'user1', {
				userId: 'user1',
				role: 'Support',
				rank: null,
			});

			const retrieved = eventManager.getParticipants('event1');
			expect(retrieved?.has('user1')).toBe(true);
		});

		it('should remove participant', () => {
			const participants: ParticipantMap = new Map([
				['user1', { userId: 'user1', role: 'Slayer', rank: null }],
			]);
			eventManager.setParticipants('event1', participants);

			eventManager.removeParticipant('event1', 'user1');

			const retrieved = eventManager.getParticipants('event1');
			expect(retrieved?.has('user1')).toBe(false);
		});

		it('should track user-to-event index', () => {
			const participants: ParticipantMap = new Map([
				['user1', { userId: 'user1', role: 'Slayer', rank: null }],
			]);
			eventManager.setParticipants('event1', participants);

			expect(eventManager.isUserInAnyEvent('user1')).toBe(true);
			expect(eventManager.isUserInAnyEvent('user2')).toBe(false);
		});

		it('should update index when participants change', () => {
			const participants: ParticipantMap = new Map([
				['user1', { userId: 'user1', role: 'Slayer', rank: null }],
			]);
			eventManager.setParticipants('event1', participants);

			const newParticipants: ParticipantMap = new Map([
				['user2', { userId: 'user2', role: 'Support', rank: null }],
			]);
			eventManager.setParticipants('event1', newParticipants);

			expect(eventManager.isUserInAnyEvent('user1')).toBe(false);
			expect(eventManager.isUserInAnyEvent('user2')).toBe(true);
		});
	});

	describe('creator management', () => {
		it('should store and retrieve event creator', () => {
			eventManager.setCreator('event1', 'creator-123');

			expect(eventManager.getCreator('event1')).toBe('creator-123');
		});

		it('should check if user owns event', () => {
			eventManager.setCreator('event1', 'creator-123');
			eventManager.setCreator('event2', 'creator-456');

			expect(eventManager.userOwnsEvent('creator-123')).toBe('event1');
			expect(eventManager.userOwnsEvent('creator-789')).toBeUndefined();
		});

		it('should delete creator', () => {
			eventManager.setCreator('event1', 'creator-123');
			eventManager.deleteCreator('event1');

			expect(eventManager.getCreator('event1')).toBeUndefined();
		});
	});

	describe('timer management', () => {
		it('should store and retrieve timer data', () => {
			const timer: EventTimer = {
				startTime: Date.now(),
				duration: 10000,
				hasStarted: false,
			};

			eventManager.setTimer('event1', timer);

			expect(eventManager.getTimer('event1')).toEqual(timer);
		});

		it('should delete timer', () => {
			const timer: EventTimer = {
				startTime: Date.now(),
				duration: 10000,
				hasStarted: false,
			};
			eventManager.setTimer('event1', timer);
			eventManager.deleteTimer('event1');

			expect(eventManager.getTimer('event1')).toBeUndefined();
		});
	});

	describe('processing states', () => {
		it('should track processing state', () => {
			eventManager.setProcessing('event1', 'starting');

			expect(eventManager.isProcessing('event1', 'starting')).toBe(true);
			expect(eventManager.isProcessing('event1', 'finishing')).toBe(false);
		});

		it('should clear specific processing state', () => {
			eventManager.setProcessing('event1', 'starting');
			eventManager.setProcessing('event1', 'finishing');

			eventManager.clearProcessing('event1', 'starting');

			expect(eventManager.isProcessing('event1', 'starting')).toBe(false);
			expect(eventManager.isProcessing('event1', 'finishing')).toBe(true);
		});

		it('should handle multiple processing states', () => {
			eventManager.setProcessing('event1', 'starting');
			eventManager.setProcessing('event1', 'cancelling');

			expect(eventManager.isProcessing('event1', 'starting')).toBe(true);
			expect(eventManager.isProcessing('event1', 'cancelling')).toBe(true);
		});

		it('should delete all processing states', () => {
			eventManager.setProcessing('event1', 'starting');
			eventManager.setProcessing('event1', 'finishing');

			eventManager.deleteProcessingStates('event1');

			expect(eventManager.isProcessing('event1', 'starting')).toBe(false);
			expect(eventManager.isProcessing('event1', 'finishing')).toBe(false);
		});
	});

	describe('thread management', () => {
		it('should store and retrieve thread ID', () => {
			eventManager.setThread('event1', 'thread-123');

			expect(eventManager.getThread('event1')).toBe('thread-123');
		});

		it('should delete thread', () => {
			eventManager.setThread('event1', 'thread-123');
			eventManager.deleteThread('event1');

			expect(eventManager.getThread('event1')).toBeUndefined();
		});
	});

	describe('voice channel management', () => {
		it('should store and retrieve voice channels', () => {
			const channels = ['voice1', 'voice2', 'voice3'];
			eventManager.setVoiceChannels('event1', channels);

			expect(eventManager.getVoiceChannels('event1')).toEqual(channels);
		});

		it('should delete voice channels', () => {
			eventManager.setVoiceChannels('event1', ['voice1']);
			eventManager.deleteVoiceChannels('event1');

			expect(eventManager.getVoiceChannels('event1')).toBeUndefined();
		});
	});

	describe('match ID management', () => {
		it('should store and retrieve match ID', () => {
			eventManager.setMatchId('event1', 'ABCDE-12345');

			expect(eventManager.getMatchId('event1')).toBe('ABCDE-12345');
		});
	});

	describe('reping management', () => {
		it('should store and retrieve reping cooldown', () => {
			const timestamp = Date.now();
			eventManager.setRepingCooldown('event1', timestamp);

			expect(eventManager.getRepingCooldown('event1')).toBe(timestamp);
		});

		it('should store and retrieve reping message', () => {
			eventManager.setRepingMessage('event1', 'msg-123');

			expect(eventManager.getRepingMessage('event1')).toBe('msg-123');
		});

		it('should delete reping message if exists', async () => {
			const deleteSpy = vi.fn().mockResolvedValue(undefined);
			const fetchMessageSpy = vi.fn().mockResolvedValue({
				delete: deleteSpy,
			});
			const fetchChannelSpy = vi.fn().mockResolvedValue({
				isTextBased: () => true,
				messages: {
					fetch: fetchMessageSpy,
				},
			});

			const client = {
				channels: {
					fetch: fetchChannelSpy,
				},
			} as unknown as Client;

			eventManager.setChannelId('event1', 'channel-123');
			eventManager.setRepingMessage('event1', 'msg-123');

			await eventManager.deleteRepingMessageIfExists('event1', client);

			expect(deleteSpy).toHaveBeenCalled();
		});
	});

	describe('isEventFinalizing', () => {
		it('should return true when status is finalizing', () => {
			const message = {
				embeds: [
					{
						fields: [
							{
								name: FIELD_NAMES.STATUS,
								value: STATUS_MESSAGES.FINALIZING,
							},
						],
					},
				],
			} as unknown as Message;

			expect(eventManager.isEventFinalizing(message)).toBe(true);
		});

		it('should return false when status is not finalizing', () => {
			const message = {
				embeds: [
					{
						fields: [
							{
								name: FIELD_NAMES.STATUS,
								value: STATUS_MESSAGES.OPEN,
							},
						],
					},
				],
			} as unknown as Message;

			expect(eventManager.isEventFinalizing(message)).toBe(false);
		});

		it('should return false when no embeds', () => {
			const message = {
				embeds: [],
			} as unknown as Message;

			expect(eventManager.isEventFinalizing(message)).toBe(false);
		});
	});

	describe('clearAllEventData', () => {
		it('should clear all data associated with event', () => {
			const participants: ParticipantMap = new Map([
				['user1', { userId: 'user1', role: 'Slayer', rank: null }],
			]);
			eventManager.setParticipants('event1', participants);
			eventManager.setCreator('event1', 'creator-123');
			eventManager.setTimer('event1', {
				startTime: Date.now(),
				duration: 10000,
				hasStarted: false,
			});
			eventManager.setThread('event1', 'thread-123');
			eventManager.setMatchId('event1', 'MATCH-123');
			eventManager.setVoiceChannels('event1', ['voice1']);
			eventManager.setChannelId('event1', 'channel-123');
			eventManager.setGuildId('event1', 'guild-123');

			eventManager.clearAllEventData('event1');

			expect(eventManager.getParticipants('event1')).toBeUndefined();
			expect(eventManager.getCreator('event1')).toBeUndefined();
			expect(eventManager.getTimer('event1')).toBeUndefined();
			expect(eventManager.getThread('event1')).toBeUndefined();
			expect(eventManager.getMatchId('event1')).toBeUndefined();
			expect(eventManager.getVoiceChannels('event1')).toBeUndefined();
			expect(eventManager.getChannelId('event1')).toBeUndefined();
			expect(eventManager.getGuildId('event1')).toBeUndefined();
		});

		it('should clear timeout if exists', () => {
			const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
			const timeout = setTimeout(() => {}, 1000);
			eventManager.setTimeout('event1', timeout);

			eventManager.clearAllEventData('event1');

			expect(clearTimeoutSpy).toHaveBeenCalledWith(timeout);
			expect(eventManager.getTimeout('event1')).toBeUndefined();
		});
	});

	describe('timeout management', () => {
		it('should store and retrieve timeout', () => {
			const timeout = setTimeout(() => {}, 1000);
			eventManager.setTimeout('event1', timeout);

			expect(eventManager.getTimeout('event1')).toBe(timeout);

			clearTimeout(timeout);
		});

		it('should delete timeout', () => {
			const timeout = setTimeout(() => {}, 1000);
			eventManager.setTimeout('event1', timeout);
			eventManager.deleteTimeout('event1');

			expect(eventManager.getTimeout('event1')).toBeUndefined();

			clearTimeout(timeout);
		});
	});

	describe('queue management', () => {
		it('should return empty array for non-existent queue', () => {
			const queue = eventManager.getQueue('event1');

			expect(queue).toEqual([]);
		});

		it('should add user to queue', () => {
			eventManager.addToQueue('event1', 'user1');

			const queue = eventManager.getQueue('event1');
			expect(queue).toContain('user1');
			expect(queue).toHaveLength(1);
		});

		it('should add multiple users to queue in order', () => {
			eventManager.addToQueue('event1', 'user1');
			eventManager.addToQueue('event1', 'user2');
			eventManager.addToQueue('event1', 'user3');

			const queue = eventManager.getQueue('event1');
			expect(queue).toEqual(['user1', 'user2', 'user3']);
		});

		it('should not add duplicate user to queue', () => {
			eventManager.addToQueue('event1', 'user1');
			eventManager.addToQueue('event1', 'user1');

			const queue = eventManager.getQueue('event1');
			expect(queue).toEqual(['user1']);
		});

		it('should remove specific user from queue', () => {
			eventManager.addToQueue('event1', 'user1');
			eventManager.addToQueue('event1', 'user2');
			eventManager.addToQueue('event1', 'user3');

			eventManager.removeFromQueue('event1', 'user2');

			const queue = eventManager.getQueue('event1');
			expect(queue).toEqual(['user1', 'user3']);
		});

		it('should check if user is in queue', () => {
			eventManager.addToQueue('event1', 'user1');

			expect(eventManager.isUserInQueue('event1', 'user1')).toBe(true);
			expect(eventManager.isUserInQueue('event1', 'user2')).toBe(false);
		});

		it('should remove and return next user from queue', () => {
			eventManager.addToQueue('event1', 'user1');
			eventManager.addToQueue('event1', 'user2');
			eventManager.addToQueue('event1', 'user3');

			const next = eventManager.removeNextFromQueue('event1');

			expect(next).toBe('user1');
			expect(eventManager.getQueue('event1')).toEqual(['user2', 'user3']);
		});

		it('should return undefined when removing from empty queue', () => {
			const next = eventManager.removeNextFromQueue('event1');

			expect(next).toBeUndefined();
		});

		it('should maintain separate queues for different events', () => {
			eventManager.addToQueue('event1', 'user1');
			eventManager.addToQueue('event1', 'user2');
			eventManager.addToQueue('event2', 'user3');
			eventManager.addToQueue('event2', 'user4');

			expect(eventManager.getQueue('event1')).toEqual(['user1', 'user2']);
			expect(eventManager.getQueue('event2')).toEqual(['user3', 'user4']);
		});

		it('should remove user from all event queues', async () => {
			const client = {
				channels: {
					fetch: vi.fn(),
				},
			} as unknown as Client;

			eventManager.addToQueue('event1', 'user1');
			eventManager.addToQueue('event1', 'user2');
			eventManager.addToQueue('event2', 'user1');
			eventManager.addToQueue('event2', 'user3');

			await eventManager.removeUserFromAllQueues('user1', client);

			expect(eventManager.getQueue('event1')).toEqual(['user2']);
			expect(eventManager.getQueue('event2')).toEqual(['user3']);
		});

		it('should handle removeUserFromAllQueues when user not in any queue', async () => {
			const client = {
				channels: {
					fetch: vi.fn(),
				},
			} as unknown as Client;

			eventManager.addToQueue('event1', 'user1');

			await eventManager.removeUserFromAllQueues('user2', client);

			expect(eventManager.getQueue('event1')).toEqual(['user1']);
		});

		it('should clear queue when event data is cleared', () => {
			eventManager.addToQueue('event1', 'user1');
			eventManager.addToQueue('event1', 'user2');

			eventManager.clearAllEventData('event1');

			const queue = eventManager.getQueue('event1');
			expect(queue).toEqual([]);
		});
	});
});
