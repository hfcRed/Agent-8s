import {
	type ButtonInteraction,
	type Client,
	EmbedBuilder,
	type GuildMember,
	type TextChannel,
} from 'discord.js';
import {
	COLORS,
	ERROR_MESSAGES,
	MAX_PARTICIPANTS,
	STATUS_MESSAGES,
	TIMINGS,
	WEAPON_ROLES,
} from '../constants.js';
import {
	cleanupEvent,
	createEventStartTimeout,
	startEvent,
} from '../event/event-lifecycle.js';
import type { EventManager } from '../event/event-manager.js';
import type { ThreadManager } from '../managers/thread-manager.js';
import type { VoiceChannelManager } from '../managers/voice-channel-manager.js';
import type { TelemetryService } from '../telemetry/telemetry.js';
import type { ParticipantMap } from '../types.js';
import {
	updateEmbedField,
	updateParticipantFields,
} from '../utils/embed-utils.js';
import { ErrorSeverity, handleError } from '../utils/error-handler.js';
import {
	getExcaliburRankOfUser,
	isUserAdmin,
	safeReplyToInteraction,
} from '../utils/helpers.js';

export async function handleSignUpButton(
	interaction: ButtonInteraction,
	eventManager: EventManager,
	threadManager: ThreadManager,
	voiceChannelManager: VoiceChannelManager,
	telemetry?: TelemetryService,
) {
	try {
		const messageId = interaction.message.id;
		const userId = interaction.user.id;
		const participantMap = eventManager.getParticipants(messageId);
		const timerData = eventManager.getTimer(messageId);

		if (!participantMap || !timerData) return;

		await interaction.deferUpdate();

		if (
			participantMap.size >= MAX_PARTICIPANTS &&
			!participantMap.has(userId)
		) {
			await interaction.followUp({
				content: ERROR_MESSAGES.EVENT_FULL,
				flags: ['Ephemeral'],
			});
			return;
		}

		if (eventManager.isUserInAnyEvent(userId)) {
			await interaction.followUp({
				content: ERROR_MESSAGES.ALREADY_SIGNED_UP,
				flags: ['Ephemeral'],
			});
			return;
		}

		eventManager.addParticipant(messageId, userId, {
			userId: userId,
			role: WEAPON_ROLES[0],
			rank: getExcaliburRankOfUser(interaction),
		});

		const matchId = eventManager.getMatchId(messageId);
		telemetry?.trackUserSignUp({
			guildId: interaction.guild?.id || 'unknown',
			eventId: messageId,
			userId: userId,
			participants: Array.from(participantMap.values()),
			channelId: interaction.channelId,
			matchId: matchId || 'unknown',
		});

		await updateParticipantEmbed(
			interaction,
			participantMap,
			timerData,
			eventManager,
			threadManager,
			voiceChannelManager,
			telemetry,
		);
	} catch (error) {
		handleError({
			reason: 'Error handling sign up button',
			severity: ErrorSeverity.MEDIUM,
			error,
			metadata: {
				userId: interaction.user.id,
				messageId: interaction.message.id,
			},
		});

		await safeReplyToInteraction(
			interaction,
			'An error occurred while processing your sign-up.',
		);
	}
}

export async function handleSignOutButton(
	interaction: ButtonInteraction,
	eventManager: EventManager,
	threadManager: ThreadManager,
	voiceChannelManager: VoiceChannelManager,
	telemetry?: TelemetryService,
) {
	try {
		const messageId = interaction.message.id;
		const userId = interaction.user.id;
		const participantMap = eventManager.getParticipants(messageId);
		const creatorId = eventManager.getCreator(messageId);
		const timerData = eventManager.getTimer(messageId);

		if (!participantMap || !creatorId || !timerData) return;

		await interaction.deferUpdate();

		if (userId === creatorId) {
			await interaction.followUp({
				content: ERROR_MESSAGES.CREATOR_CANNOT_SIGNOUT,
				flags: ['Ephemeral'],
			});
			return;
		}

		eventManager.removeParticipant(messageId, userId);

		const matchId = eventManager.getMatchId(messageId);
		telemetry?.trackUserSignOut({
			guildId: interaction.guild?.id || 'unknown',
			eventId: messageId,
			userId: userId,
			participants: Array.from(participantMap.values()),
			channelId: interaction.channelId,
			matchId: matchId || 'unknown',
		});

		await updateParticipantEmbed(
			interaction,
			participantMap,
			timerData,
			eventManager,
			threadManager,
			voiceChannelManager,
			telemetry,
		);
	} catch (error) {
		handleError({
			reason: 'Error handling sign out button',
			severity: ErrorSeverity.MEDIUM,
			error,
			metadata: {
				userId: interaction.user.id,
				messageId: interaction.message.id,
			},
		});

		await safeReplyToInteraction(
			interaction,
			'An error occurred while processing your sign-out.',
		);
	}
}

export async function handleCancelButton(
	interaction: ButtonInteraction,
	eventManager: EventManager,
	appClient: Client,
	threadManager: ThreadManager,
	voiceChannelManager: VoiceChannelManager,
	telemetry?: TelemetryService,
) {
	try {
		const messageId = interaction.message.id;
		const userId = interaction.user.id;
		const participantMap = eventManager.getParticipants(messageId);
		const creatorId = eventManager.getCreator(messageId);

		if (!participantMap || !creatorId) return;

		await interaction.deferUpdate();

		const isCreator = userId === creatorId;
		const isAdmin = isUserAdmin(interaction.member as GuildMember);

		if (!isCreator && !isAdmin) {
			await interaction.followUp({
				content: ERROR_MESSAGES.CREATOR_ONLY_CANCEL,
				flags: ['Ephemeral'],
			});
			return;
		}

		eventManager.setProcessing(messageId, 'cancelling');
		try {
			const embed = EmbedBuilder.from(interaction.message.embeds[0]).setColor(
				COLORS.CANCELLED,
			);

			updateEmbedField(embed, 'Status', STATUS_MESSAGES.CANCELLED);

			await interaction.editReply({ embeds: [embed], components: [] });

			const matchId = eventManager.getMatchId(messageId);
			telemetry?.trackEventCancelled({
				guildId: interaction.guild?.id || 'unknown',
				eventId: messageId,
				userId: userId,
				participants: Array.from(participantMap.values()),
				channelId: interaction.channelId,
				matchId: matchId || 'unknown',
			});

			await cleanupEvent(
				messageId,
				eventManager,
				appClient,
				threadManager,
				voiceChannelManager,
			);
		} catch (error) {
			handleError({
				reason: 'Failed to cancel event',
				severity: ErrorSeverity.MEDIUM,
				error,
				metadata: { messageId },
			});
		} finally {
			eventManager.clearProcessing(messageId, 'cancelling');
		}
	} catch (error) {
		handleError({
			reason: 'Error handling cancel button',
			severity: ErrorSeverity.MEDIUM,
			error,
			metadata: {
				userId: interaction.user.id,
				messageId: interaction.message.id,
			},
		});

		await safeReplyToInteraction(
			interaction,
			'An error occurred while cancelling the event.',
		);
	}
}

export async function handleStartNowButton(
	interaction: ButtonInteraction,
	eventManager: EventManager,
	appClient: Client,
	threadManager: ThreadManager,
	voiceChannelManager: VoiceChannelManager,
	telemetry?: TelemetryService,
) {
	try {
		const messageId = interaction.message.id;
		const userId = interaction.user.id;
		const participantMap = eventManager.getParticipants(messageId);
		const creatorId = eventManager.getCreator(messageId);

		if (!participantMap || !creatorId) return;

		await interaction.deferUpdate();

		if (userId !== creatorId) {
			await interaction.followUp({
				content: ERROR_MESSAGES.CREATOR_ONLY_START,
				flags: ['Ephemeral'],
			});
			return;
		}

		if (participantMap.size !== MAX_PARTICIPANTS) {
			await interaction.followUp({
				content: ERROR_MESSAGES.NOT_ENOUGH_PARTICIPANTS,
				flags: ['Ephemeral'],
			});
			return;
		}

		await startEvent(
			interaction.message,
			participantMap,
			eventManager,
			appClient,
			threadManager,
			voiceChannelManager,
			telemetry,
		);
	} catch (error) {
		handleError({
			reason: 'Error handling start now button',
			severity: ErrorSeverity.MEDIUM,
			error,
			metadata: {
				userId: interaction.user.id,
				messageId: interaction.message.id,
			},
		});

		await safeReplyToInteraction(
			interaction,
			'An error occurred while starting the event.',
		);
	}
}

export async function handleFinishButton(
	interaction: ButtonInteraction,
	eventManager: EventManager,
	appClient: Client,
	threadManager: ThreadManager,
	voiceChannelManager: VoiceChannelManager,
	telemetry?: TelemetryService,
) {
	try {
		const messageId = interaction.message.id;
		const userId = interaction.user.id;
		const participantMap = eventManager.getParticipants(messageId);
		const creatorId = eventManager.getCreator(messageId);

		if (!participantMap || !creatorId) return;

		await interaction.deferUpdate();

		const isCreator = userId === creatorId;
		const isAdmin = isUserAdmin(interaction.member as GuildMember);

		if (!isCreator && !isAdmin) {
			await interaction.followUp({
				content: ERROR_MESSAGES.CREATOR_ONLY_FINISH,
				flags: ['Ephemeral'],
			});
			return;
		}

		eventManager.setProcessing(messageId, 'finishing');
		try {
			const embed = EmbedBuilder.from(interaction.message.embeds[0]).setColor(
				COLORS.FINISHED,
			);

			updateEmbedField(embed, 'Status', STATUS_MESSAGES.FINISHED);

			await interaction.editReply({ embeds: [embed], components: [] });

			const matchId = eventManager.getMatchId(messageId);
			telemetry?.trackEventFinished({
				guildId: interaction.guild?.id || 'unknown',
				eventId: messageId,
				userId: userId,
				participants: Array.from(participantMap.values()),
				channelId: interaction.channelId,
				matchId: matchId || 'unknown',
			});

			await cleanupEvent(
				messageId,
				eventManager,
				appClient,
				threadManager,
				voiceChannelManager,
			);
		} catch (error) {
			handleError({
				reason: 'Failed to finish event',
				severity: ErrorSeverity.MEDIUM,
				error,
				metadata: { messageId },
			});
		} finally {
			eventManager.clearProcessing(messageId, 'finishing');
		}
	} catch (error) {
		handleError({
			reason: 'Error handling finish button',
			severity: ErrorSeverity.MEDIUM,
			error,
			metadata: {
				userId: interaction.user.id,
				messageId: interaction.message.id,
			},
		});

		await safeReplyToInteraction(
			interaction,
			'An error occurred while finishing the event.',
		);
	}
}

export async function handleDropOutButton(
	interaction: ButtonInteraction,
	eventManager: EventManager,
	appClient: Client,
	threadManager: ThreadManager,
	voiceChannelManager: VoiceChannelManager,
	telemetry?: TelemetryService,
) {
	try {
		const messageId = interaction.message.id;
		const userId = interaction.user.id;
		const participantMap = eventManager.getParticipants(messageId);
		const creatorId = eventManager.getCreator(messageId);
		const timerData = eventManager.getTimer(messageId);

		if (!participantMap || !creatorId || !timerData) return;

		await interaction.deferUpdate();

		if (userId === creatorId) {
			await interaction.followUp({
				content: ERROR_MESSAGES.CREATOR_CANNOT_SIGNOUT,
				flags: ['Ephemeral'],
			});
			return;
		}

		if (!participantMap.has(userId)) {
			await interaction.followUp({
				content: ERROR_MESSAGES.NOT_SIGNED_UP,
				flags: ['Ephemeral'],
			});
			return;
		}

		eventManager.removeParticipant(messageId, userId);

		const threadId = eventManager.getThread(messageId);
		if (threadId) {
			const channel = interaction.channel as TextChannel | null;
			if (channel) {
				const thread = await threadManager.fetchThread(channel, threadId);
				if (thread) {
					await threadManager.removeMember(thread, userId);
				}
			}
		}

		const voiceChannelIds = eventManager.getVoiceChannels(messageId);
		if (voiceChannelIds && interaction.guild) {
			await voiceChannelManager.revokeAccessFromChannels(
				appClient,
				voiceChannelIds,
				userId,
				interaction.guild,
			);
		}

		const embed = EmbedBuilder.from(interaction.message.embeds[0]);
		updateParticipantFields(embed, participantMap, timerData, false);
		await interaction.editReply({ embeds: [embed] });

		const matchId = eventManager.getMatchId(messageId);
		telemetry?.trackUserDropOut({
			guildId: interaction.guild?.id || 'unknown',
			eventId: messageId,
			userId: userId,
			participants: Array.from(participantMap.values()),
			channelId: interaction.channelId,
			matchId: matchId || 'unknown',
		});
	} catch (error) {
		handleError({
			reason: 'Error handling drop out button',
			severity: ErrorSeverity.MEDIUM,
			error,
			metadata: {
				userId: interaction.user.id,
				messageId: interaction.message.id,
			},
		});

		await safeReplyToInteraction(
			interaction,
			'An error occurred while dropping out of the event.',
		);
	}
}

export async function handleDropInButton(
	interaction: ButtonInteraction,
	eventManager: EventManager,
	appClient: Client,
	threadManager: ThreadManager,
	voiceChannelManager: VoiceChannelManager,
	telemetry?: TelemetryService,
) {
	try {
		const messageId = interaction.message.id;
		const userId = interaction.user.id;
		const participantMap = eventManager.getParticipants(messageId);
		const timerData = eventManager.getTimer(messageId);

		if (!participantMap || !timerData) return;

		await interaction.deferUpdate();

		if (participantMap.has(userId)) {
			await interaction.followUp({
				content: ERROR_MESSAGES.ALREADY_SIGNED_UP,
				flags: ['Ephemeral'],
			});
			return;
		}

		if (participantMap.size >= MAX_PARTICIPANTS) {
			await interaction.followUp({
				content: ERROR_MESSAGES.EVENT_FULL,
				flags: ['Ephemeral'],
			});
			return;
		}

		eventManager.addParticipant(messageId, userId, {
			userId: userId,
			role: WEAPON_ROLES[0],
			rank: getExcaliburRankOfUser(interaction),
		});

		if (participantMap.size === MAX_PARTICIPANTS) {
			await eventManager.deleteRepingMessageIfExists(messageId, appClient);
		}

		const threadId = eventManager.getThread(messageId);
		if (threadId) {
			const channel = interaction.channel as TextChannel | null;
			if (channel) {
				const thread = await threadManager.fetchThread(channel, threadId);
				if (thread) {
					await threadManager.addMember(thread, userId);
				}
			}
		}

		const voiceChannelIds = eventManager.getVoiceChannels(messageId);
		if (voiceChannelIds) {
			await voiceChannelManager.grantAccessToChannels(
				appClient,
				voiceChannelIds,
				userId,
			);
		}

		const embed = EmbedBuilder.from(interaction.message.embeds[0]);
		updateParticipantFields(embed, participantMap, timerData, false);
		await interaction.editReply({ embeds: [embed] });

		const matchId = eventManager.getMatchId(messageId);
		telemetry?.trackUserDropIn({
			guildId: interaction.guild?.id || 'unknown',
			eventId: messageId,
			userId: userId,
			participants: Array.from(participantMap.values()),
			channelId: interaction.channelId,
			matchId: matchId || 'unknown',
		});
	} catch (error) {
		handleError({
			reason: 'Error handling drop in button',
			severity: ErrorSeverity.MEDIUM,
			error,
			metadata: {
				userId: interaction.user.id,
				messageId: interaction.message.id,
			},
		});

		await safeReplyToInteraction(
			interaction,
			'An error occurred while dropping in to the event.',
		);
	}
}

async function updateParticipantEmbed(
	interaction: ButtonInteraction,
	participantMap: ParticipantMap,
	timerData: { startTime: number; duration?: number; hasStarted: boolean },
	eventManager: EventManager,
	threadManager: ThreadManager,
	voiceChannelManager: VoiceChannelManager,
	telemetry?: TelemetryService,
) {
	const embed = EmbedBuilder.from(interaction.message.embeds[0]);
	const isFinalizing = eventManager.isEventFinalizing(interaction.message);

	updateParticipantFields(embed, participantMap, timerData, isFinalizing);

	if (isFinalizing) {
		await interaction.editReply({ embeds: [embed] });
		return;
	}

	const timeElapsed = Date.now() - timerData.startTime;
	const timeIsUpOrNotSet =
		!timerData.duration || timeElapsed >= timerData.duration;

	if (
		participantMap.size === MAX_PARTICIPANTS &&
		timeIsUpOrNotSet &&
		!timerData.hasStarted
	) {
		await interaction.editReply({ embeds: [embed] });
		createEventStartTimeout(
			interaction.message,
			TIMINGS.EVENT_START_DELAY_MINUTES,
			eventManager,
			threadManager,
			voiceChannelManager,
			telemetry,
		);
		return;
	}

	await interaction.editReply({ embeds: [embed] });
}
