import type { Client, Guild, Message, TextChannel } from 'discord.js';
import { EmbedBuilder } from 'discord.js';
import {
	MATCH_ID_LENGTH,
	MAX_PARTICIPANTS,
	TIMINGS,
	WEAPON_ROLES,
} from '../constants.js';
import type { ThreadManager } from '../managers/thread-manager.js';
import type { VoiceChannelManager } from '../managers/voice-channel-manager.js';
import type { TelemetryService } from '../telemetry/telemetry.js';
import { ErrorSeverity, handleError } from '../utils/error-handler.js';
import {
	checkProcessingStates,
	getExcaliburRankOfUser,
} from '../utils/helpers.js';
import { LOW_RETRY_OPTIONS, withRetryOrNull } from '../utils/retry.js';
import type { EventManager, ParticipantMap } from './event-manager.js';

export async function startEvent(
	message: Message,
	participantMap: ParticipantMap,
	eventManager: EventManager,
	appClient: Client,
	threadManager: ThreadManager,
	voiceChannelManager: VoiceChannelManager,
	telemetry?: TelemetryService,
) {
	const timerData = eventManager.getTimer(message.id);
	if (!timerData || timerData.hasStarted) return;

	eventManager.setProcessing(message.id, 'starting');
	try {
		timerData.hasStarted = true;
		const matchId = eventManager.getMatchId(message.id);
		const shortId = matchId?.slice(0, MATCH_ID_LENGTH);

		await eventManager.deleteRepingMessageIfExists(message.id, appClient);

		const timeout = eventManager.getTimeout(message.id);
		if (timeout) {
			clearTimeout(timeout);
			eventManager.deleteTimeout(message.id);
		}

		eventManager.queueUpdate(message.id);

		const participants = Array.from(participantMap.values());
		const channel = message.channel as TextChannel;
		const thread = await threadManager.createEventThread(
			channel,
			shortId || 'unknown',
		);

		const voiceChannels = await voiceChannelManager.createEventVoiceChannels(
			message.guild as Guild,
			channel,
			participants.map((p) => p.userId),
			shortId || 'unknown',
			appClient,
		);
		eventManager.setVoiceChannels(message.id, voiceChannels);

		if (thread) {
			eventManager.setThread(message.id, thread.id);

			await threadManager.sendAndPinEmbed(
				thread,
				EmbedBuilder.from(message.embeds[0]),
			);

			await threadManager.sendMessage(
				thread,
				`**Voice Channels Created**\n\n${voiceChannels.map((channelId) => `<#${channelId}>`).join('\n')}`,
			);

			await threadManager.addMembers(
				thread,
				participants.map((p) => p.userId),
			);
		}

		telemetry?.trackEventStarted({
			guildId: message.guild?.id || 'unknown',
			eventId: message.id,
			userId: eventManager.getCreator(message.id) || 'unknown',
			participants: participants,
			channelId: message.channelId,
			matchId: matchId || 'unknown',
		});
	} catch (error) {
		handleError({
			reason: 'Failed to start event from timeout',
			severity: ErrorSeverity.MEDIUM,
			error,
			metadata: { messageId: message.id },
		});
	} finally {
		eventManager.clearProcessing(message.id, 'starting');
	}
}

export async function cleanupEvent(
	eventId: string,
	eventManager: EventManager,
	appClient: Client,
	threadManager: ThreadManager,
	voiceChannelManager: VoiceChannelManager,
) {
	if (eventManager.isProcessing(eventId, 'cleanup')) return;

	eventManager.setProcessing(eventId, 'cleanup');
	try {
		await eventManager.deleteRepingMessageIfExists(eventId, appClient);

		const threadId = eventManager.getThread(eventId);
		const channelId = eventManager.getChannelId(eventId);

		if (threadId && channelId) {
			try {
				const channel = await withRetryOrNull(
					() => appClient.channels.fetch(channelId),
					LOW_RETRY_OPTIONS,
				);

				if (channel?.isTextBased() && !channel.isDMBased()) {
					const thread = await threadManager.fetchThread(
						channel as TextChannel,
						threadId,
					);

					if (thread) {
						await threadManager.lockAndArchive(thread);
					}
				}
			} catch (error) {
				handleError({
					reason: 'Failed to fetch and archive thread during cleanup',
					severity: ErrorSeverity.LOW,
					error,
					metadata: { threadId, channelId, eventId },
				});
			}
		}

		const voiceChannelIds = eventManager.getVoiceChannels(eventId);
		if (voiceChannelIds) {
			await voiceChannelManager.deleteChannels(appClient, voiceChannelIds);
		}

		eventManager.clearAllEventData(eventId);
	} catch (error) {
		handleError({
			reason: 'Failed to cleanup event',
			severity: ErrorSeverity.MEDIUM,
			error,
			metadata: { eventId },
		});
	} finally {
		eventManager.clearProcessing(eventId, 'cleanup');
		eventManager.deleteProcessingStates(eventId);
	}
}

export async function cleanupStaleEvents(
	eventManager: EventManager,
	appClient: Client,
	threadManager: ThreadManager,
	voiceChannelManager: VoiceChannelManager,
	telemetry?: TelemetryService,
) {
	const MAX_EVENT_LIFETIME = TIMINGS.HOUR_IN_MS * 8;
	const now = Date.now();

	for (const [messageId, timerData] of eventManager.getAllTimers()) {
		if (now - timerData.startTime < MAX_EVENT_LIFETIME) continue;

		try {
			const channelId = eventManager.getChannelId(messageId);
			const guildId = eventManager.getGuildId(messageId);

			eventManager.setTerminalState(messageId, 'expired');
			eventManager.queueUpdate(messageId, true);

			const matchId = eventManager.getMatchId(messageId);
			const participants = eventManager.getParticipants(messageId);

			telemetry?.trackEventExpired({
				guildId: guildId || 'unknown',
				eventId: messageId,
				userId: appClient.user?.id || 'unknown',
				participants: Array.from((participants || new Map()).values()),
				channelId: channelId || 'unknown',
				matchId: matchId || 'unknown',
			});
		} catch (error) {
			handleError({
				reason: `Failed to process stale event ${messageId}`,
				severity: ErrorSeverity.LOW,
				error,
				metadata: { messageId },
			});
		} finally {
			await cleanupEvent(
				messageId,
				eventManager,
				appClient,
				threadManager,
				voiceChannelManager,
			);
		}
	}
}

export async function createEventStartTimeout(
	message: Message,
	timeInMinutes: number,
	eventManager: EventManager,
	threadManager: ThreadManager,
	voiceChannelManager: VoiceChannelManager,
	telemetry?: TelemetryService,
) {
	const existingTimeout = eventManager.getTimeout(message.id);
	if (existingTimeout) {
		clearTimeout(existingTimeout);
		eventManager.deleteTimeout(message.id);
	}

	const timerData = eventManager.getTimer(message.id);
	if (timerData) {
		timerData.duration = timeInMinutes * TIMINGS.MINUTE_IN_MS;
		eventManager.queueUpdate(message.id);
	}

	const timeout = setTimeout(async () => {
		try {
			const currentParticipantMap = eventManager.getParticipants(message.id);
			const timerData = eventManager.getTimer(message.id);

			if (!currentParticipantMap || !timerData || timerData.hasStarted) {
				eventManager.deleteTimeout(message.id);
				return;
			}

			if (
				currentParticipantMap.size === MAX_PARTICIPANTS &&
				!(await checkProcessingStates(message.id, eventManager))
			) {
				await startEvent(
					message,
					currentParticipantMap,
					eventManager,
					message.client,
					threadManager,
					voiceChannelManager,
					telemetry,
				);
			} else {
				if (timerData) {
					timerData.duration = undefined;
				}
				eventManager.queueUpdate(message.id);
			}
		} catch (error) {
			handleError({
				reason: 'Failed to process event start timeout',
				severity: ErrorSeverity.MEDIUM,
				error,
				metadata: { messageId: message.id },
			});
		} finally {
			eventManager.deleteTimeout(message.id);
		}
	}, timeInMinutes * TIMINGS.MINUTE_IN_MS);

	eventManager.setTimeout(message.id, timeout);
}

export async function promoteNextFromQueue(
	messageId: string,
	eventManager: EventManager,
	appClient: Client,
	threadManager: ThreadManager,
	voiceChannelManager: VoiceChannelManager,
	channel: TextChannel,
	telemetry?: TelemetryService,
) {
	const nextUserId = eventManager.removeNextFromQueue(messageId);
	if (!nextUserId) return;

	const guild = channel.guild;
	const member = await withRetryOrNull(
		() => guild.members.fetch(nextUserId),
		LOW_RETRY_OPTIONS,
	);

	eventManager.addParticipant(messageId, nextUserId, {
		userId: nextUserId,
		role: WEAPON_ROLES[0],
		rank: getExcaliburRankOfUser(guild.id, member),
	});

	await eventManager.removeUserFromAllQueues(nextUserId, telemetry);

	const threadId = eventManager.getThread(messageId);
	if (threadId) {
		const thread = await threadManager.fetchThread(channel, threadId);
		if (thread) {
			await threadManager.addMember(thread, nextUserId);
		}
	}

	const voiceChannelIds = eventManager.getVoiceChannels(messageId);
	if (voiceChannelIds) {
		await voiceChannelManager.grantAccessToChannels(
			appClient,
			voiceChannelIds,
			nextUserId,
		);
	}

	telemetry?.trackUserPromotedFromQueue({
		guildId: guild.id,
		eventId: messageId,
		userId: nextUserId,
		participants: Array.from(
			(eventManager.getParticipants(messageId) || new Map()).values(),
		),
		channelId: channel.id,
		matchId: eventManager.getMatchId(messageId) || 'unknown',
	});
}
