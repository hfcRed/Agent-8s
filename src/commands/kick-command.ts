import {
	type ChatInputCommandInteraction,
	EmbedBuilder,
	type TextChannel,
} from 'discord.js';
import { ERROR_MESSAGES } from '../constants.js';
import type { EventManager } from '../event/event-manager.js';
import { checkProcessingStates } from '../interactions/button-handlers.js';
import type { ThreadManager } from '../managers/thread-manager.js';
import type { VoiceChannelManager } from '../managers/voice-channel-manager.js';
import { updateParticipantFields } from '../utils/embed-utils.js';

export async function handleKickCommand(
	interaction: ChatInputCommandInteraction,
	eventManager: EventManager,
	threadManager: ThreadManager,
	voiceChannelManager: VoiceChannelManager,
) {
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

	try {
		const channel = await interaction.client.channels.fetch(channelId);
		if (!channel || !channel.isTextBased()) {
			await interaction.editReply({
				content: ERROR_MESSAGES.CHANNEL_NO_ACCESS,
			});
			return;
		}

		const message = await channel.messages.fetch(userEventId);
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
		if (voiceChannelIds) {
			await voiceChannelManager.revokeAccessFromChannels(
				interaction.client,
				voiceChannelIds,
				targetUserId,
			);
		}

		const timerData = eventManager.getTimer(userEventId);
		if (timerData) {
			const embed = EmbedBuilder.from(message.embeds[0]);
			const isFinalizing = eventManager.isEventFinalizing(message);

			updateParticipantFields(embed, participants, timerData, isFinalizing);
			await message.edit({ embeds: [embed] });
		}

		await interaction.editReply({
			content: `Successfully kicked <@${targetUserId}> from your event.`,
		});
	} catch (error) {
		console.error('Error in kick command:', error);

		await interaction.editReply({
			content: 'An error occurred while trying to kick the user.',
		});
	}
}
