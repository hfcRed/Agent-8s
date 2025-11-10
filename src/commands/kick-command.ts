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
	const userId = interaction.user.id;
	const userEventId = eventManager.userOwnsEvent(userId);

	if (!userEventId) {
		await interaction.reply({
			content: ERROR_MESSAGES.NO_EVENT_OWNED,
			flags: ['Ephemeral'],
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
		await interaction.reply({
			content: 'You cannot kick yourself from your own event.',
			flags: ['Ephemeral'],
		});
		return;
	}

	const participants = eventManager.getParticipants(userEventId);
	if (!participants || !participants.has(targetUserId)) {
		await interaction.reply({
			content: `<@${targetUserId}> is not signed up for your event.`,
			flags: ['Ephemeral'],
		});
		return;
	}

	const channelId = eventManager.getChannelId(userEventId);
	if (!channelId) {
		await interaction.reply({
			content: ERROR_MESSAGES.CHANNEL_NOT_FOUND,
			flags: ['Ephemeral'],
		});
		return;
	}

	try {
		const channel = await interaction.client.channels.fetch(channelId);
		if (!channel || !channel.isTextBased()) {
			await interaction.reply({
				content: ERROR_MESSAGES.CHANNEL_NO_ACCESS,
				flags: ['Ephemeral'],
			});
			return;
		}

		const message = await channel.messages.fetch(userEventId);
		if (!message) {
			await interaction.reply({
				content: ERROR_MESSAGES.MESSAGE_NOT_FOUND,
				flags: ['Ephemeral'],
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

		await interaction.reply({
			content: `Successfully kicked <@${targetUserId}> from your event.`,
			flags: ['Ephemeral'],
		});
	} catch (error) {
		console.error('Error in kick command:', error);

		await interaction.reply({
			content: 'An error occurred while trying to kick the user.',
			flags: ['Ephemeral'],
		});
	}
}
