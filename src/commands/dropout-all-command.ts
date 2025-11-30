import type {
	ChatInputCommandInteraction,
	Client,
	Guild,
	TextChannel,
} from 'discord.js';
import { ERROR_MESSAGES, SUCCESS_MESSAGES } from '../constants.js';
import {
	cleanupEvent,
	promoteNextFromQueue,
} from '../event/event-lifecycle.js';
import type { EventManager } from '../event/event-manager.js';
import type { ThreadManager } from '../managers/thread-manager.js';
import type { VoiceChannelManager } from '../managers/voice-channel-manager.js';
import type { TelemetryService } from '../telemetry/telemetry.js';
import { ErrorSeverity, handleError } from '../utils/error-handler.js';
import { safeReplyToInteraction } from '../utils/helpers.js';
import { LOW_RETRY_OPTIONS, withRetryOrNull } from '../utils/retry.js';

export async function handleDropoutAllCommand(
	interaction: ChatInputCommandInteraction,
	eventManager: EventManager,
	appClient: Client,
	threadManager: ThreadManager,
	voiceChannelManager: VoiceChannelManager,
	telemetry?: TelemetryService,
) {
	try {
		await interaction.deferReply({ flags: ['Ephemeral'] });

		const userId = interaction.user.id;
		const guildId = interaction.guild?.id;

		const ownedEventClosed = await closeOwnedEvent(
			userId,
			guildId,
			eventManager,
			appClient,
			threadManager,
			voiceChannelManager,
			telemetry,
		);

		const droppedOut = await dropoutFromParticipatingEvent(
			userId,
			guildId,
			eventManager,
			appClient,
			threadManager,
			voiceChannelManager,
			interaction.guild || undefined,
			telemetry,
		);

		const queuesCleaned = await removeUserFromAllQueues(
			userId,
			eventManager,
			telemetry,
		);

		const spectatorsCleaned = await removeUserFromAllSpectators(
			userId,
			eventManager,
			appClient,
			threadManager,
			voiceChannelManager,
			guildId,
			telemetry,
		);

		if (ownedEventClosed || droppedOut || queuesCleaned || spectatorsCleaned) {
			await interaction.editReply({
				content: SUCCESS_MESSAGES.DROPOUT_ALL_SUCCESS,
			});
		} else {
			await interaction.editReply({
				content: ERROR_MESSAGES.DROPOUT_ALL_NOT_IN_EVENTS,
			});
		}
	} catch (error) {
		handleError({
			reason: 'Error executing dropout-all command',
			severity: ErrorSeverity.MEDIUM,
			error,
			metadata: {
				userId: interaction.user.id,
				guildId: interaction.guildId || 'unknown',
			},
		});

		await safeReplyToInteraction(interaction, ERROR_MESSAGES.DROPOUT_ALL_ERROR);
	}
}

async function closeOwnedEvent(
	userId: string,
	guildId: string | undefined,
	eventManager: EventManager,
	appClient: Client,
	threadManager: ThreadManager,
	voiceChannelManager: VoiceChannelManager,
	telemetry?: TelemetryService,
) {
	const ownedEventId = eventManager.userOwnsEvent(userId);
	if (!ownedEventId) {
		return false;
	}

	const participantMap = eventManager.getParticipants(ownedEventId);
	const matchId = eventManager.getMatchId(ownedEventId);

	eventManager.setProcessing(ownedEventId, 'cancelling');
	try {
		eventManager.setTerminalState(ownedEventId, 'cancelled');
		await eventManager.queueUpdate(ownedEventId, true);

		telemetry?.trackEventCancelled({
			guildId: guildId || 'unknown',
			eventId: ownedEventId,
			userId: userId,
			participants: participantMap ? Array.from(participantMap.values()) : [],
			channelId: eventManager.getChannelId(ownedEventId) || 'unknown',
			matchId: matchId || 'unknown',
		});

		await cleanupEvent(
			ownedEventId,
			eventManager,
			appClient,
			threadManager,
			voiceChannelManager,
		);

		return true;
	} finally {
		eventManager.clearProcessing(ownedEventId, 'cancelling');
	}
}

async function dropoutFromParticipatingEvent(
	userId: string,
	guildId: string | undefined,
	eventManager: EventManager,
	appClient: Client,
	threadManager: ThreadManager,
	voiceChannelManager: VoiceChannelManager,
	guild: Guild | undefined,
	telemetry?: TelemetryService,
) {
	const ownedEventId = eventManager.userOwnsEvent(userId);
	const participatingEventId = eventManager.getUserEventId(userId);

	if (!participatingEventId || participatingEventId === ownedEventId) {
		return false;
	}

	const participantMap = eventManager.getParticipants(participatingEventId);
	const timerData = eventManager.getTimer(participatingEventId);

	if (!participantMap || !timerData) {
		return false;
	}

	eventManager.removeParticipant(participatingEventId, userId);

	if (timerData.hasStarted) {
		const channelId = eventManager.getChannelId(participatingEventId);
		if (channelId) {
			const channel = await withRetryOrNull(
				() => appClient.channels.fetch(channelId),
				LOW_RETRY_OPTIONS,
			);

			if (channel?.isTextBased()) {
				await promoteNextFromQueue(
					participatingEventId,
					eventManager,
					appClient,
					threadManager,
					voiceChannelManager,
					channel as TextChannel,
					telemetry,
				);
			}
		}
	}

	const threadId = eventManager.getThread(participatingEventId);
	const channelId = eventManager.getChannelId(participatingEventId);
	if (threadId && channelId) {
		const channel = await withRetryOrNull(
			() => appClient.channels.fetch(channelId),
			LOW_RETRY_OPTIONS,
		);

		if (channel?.isTextBased()) {
			const thread = await threadManager.fetchThread(
				channel as TextChannel,
				threadId,
			);
			if (thread) {
				await threadManager.removeMember(thread, userId);
			}
		}
	}

	const voiceChannelIds = eventManager.getVoiceChannels(participatingEventId);
	if (voiceChannelIds && guild) {
		await voiceChannelManager.revokeAccessFromChannels(
			appClient,
			voiceChannelIds,
			userId,
			guild,
		);
	}

	eventManager.queueUpdate(participatingEventId);

	const matchId = eventManager.getMatchId(participatingEventId);
	telemetry?.trackUserDropOut({
		guildId: guildId || 'unknown',
		eventId: participatingEventId,
		userId: userId,
		participants: Array.from(participantMap.values()),
		channelId: channelId || 'unknown',
		matchId: matchId || 'unknown',
	});

	return true;
}

async function removeUserFromAllQueues(
	userId: string,
	eventManager: EventManager,
	telemetry?: TelemetryService,
) {
	let removed = false;

	for (const [eventId, participants] of eventManager.getAllParticipants()) {
		const queue = eventManager.getQueue(eventId);
		if (!queue.includes(userId)) continue;

		eventManager.removeFromQueue(eventId, userId);
		eventManager.queueUpdate(eventId);
		removed = true;

		telemetry?.trackUserLeftQueue({
			guildId: eventManager.getGuildId(eventId) || 'unknown',
			eventId: eventId,
			userId: userId,
			participants: Array.from(participants.values()),
			channelId: eventManager.getChannelId(eventId) || 'unknown',
			matchId: eventManager.getMatchId(eventId) || 'unknown',
		});
	}

	return removed;
}

async function removeUserFromAllSpectators(
	userId: string,
	eventManager: EventManager,
	appClient: Client,
	threadManager: ThreadManager,
	voiceChannelManager: VoiceChannelManager,
	guildId: string | undefined,
	telemetry?: TelemetryService,
) {
	let removed = false;

	for (const [eventId, participants] of eventManager.getAllParticipants()) {
		if (!eventManager.isUserSpectating(eventId, userId)) continue;

		eventManager.removeSpectator(eventId, userId);

		const threadId = eventManager.getThread(eventId);
		const channelId = eventManager.getChannelId(eventId);
		if (threadId && channelId) {
			const channel = await withRetryOrNull(
				() => appClient.channels.fetch(channelId),
				LOW_RETRY_OPTIONS,
			);

			if (channel?.isTextBased()) {
				const thread = await threadManager.fetchThread(
					channel as TextChannel,
					threadId,
				);
				if (thread) {
					await threadManager.removeMember(thread, userId);
				}
			}
		}

		const voiceChannelIds = eventManager.getVoiceChannels(eventId);
		if (voiceChannelIds && guildId) {
			const guild = appClient.guilds.cache.get(guildId);
			if (guild) {
				await voiceChannelManager.revokeAccessFromChannels(
					appClient,
					voiceChannelIds,
					userId,
					guild,
				);
			}
		}

		eventManager.queueUpdate(eventId);
		removed = true;

		telemetry?.trackUserStoppedSpectating({
			guildId: guildId || 'unknown',
			eventId: eventId,
			userId: userId,
			participants: Array.from(participants.values()),
			channelId: channelId || 'unknown',
			matchId: eventManager.getMatchId(eventId) || 'unknown',
		});
	}

	return removed;
}
