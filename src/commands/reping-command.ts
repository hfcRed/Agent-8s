import type { ChatInputCommandInteraction } from 'discord.js';
import { ERROR_MESSAGES, MAX_PARTICIPANTS } from '../constants.js';
import type { EventManager } from '../event/event-manager.js';
import { getPingsForServer } from '../utils/helpers.js';

export async function handleRepingCommand(
	interaction: ChatInputCommandInteraction,
	eventManager: EventManager,
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
		if (!message || !message.embeds[0]) {
			await interaction.reply({
				content: ERROR_MESSAGES.MESSAGE_NOT_FOUND,
				flags: ['Ephemeral'],
			});
			return;
		}

		const embedTitle = message.embeds[0].title;
		const isCasual = embedTitle?.includes('[Casual]') ?? false;

		const participants = eventManager.getParticipants(userEventId);
		const currentCount = participants?.size ?? 0;
		const missingPlayers = MAX_PARTICIPANTS - currentCount;

		if (currentCount === MAX_PARTICIPANTS) {
			await interaction.reply({
				content: ERROR_MESSAGES.REPING_EVENT_FULL,
				flags: ['Ephemeral'],
			});
			return;
		}

		const rolePing = getPingsForServer(interaction, isCasual);
		if (!rolePing) {
			await interaction.reply({
				content: ERROR_MESSAGES.ROLE_NOT_FOUND,
				flags: ['Ephemeral'],
			});
			return;
		}

		const guildId = interaction.guildId;
		const messageUrl = `https://discord.com/channels/${guildId}/${channelId}/${userEventId}`;

		await interaction.reply({
			content: `${rolePing}\nLooking for **+${missingPlayers}** for ${messageUrl}`,
		});
	} catch (error) {
		console.error('Error in re-ping command:', error);

		await interaction.reply({
			content: 'An error occurred while trying to re-ping roles.',
			flags: ['Ephemeral'],
		});
	}
}
