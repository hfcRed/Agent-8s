import type { ChatInputCommandInteraction, TextChannel } from 'discord.js';
import { promoteNextFromQueue } from '../event/event-lifecycle.js';
import type { EventManager } from '../event/event-manager.js';
import { resolveLocale, t } from '../i18n/index.js';
import type { ThreadManager } from '../managers/thread-manager.js';
import type { VoiceChannelManager } from '../managers/voice-channel-manager.js';
import type { TelemetryService } from '../telemetry/telemetry.js';
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
	const dict = t(resolveLocale(interaction.locale));

	try {
		await interaction.deferReply({ flags: ['Ephemeral'] });

		const userId = interaction.user.id;
		const userEventId = eventManager.userOwnsEvent(userId);

		if (!userEventId) {
			await interaction.editReply({
				content: dict.errors.noEventOwned,
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
				content: dict.errors.kickSelf,
			});
			return;
		}

		const participants = eventManager.getParticipants(userEventId);
		const isParticipant = participants?.has(targetUserId);
		const isSpectator = eventManager.isUserSpectating(
			userEventId,
			targetUserId,
		);

		if (!isParticipant && !isSpectator) {
			await interaction.editReply({
				content: dict.errors.kickNotParticipant(targetUserId),
			});
			return;
		}

		const channelId = eventManager.getChannelId(userEventId);
		if (!channelId) {
			await interaction.editReply({
				content: dict.errors.channelNotFound,
			});
			return;
		}

		const channel = await withRetry(
			() => interaction.client.channels.fetch(channelId),
			MEDIUM_RETRY_OPTIONS,
		);

		if (!channel || !channel.isTextBased()) {
			await interaction.editReply({
				content: dict.errors.channelNoAccess,
			});
			return;
		}

		const message = await withRetry(
			() => channel.messages.fetch(userEventId),
			MEDIUM_RETRY_OPTIONS,
		);

		if (!message) {
			await interaction.editReply({
				content: dict.errors.messageNotFound,
			});
			return;
		}

		if (isParticipant) {
			eventManager.removeParticipant(userEventId, targetUserId);

			await promoteNextFromQueue(
				userEventId,
				eventManager,
				interaction.client,
				threadManager,
				voiceChannelManager,
				channel as TextChannel,
				telemetry,
			);
		} else {
			eventManager.removeSpectator(userEventId, targetUserId);
		}

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

		const updatedParticipants = eventManager.getParticipants(userEventId);

		eventManager.queueUpdate(userEventId);

		telemetry?.trackUserKicked({
			guildId: interaction.guild?.id || 'unknown',
			eventId: message.id,
			userId: interaction.user.id,
			participants: updatedParticipants
				? Array.from(updatedParticipants.values())
				: [],
			channelId: interaction.channelId,
			matchId: eventManager.getMatchId(userEventId) || 'unknown',
			targetUserId: targetUserId,
		});

		await interaction.editReply({
			content: dict.success.kickSuccess(targetUserId),
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

		await safeReplyToInteraction(interaction, dict.errors.kickError);
	}
}
