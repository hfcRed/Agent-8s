import {
	type ChatInputCommandInteraction,
	EmbedBuilder,
	type TextChannel,
} from 'discord.js';
import { ERROR_MESSAGES } from '../constants.js';
import type { EventManager } from '../event/event-manager.js';
import type { ThreadManager } from '../managers/thread-manager.js';
import type { VoiceChannelManager } from '../managers/voice-channel-manager.js';
import type { TelemetryService } from '../telemetry/telemetry.js';
import { updateParticipantFields } from '../utils/embed-utils.js';
import { ErrorSeverity, handleError } from '../utils/error-handler.js';
import {
	checkProcessingStates,
	safeReplyToInteraction,
} from '../utils/helpers.js';
import { MEDIUM_RETRY_OPTIONS, withRetry } from '../utils/retry.js';

export async function handleKickCommand(
	interaction: ChatInputCommandInteraction,
	eventManager: EventManager,
	threadManager: ThreadManager,
	voiceChannelManager: VoiceChannelManager,
	telemetry?: TelemetryService,
) {
	try {
		await interaction.deferReply({ flags: ['Ephemeral'] });

		const userId = interaction.user.id;
		const userEventId = eventManager.userOwnsEvent(userId);

		if (!userEventId) {
			await interaction.editReply({
				content: ERROR_MESSAGES.NO_EVENT_OWNED,
			});
			return;
		}

		const processing = await checkProcessingStates(
			userEventId,
			eventManager,
			interaction,
		);
		if (processing) return;

		const targetUser = interaction.options.getUser('user', true);
		const targetUserId = targetUser.id;

		if (targetUserId === userId) {
			await interaction.editReply({
				content: 'You cannot kick yourself from your own event.',
			});
			return;
		}

		const participants = eventManager.getParticipants(userEventId);
		if (!participants || !participants.has(targetUserId)) {
			await interaction.editReply({
				content: `<@${targetUserId}> is not signed up for your event.`,
			});
			return;
		}

		const channelId = eventManager.getChannelId(userEventId);
		if (!channelId) {
			await interaction.editReply({
				content: ERROR_MESSAGES.CHANNEL_NOT_FOUND,
			});
			return;
		}

		const channel = await withRetry(
			() => interaction.client.channels.fetch(channelId),
			MEDIUM_RETRY_OPTIONS,
		);

		if (!channel || !channel.isTextBased()) {
			await interaction.editReply({
				content: ERROR_MESSAGES.CHANNEL_NO_ACCESS,
			});
			return;
		}

		const message = await withRetry(
			() => channel.messages.fetch(userEventId),
			MEDIUM_RETRY_OPTIONS,
		);

		if (!message) {
			await interaction.editReply({
				content: ERROR_MESSAGES.MESSAGE_NOT_FOUND,
			});
			return;
		}

		eventManager.removeParticipant(userEventId, targetUserId);

		const threadId = eventManager.getThread(userEventId);
		if (threadId) {
			const thread = await threadManager.fetchThread(
				channel as TextChannel,
				threadId,
			);
			if (thread) {
				await threadManager.removeMember(thread, targetUserId);
			}
		}

		const voiceChannelIds = eventManager.getVoiceChannels(userEventId);
		if (voiceChannelIds && interaction.guild) {
			await voiceChannelManager.revokeAccessFromChannels(
				interaction.client,
				voiceChannelIds,
				targetUserId,
				interaction.guild,
			);
		}

		const timerData = eventManager.getTimer(userEventId);
		if (timerData) {
			const embed = EmbedBuilder.from(message.embeds[0]);
			const isFinalizing = eventManager.isEventFinalizing(message);

			updateParticipantFields(embed, participants, timerData, isFinalizing);
			await message.edit({ embeds: [embed] });
		}

		telemetry?.trackUserKicked({
			guildId: interaction.guild?.id || 'unknown',
			eventId: message.id,
			userId: interaction.user.id,
			participants: Array.from(participants.values()),
			channelId: interaction.channelId,
			matchId: eventManager.getMatchId(userEventId) || 'unknown',
			targetUserId: targetUserId,
		});

		await interaction.editReply({
			content: `Successfully kicked <@${targetUserId}> from your event.`,
		});
	} catch (error) {
		handleError({
			reason: 'Error executing kick command',
			severity: ErrorSeverity.MEDIUM,
			error,
			metadata: {
				userId: interaction.user.id,
				guildId: interaction.guildId || 'unknown',
			},
		});

		await safeReplyToInteraction(
			interaction,
			'An error occurred while trying to kick the user.',
		);
	}
}
