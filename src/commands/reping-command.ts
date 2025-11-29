import type { ChatInputCommandInteraction } from 'discord.js';
import {
	ERROR_MESSAGES,
	MAX_PARTICIPANTS,
	REPING_MESSAGE,
	TIMINGS,
	TITLES,
} from '../constants.js';
import type { EventManager } from '../event/event-manager.js';
import type { TelemetryService } from '../telemetry/telemetry.js';
import { ErrorSeverity, handleError } from '../utils/error-handler.js';
import {
	checkProcessingStates,
	getPingsForServer,
	safeReplyToInteraction,
} from '../utils/helpers.js';
import { MEDIUM_RETRY_OPTIONS, withRetry } from '../utils/retry.js';

export async function handleRepingCommand(
	interaction: ChatInputCommandInteraction,
	eventManager: EventManager,
	telemetry?: TelemetryService,
) {
	try {
		const userId = interaction.user.id;
		const userEventId = eventManager.getUserEventId(userId);

		if (!userEventId) {
			await interaction.reply({
				content: ERROR_MESSAGES.NOT_IN_EVENT,
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

		const lastUsed = eventManager.getRepingCooldown(userEventId);
		const now = Date.now();

		if (lastUsed) {
			const timeSinceLastUse = now - lastUsed;

			if (timeSinceLastUse < TIMINGS.REPING_COOLDOWN_MS) {
				const remainingMs = TIMINGS.REPING_COOLDOWN_MS - timeSinceLastUse;
				const remainingMinutes = Math.ceil(remainingMs / 60000);

				await interaction.reply({
					content: ERROR_MESSAGES.REPING_COOLDOWN(remainingMinutes),
					flags: ['Ephemeral'],
				});
				return;
			}
		}

		const channelId = eventManager.getChannelId(userEventId);
		if (!channelId) {
			await interaction.reply({
				content: ERROR_MESSAGES.CHANNEL_NOT_FOUND,
				flags: ['Ephemeral'],
			});
			return;
		}

		const channel = await withRetry(
			() => interaction.client.channels.fetch(channelId),
			MEDIUM_RETRY_OPTIONS,
		);

		if (!channel || !channel.isTextBased()) {
			await interaction.reply({
				content: ERROR_MESSAGES.CHANNEL_NO_ACCESS,
				flags: ['Ephemeral'],
			});
			return;
		}

		const message = await withRetry(
			() => channel.messages.fetch(userEventId),
			MEDIUM_RETRY_OPTIONS,
		);

		if (!message || !message.embeds[0]) {
			await interaction.reply({
				content: ERROR_MESSAGES.MESSAGE_NOT_FOUND,
				flags: ['Ephemeral'],
			});
			return;
		}

		const embedTitle = message.embeds[0].title;
		const isCasual = embedTitle?.includes(TITLES.CASUAL_PREFIX) ?? false;

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

		await eventManager.deleteRepingMessageIfExists(
			userEventId,
			interaction.client,
		);

		const guildId = interaction.guildId;
		const messageUrl = `https://discord.com/channels/${guildId}/${channelId}/${userEventId}`;

		const reply = await interaction.reply({
			content: REPING_MESSAGE(rolePing, missingPlayers, messageUrl),
		});

		const repingMessage = await withRetry(
			() => reply.fetch(),
			MEDIUM_RETRY_OPTIONS,
		);

		eventManager.setRepingMessage(userEventId, repingMessage.id);
		eventManager.setRepingCooldown(userEventId, now);

		telemetry?.trackEventRepinged({
			guildId: interaction.guild?.id || 'unknown',
			eventId: message.id,
			userId: interaction.user.id,
			participants: Array.from(participants?.values() || []),
			channelId: interaction.channelId,
			matchId: eventManager.getMatchId(userEventId) || 'unknown',
		});
	} catch (error) {
		handleError({
			reason: 'Error executing reping command',
			severity: ErrorSeverity.MEDIUM,
			error,
			metadata: {
				userId: interaction.user.id,
				guildId: interaction.guildId || 'unknown',
			},
		});

		await safeReplyToInteraction(interaction, ERROR_MESSAGES.REPING_ERROR);
	}
}
