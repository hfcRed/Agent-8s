import { type Client, EmbedBuilder } from 'discord.js';
import {
	COLORS,
	FIELD_NAMES,
	MAX_PARTICIPANTS,
	PARTICIPANT_FIELD_NAME,
	START_MESSAGES,
	STATUS_MESSAGES,
	SUCCESS_MESSAGES,
	TIMINGS,
	TITLES,
} from '../constants.js';
import type { ThreadManager } from '../managers/thread-manager.js';
import type { TelemetryService } from '../telemetry/telemetry.js';
import {
	createEventButtons,
	createEventStartedButtons,
	createRoleSelectMenu,
} from '../utils/embed-utils.js';
import { ErrorSeverity, handleError } from '../utils/error-handler.js';
import { getEmoteForRank } from '../utils/helpers.js';
import {
	LOW_RETRY_OPTIONS,
	withRetry,
	withRetryOrNull,
} from '../utils/retry.js';

type EventOperation = 'starting' | 'finishing' | 'cancelling' | 'cleanup';
type TerminalStates = 'cancelled' | 'finished' | 'expired' | 'shutdown';

export interface EventTimer {
	startTime: number;
	duration?: number;
	hasStarted: boolean;
}

export interface ParticipantData {
	userId: string;
	role: string;
	rank: string | null;
}

export type ParticipantMap = Map<string, ParticipantData>;

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
	private queues = new Map<string, string[]>();

	private casual = new Map<string, boolean>();
	private info = new Map<string, string | undefined>();
	private updateTimeouts = new Map<string, NodeJS.Timeout>();
	private terminalStates = new Map<string, TerminalStates>();

	constructor(private client: Client) {}

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

	getQueue(eventId: string) {
		return this.queues.get(eventId) || [];
	}

	addToQueue(eventId: string, userId: string) {
		const queue = this.queues.get(eventId) || [];

		if (!queue.includes(userId)) {
			queue.push(userId);
			this.queues.set(eventId, queue);
		}
	}

	removeFromQueue(eventId: string, userId: string) {
		const queue = this.queues.get(eventId) || [];
		const filtered = queue.filter((id) => id !== userId);

		this.queues.set(eventId, filtered);
	}

	isUserInQueue(eventId: string, userId: string) {
		const queue = this.queues.get(eventId) || [];
		return queue.includes(userId);
	}

	removeNextFromQueue(eventId: string) {
		const queue = this.queues.get(eventId) || [];
		const next = queue.shift();

		this.queues.set(eventId, queue);
		return next;
	}

	async removeUserFromAllQueues(userId: string, telemetry?: TelemetryService) {
		for (const [eventId, queue] of this.queues.entries()) {
			if (!queue.includes(userId)) continue;

			const filtered = queue.filter((id) => id !== userId);

			this.queues.set(eventId, filtered);
			this.queueUpdate(eventId);

			await telemetry?.trackUserLeftQueue({
				guildId: this.getGuildId(eventId) || 'unknown',
				eventId: eventId,
				userId: userId,
				participants: Array.from(
					(this.getParticipants(eventId) || new Map()).values(),
				),
				channelId: this.getChannelId(eventId) || 'unknown',
				matchId: this.getMatchId(eventId) || 'unknown',
			});
		}
	}

	deleteQueue(eventId: string) {
		this.queues.delete(eventId);
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
		this.deleteQueue(eventId);

		this.casual.delete(eventId);
		this.info.delete(eventId);
		this.terminalStates.delete(eventId);

		const timeout = this.getTimeout(eventId);
		if (timeout) {
			clearTimeout(timeout);
			this.deleteTimeout(eventId);
		}

		const updateTimeout = this.updateTimeouts.get(eventId);
		if (updateTimeout) {
			clearTimeout(updateTimeout);
			this.updateTimeouts.delete(eventId);
		}
	}

	setMessageData(eventId: string, casual: boolean, info?: string) {
		this.casual.set(eventId, casual);
		this.info.set(eventId, info);
	}

	setTerminalState(
		eventId: string,
		state: 'cancelled' | 'finished' | 'expired' | 'shutdown',
	) {
		this.terminalStates.set(eventId, state);
	}

	getTerminalState(eventId: string) {
		return this.terminalStates.get(eventId);
	}

	buildEmbed(eventId: string) {
		const participantMap = this.getParticipants(eventId);
		const timerData = this.getTimer(eventId);
		const creatorId = this.getCreator(eventId);
		const queue = this.getQueue(eventId);
		const casualMode = this.casual.get(eventId) ?? true;
		const infoText = this.info.get(eventId);

		if (!participantMap || !timerData || !creatorId) return null;

		const creator = this.client.users.cache.get(creatorId);
		const username = creator?.username || 'unknown';
		const avatarUrl = creator?.displayAvatarURL() || '';

		const participants = Array.from(participantMap.values());
		const participantCount = participants.length;

		const terminalState = this.getTerminalState(eventId);

		let color: string = COLORS.OPEN;
		let status: string = STATUS_MESSAGES.OPEN;

		if (terminalState) {
			switch (terminalState) {
				case 'cancelled':
					color = COLORS.CANCELLED;
					status = STATUS_MESSAGES.CANCELLED;
					break;
				case 'finished':
					color = COLORS.FINISHED;
					status = STATUS_MESSAGES.FINISHED;
					break;
				case 'expired':
					color = COLORS.CANCELLED;
					status = STATUS_MESSAGES.EXPIRED;
					break;
				case 'shutdown':
					color = COLORS.CANCELLED;
					status = STATUS_MESSAGES.SHUTDOWN;
					break;
			}
		} else if (timerData.hasStarted && participantCount === MAX_PARTICIPANTS) {
			color = COLORS.STARTED;
			status = STATUS_MESSAGES.STARTED;
		} else if (participantCount === MAX_PARTICIPANTS) {
			status = STATUS_MESSAGES.READY;
		}

		let startMessage: string = START_MESSAGES.WHEN_FULL;
		if (timerData.hasStarted) {
			startMessage = START_MESSAGES.AT_TIME(timerData.startTime);
		} else if (timerData.duration) {
			const startTimestamp = timerData.startTime + timerData.duration;
			startMessage = START_MESSAGES.AT_TIME(startTimestamp);
		}

		const participantList = participants
			.map(
				(p) =>
					`- ${getEmoteForRank(this.getGuildId(eventId), p.rank)}<@${p.userId}>${p.userId === creatorId ? ' 👑' : ''}`,
			)
			.join('\n');
		const roleList = participants
			.map((p) => `- ${p.role || 'None'}`)
			.join('\n');

		const embed = new EmbedBuilder()
			.setAuthor({
				name: username,
				iconURL: avatarUrl,
			})
			.setTitle(casualMode ? TITLES.CASUAL : TITLES.COMPETITIVE)
			.addFields([
				{
					name: PARTICIPANT_FIELD_NAME(participantCount),
					value: participantList,
					inline: true,
				},
				{
					name: FIELD_NAMES.ROLE,
					value: roleList,
					inline: true,
				},
				{
					name: FIELD_NAMES.START,
					value: startMessage,
					inline: false,
				},
				{
					name: FIELD_NAMES.STATUS,
					value: status,
					inline: false,
				},
			])
			.setColor(color as `#${string}`);

		if (infoText) {
			embed.setDescription(infoText);
		}

		if (queue.length > 0) {
			const queueValue = queue.map((userId) => `- <@${userId}>`).join('\n');
			embed.addFields({
				name: FIELD_NAMES.QUEUE,
				value: queueValue,
				inline: false,
			});
		}

		return embed;
	}

	buildComponents(eventId: string) {
		const timerData = this.getTimer(eventId);
		const terminalState = this.getTerminalState(eventId);

		if (!timerData || terminalState) return [];

		if (timerData.hasStarted) {
			return [createEventStartedButtons(), createRoleSelectMenu()];
		}

		const timeInMinutes = timerData.duration
			? timerData.duration / TIMINGS.MINUTE_IN_MS
			: undefined;
		return [createEventButtons(timeInMinutes), createRoleSelectMenu()];
	}

	async transferOwnership(
		eventId: string,
		oldOwnerId: string,
		threadManager: ThreadManager,
		telemetry?: TelemetryService,
	) {
		const participants = this.getParticipants(eventId);
		if (!participants || participants.size < 2) return null;

		let newOwnerId: string | null = null;
		for (const userId of participants.keys()) {
			if (userId !== oldOwnerId) {
				newOwnerId = userId;
				break;
			}
		}
		if (!newOwnerId) return null;

		this.setCreator(eventId, newOwnerId);

		await telemetry?.trackOwnershipTransferred({
			guildId: this.getGuildId(eventId) || 'unknown',
			eventId: eventId,
			userId: oldOwnerId,
			targetUserId: newOwnerId,
			participants: Array.from(participants.values()),
			channelId: this.getChannelId(eventId) || 'unknown',
			matchId: this.getMatchId(eventId) || 'unknown',
		});

		const threadId = this.getThread(eventId);
		const channelId = this.getChannelId(eventId);
		if (!threadId || !channelId) return newOwnerId;

		try {
			const channel = await withRetryOrNull(
				() => this.client.channels.fetch(channelId),
				LOW_RETRY_OPTIONS,
			);

			if (channel?.isTextBased() && 'threads' in channel) {
				const thread = await threadManager.fetchThread(
					channel as Parameters<typeof threadManager.fetchThread>[0],
					threadId,
				);

				if (thread) {
					await threadManager.sendMessage(
						thread,
						SUCCESS_MESSAGES.OWNERSHIP_TRANSFERRED(newOwnerId),
					);
				}
			}
		} catch (error) {
			handleError({
				reason: 'Failed to send ownership transfer notification',
				severity: ErrorSeverity.LOW,
				error,
				metadata: { eventId, newOwnerId },
			});
		}

		return newOwnerId;
	}

	queueUpdate(eventId: string, immediate = false) {
		const existingTimeout = this.updateTimeouts.get(eventId);
		if (existingTimeout) {
			clearTimeout(existingTimeout);
		}

		const performUpdate = async () => {
			try {
				this.updateTimeouts.delete(eventId);

				const channelId = this.getChannelId(eventId);
				if (!channelId) return;

				const channel = await withRetryOrNull(
					() => this.client.channels.fetch(channelId),
					LOW_RETRY_OPTIONS,
				);
				if (!channel || !channel.isTextBased()) return;

				const message = await withRetryOrNull(
					() => channel.messages.fetch(eventId),
					LOW_RETRY_OPTIONS,
				);
				if (!message) return;

				const embed = this.buildEmbed(eventId);
				const components = this.buildComponents(eventId);
				if (!embed) return;

				await withRetry(
					() => message.edit({ embeds: [embed], components }),
					LOW_RETRY_OPTIONS,
				);
			} catch (error) {
				handleError({
					reason: 'Failed to update event message',
					severity: ErrorSeverity.LOW,
					error,
					metadata: { eventId },
				});
			}
		};

		if (immediate) {
			return performUpdate();
		} else {
			const timeout = setTimeout(
				performUpdate,
				TIMINGS.MESSAGE_UPDATE_DEBOUNCE_MS,
			);
			this.updateTimeouts.set(eventId, timeout);
		}
	}
}
