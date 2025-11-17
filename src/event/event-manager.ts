import type { Client, Message } from 'discord.js';
import { STATUS_MESSAGES, TIMINGS } from '../constants.js';
import type { EventOperation, EventTimer, ParticipantMap } from '../types.js';
import { ErrorSeverity, handleError } from '../utils/error-handler.js';
import { LOW_RETRY_OPTIONS, withRetryOrNull } from '../utils/retry.js';

/**
 * Manages all in-memory state for active events.
 * Each event is keyed by the Discord message ID.
 */
export class EventManager {
	private participants = new Map<string, ParticipantMap>();
	private creators = new Map<string, string>();
	private timers = new Map<string, EventTimer>();
	private threads = new Map<string, string>();
	private timeouts = new Map<string, NodeJS.Timeout>();
	private matchIds = new Map<string, string>();
	private voiceChannels = new Map<string, string[]>();
	private processingStates = new Map<string, Set<EventOperation>>();
	private userToEventIndex = new Map<string, string>();
	private channelIds = new Map<string, string>();
	private guildIds = new Map<string, string>();
	private repingCooldowns = new Map<string, number>();
	private repingMessages = new Map<string, string>();

	getParticipants(eventId: string) {
		return this.participants.get(eventId);
	}

	getAllParticipants() {
		return this.participants.entries();
	}

	setParticipants(eventId: string, participants: ParticipantMap) {
		const oldParticipants = this.participants.get(eventId);
		if (oldParticipants) {
			for (const userId of oldParticipants.keys()) {
				this.userToEventIndex.delete(userId);
			}
		}

		this.participants.set(eventId, participants);
		for (const userId of participants.keys()) {
			this.userToEventIndex.set(userId, eventId);
		}
	}

	deleteParticipants(eventId: string) {
		const participants = this.participants.get(eventId);
		if (participants) {
			for (const userId of participants.keys()) {
				this.userToEventIndex.delete(userId);
			}
		}
		this.participants.delete(eventId);
	}

	addParticipant(
		eventId: string,
		userId: string,
		participantData: { userId: string; role: string; rank: string | null },
	) {
		const participants = this.participants.get(eventId);
		if (participants) {
			participants.set(userId, participantData);
			this.userToEventIndex.set(userId, eventId);
		}
	}

	removeParticipant(eventId: string, userId: string) {
		const participants = this.participants.get(eventId);
		if (participants) {
			participants.delete(userId);
			this.userToEventIndex.delete(userId);
		}
	}

	getCreator(eventId: string) {
		return this.creators.get(eventId);
	}

	getAllCreators() {
		return this.creators.entries();
	}

	userOwnsEvent(userId: string) {
		for (const [eventId, creatorId] of this.creators.entries()) {
			if (creatorId === userId) {
				return eventId;
			}
		}
		return undefined;
	}

	setCreator(eventId: string, creatorId: string) {
		this.creators.set(eventId, creatorId);
	}

	deleteCreator(eventId: string) {
		this.creators.delete(eventId);
	}

	getTimer(eventId: string) {
		return this.timers.get(eventId);
	}

	setTimer(eventId: string, timer: EventTimer) {
		this.timers.set(eventId, timer);
	}

	deleteTimer(eventId: string) {
		this.timers.delete(eventId);
	}

	getAllTimers() {
		return this.timers.entries();
	}

	getThread(eventId: string) {
		return this.threads.get(eventId);
	}

	setThread(eventId: string, threadId: string) {
		this.threads.set(eventId, threadId);
	}

	deleteThread(eventId: string) {
		this.threads.delete(eventId);
	}

	getTimeout(eventId: string) {
		return this.timeouts.get(eventId);
	}

	setTimeout(eventId: string, timeout: NodeJS.Timeout) {
		this.timeouts.set(eventId, timeout);
	}

	deleteTimeout(eventId: string) {
		this.timeouts.delete(eventId);
	}

	getMatchId(eventId: string) {
		return this.matchIds.get(eventId);
	}

	setMatchId(eventId: string, matchId: string) {
		this.matchIds.set(eventId, matchId);
	}

	deleteMatchId(eventId: string) {
		this.matchIds.delete(eventId);
	}

	getVoiceChannels(eventId: string) {
		return this.voiceChannels.get(eventId);
	}

	setVoiceChannels(eventId: string, channelIds: string[]) {
		this.voiceChannels.set(eventId, channelIds);
	}

	deleteVoiceChannels(eventId: string) {
		this.voiceChannels.delete(eventId);
	}

	getChannelId(eventId: string) {
		return this.channelIds.get(eventId);
	}

	setChannelId(eventId: string, channelId: string) {
		this.channelIds.set(eventId, channelId);
	}

	deleteChannelId(eventId: string) {
		this.channelIds.delete(eventId);
	}

	getGuildId(eventId: string) {
		return this.guildIds.get(eventId);
	}

	setGuildId(eventId: string, guildId: string) {
		this.guildIds.set(eventId, guildId);
	}

	deleteGuildId(eventId: string) {
		this.guildIds.delete(eventId);
	}

	isProcessing(eventId: string, operation: EventOperation) {
		const states = this.processingStates.get(eventId) || new Set();
		return states.has(operation);
	}

	setProcessing(eventId: string, operation: EventOperation) {
		const states = this.processingStates.get(eventId) || new Set();
		states.add(operation);
		this.processingStates.set(eventId, states);

		setTimeout(() => {
			this.clearProcessing(eventId, operation);
		}, TIMINGS.PROCESSING_TIMEOUT_MS);
	}

	clearProcessing(eventId: string, operation: EventOperation) {
		const states = this.processingStates.get(eventId);
		if (!states) return;

		states.delete(operation);
		if (states.size === 0) {
			this.processingStates.delete(eventId);
		}
	}

	deleteProcessingStates(eventId: string) {
		this.processingStates.delete(eventId);
	}

	getRepingCooldown(eventId: string) {
		return this.repingCooldowns.get(eventId);
	}

	setRepingCooldown(eventId: string, timestamp: number) {
		this.repingCooldowns.set(eventId, timestamp);
	}

	deleteRepingCooldown(eventId: string) {
		this.repingCooldowns.delete(eventId);
	}

	getRepingMessage(eventId: string) {
		return this.repingMessages.get(eventId);
	}

	setRepingMessage(eventId: string, messageId: string) {
		this.repingMessages.set(eventId, messageId);
	}

	deleteRepingMessage(eventId: string) {
		this.repingMessages.delete(eventId);
	}

	async deleteRepingMessageIfExists(eventId: string, client: Client) {
		const repingMessageId = this.getRepingMessage(eventId);
		const channelId = this.getChannelId(eventId);
		if (!channelId || !repingMessageId) return;

		try {
			const channel = await withRetryOrNull(
				() => client.channels.fetch(channelId),
				LOW_RETRY_OPTIONS,
			);

			if (!channel || !channel.isTextBased()) return;

			const message = await withRetryOrNull(
				() => channel.messages.fetch(repingMessageId),
				LOW_RETRY_OPTIONS,
			);

			if (message) {
				await withRetryOrNull(() => message.delete(), LOW_RETRY_OPTIONS);
			}

			this.deleteRepingMessage(eventId);
		} catch (error) {
			handleError({
				reason: 'Failed to delete previous reping message',
				severity: ErrorSeverity.LOW,
				error,
				metadata: {
					messageId: repingMessageId,
					eventId,
				},
			});
		}
	}

	isUserInAnyEvent(userId: string) {
		return this.userToEventIndex.has(userId);
	}

	isEventFinalizing(message: Message) {
		const embed = message.embeds[0];
		if (!embed || !embed.fields) return false;

		const statusField = embed.fields.find((field) => field.name === 'Status');
		return statusField?.value === STATUS_MESSAGES.FINALIZING;
	}

	clearAllEventData(eventId: string) {
		this.deleteParticipants(eventId);
		this.deleteCreator(eventId);
		this.deleteTimer(eventId);
		this.deleteThread(eventId);
		this.deleteMatchId(eventId);
		this.deleteVoiceChannels(eventId);
		this.deleteProcessingStates(eventId);
		this.deleteChannelId(eventId);
		this.deleteGuildId(eventId);
		this.deleteRepingCooldown(eventId);
		this.deleteRepingMessage(eventId);

		const timeout = this.getTimeout(eventId);
		if (timeout) {
			clearTimeout(timeout);
			this.deleteTimeout(eventId);
		}
	}
}
