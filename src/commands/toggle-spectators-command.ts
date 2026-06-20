import type {
	ChatInputCommandInteraction,
	Client,
	TextChannel,
} from 'discord.js';
import type { EventManager } from '../event/event-manager.js';
import { resolveLocale, t } from '../i18n/index.js';
import type { ThreadManager } from '../managers/thread-manager.js';
import type { VoiceChannelManager } from '../managers/voice-channel-manager.js';
import { ErrorSeverity, handleError } from '../utils/error-handler.js';
import {
	checkProcessingStates,
	safeReplyToInteraction,
} from '../utils/helpers.js';
import { MEDIUM_RETRY_OPTIONS, withRetry } from '../utils/retry.js';

export async function handleToggleSpectatorsCommand(
	interaction: ChatInputCommandInteraction,
	eventManager: EventManager,
	appClient: Client,
	threadManager: ThreadManager,
	voiceChannelManager: VoiceChannelManager,
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

		const currentState = eventManager.getSpectatorsEnabled(userEventId);
		const newState = !currentState;

		eventManager.setSpectatorsEnabled(userEventId, newState);

		if (!newState) {
			const spectators = eventManager.getSpectators(userEventId);

			for (const spectatorId of spectators) {
				const threadId = eventManager.getThread(userEventId);
				if (threadId) {
					const channelId = eventManager.getChannelId(userEventId);
					if (channelId) {
						const channel = await withRetry(
							() => appClient.channels.fetch(channelId),
							MEDIUM_RETRY_OPTIONS,
						);

						if (channel?.isTextBased()) {
							const thread = await threadManager.fetchThread(
								channel as TextChannel,
								threadId,
							);

							if (thread) {
								await threadManager.removeMember(thread, spectatorId);
							}
						}
					}
				}

				const voiceChannelIds = eventManager.getVoiceChannels(userEventId);
				if (voiceChannelIds && interaction.guild) {
					await voiceChannelManager.revokeAccessFromChannels(
						appClient,
						voiceChannelIds,
						spectatorId,
						interaction.guild,
					);
				}
			}

			eventManager.deleteSpectators(userEventId);
		}

		eventManager.queueUpdate(userEventId);

		await interaction.editReply({
			content: newState
				? dict.success.spectatorsEnabled
				: dict.success.spectatorsDisabled,
		});
	} catch (error) {
		handleError({
			reason: 'Error executing toggle-spectators command',
			severity: ErrorSeverity.MEDIUM,
			error,
			metadata: {
				userId: interaction.user.id,
				guildId: interaction.guildId || 'unknown',
			},
		});

		await safeReplyToInteraction(
			interaction,
			dict.errors.toggleSpectatorsError,
		);
	}
}
