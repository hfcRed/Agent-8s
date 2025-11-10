import { faker } from '@faker-js/faker';
import { beforeEach, describe, expect, it } from 'vitest';
import { EventManager } from '../event/event-manager.js';
import type { ParticipantMap } from '../types.js';

describe('EventManager', () => {
	let eventManager: EventManager;
	let eventId: string;
	let userId: string;

	beforeEach(() => {
		eventManager = new EventManager();
		eventId = faker.string.uuid();
		userId = faker.string.uuid();
	});

	describe('participants', () => {
		it('should get participants for an event', () => {
			const participants: ParticipantMap = new Map([
				[userId, { userId, role: 'Tank', rank: null }],
			]);
			eventManager.setParticipants(eventId, participants);

			const result = eventManager.getParticipants(eventId);
			expect(result).toBe(participants);
		});

		it('should return undefined for non-existent event', () => {
			const result = eventManager.getParticipants(faker.string.uuid());
			expect(result).toBeUndefined();
		});

		it('should set participants for an event', () => {
			const participants: ParticipantMap = new Map([
				[userId, { userId, role: 'Tank', rank: null }],
			]);
			eventManager.setParticipants(eventId, participants);

			const result = eventManager.getParticipants(eventId);
			expect(result?.size).toBe(1);
			expect(result?.get(userId)).toEqual({ userId, role: 'Tank', rank: null });
		});

		it('should delete participants for an event', () => {
			const participants: ParticipantMap = new Map([
				[userId, { userId, role: 'Tank', rank: null }],
			]);
			eventManager.setParticipants(eventId, participants);
			eventManager.deleteParticipants(eventId);

			const result = eventManager.getParticipants(eventId);
			expect(result).toBeUndefined();
		});

		it('should add a participant to an event', () => {
			const participants: ParticipantMap = new Map();
			eventManager.setParticipants(eventId, participants);

			eventManager.addParticipant(eventId, userId, {
				userId,
				role: 'Healer',
				rank: '5',
			});

			const result = eventManager.getParticipants(eventId);
			expect(result?.size).toBe(1);
			expect(result?.get(userId)).toEqual({
				userId,
				role: 'Healer',
				rank: '5',
			});
		});

		it('should remove a participant from an event', () => {
			const participants: ParticipantMap = new Map([
				[userId, { userId, role: 'Tank', rank: null }],
			]);
			eventManager.setParticipants(eventId, participants);

			eventManager.removeParticipant(eventId, userId);

			const result = eventManager.getParticipants(eventId);
			expect(result?.size).toBe(0);
		});

		it('should get all participants', () => {
			const eventId2 = faker.string.uuid();
			const participants1: ParticipantMap = new Map([
				[userId, { userId, role: 'Tank', rank: null }],
			]);
			const participants2: ParticipantMap = new Map([
				[faker.string.uuid(), { userId: '2', role: 'DPS', rank: null }],
			]);

			eventManager.setParticipants(eventId, participants1);
			eventManager.setParticipants(eventId2, participants2);

			const result = Array.from(eventManager.getAllParticipants());
			expect(result).toHaveLength(2);
		});
	});

	describe('creators', () => {
		it('should get creator for an event', () => {
			const creatorId = faker.string.uuid();
			eventManager.setCreator(eventId, creatorId);

			const result = eventManager.getCreator(eventId);
			expect(result).toBe(creatorId);
		});

		it('should return undefined for non-existent event', () => {
			const result = eventManager.getCreator(faker.string.uuid());
			expect(result).toBeUndefined();
		});

		it('should set creator for an event', () => {
			const creatorId = faker.string.uuid();
			eventManager.setCreator(eventId, creatorId);

			const result = eventManager.getCreator(eventId);
			expect(result).toBe(creatorId);
		});

		it('should delete creator for an event', () => {
			const creatorId = faker.string.uuid();
			eventManager.setCreator(eventId, creatorId);
			eventManager.deleteCreator(eventId);

			const result = eventManager.getCreator(eventId);
			expect(result).toBeUndefined();
		});

		it('should find event owned by a user', () => {
			const creatorId = faker.string.uuid();
			const event1 = faker.string.uuid();
			const event2 = faker.string.uuid();

			eventManager.setCreator(event1, faker.string.uuid());
			eventManager.setCreator(event2, creatorId);

			const result = eventManager.userOwnsEvent(creatorId);
			expect(result).toBe(event2);
		});

		it('should return undefined when user does not own any event', () => {
			const creatorId = faker.string.uuid();
			eventManager.setCreator(eventId, faker.string.uuid());

			const result = eventManager.userOwnsEvent(creatorId);
			expect(result).toBeUndefined();
		});
	});

	describe('timers', () => {
		it('should get timer for an event', () => {
			const timer = { startTime: Date.now(), hasStarted: false };
			eventManager.setTimer(eventId, timer);

			const result = eventManager.getTimer(eventId);
			expect(result).toBe(timer);
		});

		it('should return undefined for non-existent event', () => {
			const result = eventManager.getTimer(faker.string.uuid());
			expect(result).toBeUndefined();
		});

		it('should set timer for an event', () => {
			const timer = {
				startTime: Date.now(),
				duration: 60000,
				hasStarted: false,
			};
			eventManager.setTimer(eventId, timer);

			const result = eventManager.getTimer(eventId);
			expect(result).toEqual(timer);
		});

		it('should delete timer for an event', () => {
			const timer = { startTime: Date.now(), hasStarted: false };
			eventManager.setTimer(eventId, timer);
			eventManager.deleteTimer(eventId);

			const result = eventManager.getTimer(eventId);
			expect(result).toBeUndefined();
		});

		it('should get all timers', () => {
			const eventId2 = faker.string.uuid();
			const timer1 = { startTime: Date.now(), hasStarted: false };
			const timer2 = { startTime: Date.now() + 1000, hasStarted: true };

			eventManager.setTimer(eventId, timer1);
			eventManager.setTimer(eventId2, timer2);

			const result = Array.from(eventManager.getAllTimers());
			expect(result).toHaveLength(2);
		});
	});

	describe('threads', () => {
		it('should get thread for an event', () => {
			const threadId = faker.string.uuid();
			eventManager.setThread(eventId, threadId);

			const result = eventManager.getThread(eventId);
			expect(result).toBe(threadId);
		});

		it('should return undefined for non-existent event', () => {
			const result = eventManager.getThread(faker.string.uuid());
			expect(result).toBeUndefined();
		});

		it('should set thread for an event', () => {
			const threadId = faker.string.uuid();
			eventManager.setThread(eventId, threadId);

			const result = eventManager.getThread(eventId);
			expect(result).toBe(threadId);
		});

		it('should delete thread for an event', () => {
			const threadId = faker.string.uuid();
			eventManager.setThread(eventId, threadId);
			eventManager.deleteThread(eventId);

			const result = eventManager.getThread(eventId);
			expect(result).toBeUndefined();
		});
	});

	describe('timeouts', () => {
		it('should get timeout for an event', () => {
			const timeout = setTimeout(() => {}, 1000);
			eventManager.setTimeout(eventId, timeout);

			const result = eventManager.getTimeout(eventId);
			expect(result).toBe(timeout);
			clearTimeout(timeout);
		});

		it('should return undefined for non-existent event', () => {
			const result = eventManager.getTimeout(faker.string.uuid());
			expect(result).toBeUndefined();
		});

		it('should set timeout for an event', () => {
			const timeout = setTimeout(() => {}, 1000);
			eventManager.setTimeout(eventId, timeout);

			const result = eventManager.getTimeout(eventId);
			expect(result).toBe(timeout);
			clearTimeout(timeout);
		});

		it('should delete timeout for an event', () => {
			const timeout = setTimeout(() => {}, 1000);
			eventManager.setTimeout(eventId, timeout);
			eventManager.deleteTimeout(eventId);

			const result = eventManager.getTimeout(eventId);
			expect(result).toBeUndefined();
			clearTimeout(timeout);
		});
	});

	describe('matchIds', () => {
		it('should get match ID for an event', () => {
			const matchId = faker.string.uuid();
			eventManager.setMatchId(eventId, matchId);

			const result = eventManager.getMatchId(eventId);
			expect(result).toBe(matchId);
		});

		it('should return undefined for non-existent event', () => {
			const result = eventManager.getMatchId(faker.string.uuid());
			expect(result).toBeUndefined();
		});

		it('should set match ID for an event', () => {
			const matchId = faker.string.uuid();
			eventManager.setMatchId(eventId, matchId);

			const result = eventManager.getMatchId(eventId);
			expect(result).toBe(matchId);
		});

		it('should delete match ID for an event', () => {
			const matchId = faker.string.uuid();
			eventManager.setMatchId(eventId, matchId);
			eventManager.deleteMatchId(eventId);

			const result = eventManager.getMatchId(eventId);
			expect(result).toBeUndefined();
		});
	});

	describe('voiceChannels', () => {
		it('should get voice channels for an event', () => {
			const channelIds = [faker.string.uuid(), faker.string.uuid()];
			eventManager.setVoiceChannels(eventId, channelIds);

			const result = eventManager.getVoiceChannels(eventId);
			expect(result).toEqual(channelIds);
		});

		it('should return undefined for non-existent event', () => {
			const result = eventManager.getVoiceChannels(faker.string.uuid());
			expect(result).toBeUndefined();
		});

		it('should set voice channels for an event', () => {
			const channelIds = [faker.string.uuid(), faker.string.uuid()];
			eventManager.setVoiceChannels(eventId, channelIds);

			const result = eventManager.getVoiceChannels(eventId);
			expect(result).toEqual(channelIds);
		});

		it('should delete voice channels for an event', () => {
			const channelIds = [faker.string.uuid()];
			eventManager.setVoiceChannels(eventId, channelIds);
			eventManager.deleteVoiceChannels(eventId);

			const result = eventManager.getVoiceChannels(eventId);
			expect(result).toBeUndefined();
		});
	});

	describe('channelIds', () => {
		it('should get channel ID for an event', () => {
			const channelId = faker.string.uuid();
			eventManager.setChannelId(eventId, channelId);

			const result = eventManager.getChannelId(eventId);
			expect(result).toBe(channelId);
		});

		it('should return undefined for non-existent event', () => {
			const result = eventManager.getChannelId(faker.string.uuid());
			expect(result).toBeUndefined();
		});

		it('should set channel ID for an event', () => {
			const channelId = faker.string.uuid();
			eventManager.setChannelId(eventId, channelId);

			const result = eventManager.getChannelId(eventId);
			expect(result).toBe(channelId);
		});

		it('should delete channel ID for an event', () => {
			const channelId = faker.string.uuid();
			eventManager.setChannelId(eventId, channelId);
			eventManager.deleteChannelId(eventId);

			const result = eventManager.getChannelId(eventId);
			expect(result).toBeUndefined();
		});
	});

	describe('guildIds', () => {
		it('should get guild ID for an event', () => {
			const guildId = faker.string.uuid();
			eventManager.setGuildId(eventId, guildId);

			const result = eventManager.getGuildId(eventId);
			expect(result).toBe(guildId);
		});

		it('should return undefined for non-existent event', () => {
			const result = eventManager.getGuildId(faker.string.uuid());
			expect(result).toBeUndefined();
		});

		it('should set guild ID for an event', () => {
			const guildId = faker.string.uuid();
			eventManager.setGuildId(eventId, guildId);

			const result = eventManager.getGuildId(eventId);
			expect(result).toBe(guildId);
		});

		it('should delete guild ID for an event', () => {
			const guildId = faker.string.uuid();
			eventManager.setGuildId(eventId, guildId);
			eventManager.deleteGuildId(eventId);

			const result = eventManager.getGuildId(eventId);
			expect(result).toBeUndefined();
		});
	});

	describe('processing states', () => {
		it('should check if event is being processed', () => {
			expect(eventManager.isProcessing(eventId, 'starting')).toBe(false);

			eventManager.setProcessing(eventId, 'starting');
			expect(eventManager.isProcessing(eventId, 'starting')).toBe(true);
		});

		it('should start processing with specific operation', () => {
			eventManager.setProcessing(eventId, 'finishing');

			expect(eventManager.isProcessing(eventId, 'finishing')).toBe(true);
		});

		it('should check specific processing operation', () => {
			eventManager.setProcessing(eventId, 'starting');

			expect(eventManager.isProcessing(eventId, 'starting')).toBe(true);
			expect(eventManager.isProcessing(eventId, 'finishing')).toBe(false);
		});

		it('should stop specific processing operation', () => {
			eventManager.setProcessing(eventId, 'starting');
			eventManager.setProcessing(eventId, 'finishing');

			eventManager.clearProcessing(eventId, 'starting');

			expect(eventManager.isProcessing(eventId, 'starting')).toBe(false);
			expect(eventManager.isProcessing(eventId, 'finishing')).toBe(true);
		});

		it('should clear all processing states for an event', () => {
			eventManager.setProcessing(eventId, 'starting');
			eventManager.setProcessing(eventId, 'finishing');

			eventManager.deleteProcessingStates(eventId);

			expect(eventManager.isProcessing(eventId, 'starting')).toBe(false);
			expect(eventManager.isProcessing(eventId, 'finishing')).toBe(false);
		});

		it('should handle multiple operations on same event', () => {
			eventManager.setProcessing(eventId, 'starting');
			eventManager.setProcessing(eventId, 'cancelling');

			expect(eventManager.isProcessing(eventId, 'starting')).toBe(true);
			expect(eventManager.isProcessing(eventId, 'cancelling')).toBe(true);
		});
	});

	describe('user to event index', () => {
		it('should check if user is in any event', () => {
			const participants: ParticipantMap = new Map([
				[userId, { userId, role: 'Tank', rank: null }],
			]);
			eventManager.setParticipants(eventId, participants);

			expect(eventManager.isUserInAnyEvent(userId)).toBe(true);
			expect(eventManager.isUserInAnyEvent(faker.string.uuid())).toBe(false);
		});

		it('should update index when participants change', () => {
			const participants: ParticipantMap = new Map([
				[userId, { userId, role: 'Tank', rank: null }],
			]);
			eventManager.setParticipants(eventId, participants);

			expect(eventManager.isUserInAnyEvent(userId)).toBe(true);

			const newEventId = faker.string.uuid();
			const newParticipants: ParticipantMap = new Map([
				[userId, { userId, role: 'DPS', rank: null }],
			]);
			eventManager.setParticipants(newEventId, newParticipants);

			expect(eventManager.isUserInAnyEvent(userId)).toBe(true);
		});

		it('should remove user from index when participant is removed', () => {
			const participants: ParticipantMap = new Map([
				[userId, { userId, role: 'Tank', rank: null }],
			]);
			eventManager.setParticipants(eventId, participants);

			eventManager.removeParticipant(eventId, userId);

			expect(eventManager.isUserInAnyEvent(userId)).toBe(false);
		});
	});

	describe('clearAllEventData', () => {
		it('should clear all data for an event', () => {
			const participants: ParticipantMap = new Map([
				[userId, { userId, role: 'Tank', rank: null }],
			]);
			const creatorId = faker.string.uuid();
			const threadId = faker.string.uuid();
			const channelId = faker.string.uuid();
			const guildId = faker.string.uuid();
			const timer = { startTime: Date.now(), hasStarted: false };

			eventManager.setParticipants(eventId, participants);
			eventManager.setCreator(eventId, creatorId);
			eventManager.setThread(eventId, threadId);
			eventManager.setChannelId(eventId, channelId);
			eventManager.setGuildId(eventId, guildId);
			eventManager.setTimer(eventId, timer);
			eventManager.setProcessing(eventId, 'starting');

			eventManager.clearAllEventData(eventId);

			expect(eventManager.getParticipants(eventId)).toBeUndefined();
			expect(eventManager.getCreator(eventId)).toBeUndefined();
			expect(eventManager.getThread(eventId)).toBeUndefined();
			expect(eventManager.getChannelId(eventId)).toBeUndefined();
			expect(eventManager.getGuildId(eventId)).toBeUndefined();
			expect(eventManager.getTimer(eventId)).toBeUndefined();
			expect(eventManager.isProcessing(eventId, 'starting')).toBe(false);
		});

		it('should clear timeout if it exists', () => {
			const timeout = setTimeout(() => {}, 5000);
			eventManager.setTimeout(eventId, timeout);

			eventManager.clearAllEventData(eventId);

			expect(eventManager.getTimeout(eventId)).toBeUndefined();
		});
	});
});
