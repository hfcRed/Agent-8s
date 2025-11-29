import type {
	ButtonInteraction,
	Client,
	GuildMember,
	TextChannel,
} from 'discord.js';
import {
	ERROR_MESSAGES,
	MAX_PARTICIPANTS,
	WEAPON_ROLES,
} from '../constants.js';
import {
	cleanupEvent,
	promoteNextFromQueue,
	startEvent,
} from '../event/event-lifecycle.js';
import type { EventManager, ParticipantMap } from '../event/event-manager.js';
import type { ThreadManager } from '../managers/thread-manager.js';
import type { VoiceChannelManager } from '../managers/voice-channel-manager.js';
import type { TelemetryService } from '../telemetry/telemetry.js';
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
			rank: getExcaliburRankOfUser(
				interaction.guild?.id,
				interaction.member as GuildMember,
			),
		});

		await eventManager.removeUserFromAllQueues(userId, telemetry);

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

		await safeReplyToInteraction(interaction, ERROR_MESSAGES.SIGN_UP_ERROR);
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

		await safeReplyToInteraction(interaction, ERROR_MESSAGES.SIGN_OUT_ERROR);
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
			eventManager.setTerminalState(messageId, 'cancelled');
			await eventManager.queueUpdate(messageId, true);

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

		await safeReplyToInteraction(interaction, ERROR_MESSAGES.CANCEL_ERROR);
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

		await safeReplyToInteraction(interaction, ERROR_MESSAGES.START_ERROR);
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
			eventManager.setTerminalState(messageId, 'finished');
			await eventManager.queueUpdate(messageId, true);

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

		await safeReplyToInteraction(interaction, ERROR_MESSAGES.FINISH_ERROR);
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

		if (!participantMap.has(userId)) {
			await interaction.followUp({
				content: ERROR_MESSAGES.NOT_SIGNED_UP,
				flags: ['Ephemeral'],
			});
			return;
		}

		if (userId === creatorId) {
			if (participantMap.size <= 1) {
				await interaction.followUp({
					content: ERROR_MESSAGES.OWNER_ONLY_PARTICIPANT,
					flags: ['Ephemeral'],
				});
				return;
			}

			const newOwnerId = await eventManager.transferOwnership(
				messageId,
				userId,
				threadManager,
				telemetry,
			);

			if (!newOwnerId) {
				await interaction.followUp({
					content: ERROR_MESSAGES.DROP_OUT_ERROR,
					flags: ['Ephemeral'],
				});
				return;
			}
		}

		eventManager.removeParticipant(messageId, userId);

		const channel = interaction.channel as TextChannel;
		await promoteNextFromQueue(
			messageId,
			eventManager,
			appClient,
			threadManager,
			voiceChannelManager,
			channel,
			telemetry,
		);

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

		eventManager.queueUpdate(messageId);

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

		await safeReplyToInteraction(interaction, ERROR_MESSAGES.DROP_OUT_ERROR);
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

		const matchId = eventManager.getMatchId(messageId);
		const telemetryData = {
			guildId: interaction.guild?.id || 'unknown',
			eventId: messageId,
			userId: userId,
			participants: Array.from(participantMap.values()),
			channelId: interaction.channelId,
			matchId: matchId || 'unknown',
		};

		const wasSpectating = eventManager.isUserSpectating(messageId, userId);
		if (wasSpectating) {
			eventManager.removeSpectator(messageId, userId);
			telemetry?.trackUserStoppedSpectating(telemetryData);
		}

		eventManager.addParticipant(messageId, userId, {
			userId: userId,
			role: WEAPON_ROLES[0],
			rank: getExcaliburRankOfUser(
				interaction.guild?.id,
				interaction.member as GuildMember,
			),
		});

		await eventManager.removeUserFromAllQueues(userId, telemetry);

		if (participantMap.size === MAX_PARTICIPANTS) {
			await eventManager.deleteRepingMessageIfExists(messageId, appClient);
		}

		if (!wasSpectating) {
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
		}

		eventManager.queueUpdate(messageId);

		telemetry?.trackUserDropIn(telemetryData);
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

		await safeReplyToInteraction(interaction, ERROR_MESSAGES.DROP_IN_ERROR);
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
	const messageId = interaction.message.id;
	const timeElapsed = Date.now() - timerData.startTime;
	const timeIsUpOrNotSet =
		!timerData.duration || timeElapsed >= timerData.duration;

	if (
		participantMap.size === MAX_PARTICIPANTS &&
		timeIsUpOrNotSet &&
		!timerData.hasStarted
	) {
		startEvent(
			interaction.message,
			participantMap,
			eventManager,
			interaction.client,
			threadManager,
			voiceChannelManager,
			telemetry,
		);
		return;
	}

	eventManager.queueUpdate(messageId);
}

export async function handleJoinQueueButton(
	interaction: ButtonInteraction,
	eventManager: EventManager,
	telemetry?: TelemetryService,
) {
	try {
		const messageId = interaction.message.id;
		const userId = interaction.user.id;
		const participantMap = eventManager.getParticipants(messageId);
		const timerData = eventManager.getTimer(messageId);

		if (!participantMap || !timerData) return;

		await interaction.deferUpdate();

		if (participantMap.size < MAX_PARTICIPANTS) {
			await interaction.followUp({
				content: ERROR_MESSAGES.QUEUE_EVENT_NOT_FULL,
				flags: ['Ephemeral'],
			});
			return;
		}

		if (eventManager.isUserInQueue(messageId, userId)) {
			await interaction.followUp({
				content: ERROR_MESSAGES.QUEUE_ALREADY_IN_QUEUE,
				flags: ['Ephemeral'],
			});
			return;
		}

		if (eventManager.isUserInAnyEvent(userId)) {
			await interaction.followUp({
				content: ERROR_MESSAGES.QUEUE_ALREADY_PARTICIPATING,
				flags: ['Ephemeral'],
			});
			return;
		}

		eventManager.addToQueue(messageId, userId);

		eventManager.queueUpdate(messageId);

		const matchId = eventManager.getMatchId(messageId);
		telemetry?.trackUserJoinedQueue({
			guildId: interaction.guild?.id || 'unknown',
			eventId: messageId,
			userId: userId,
			participants: Array.from(participantMap.values()),
			channelId: interaction.channelId,
			matchId: matchId || 'unknown',
		});
	} catch (error) {
		handleError({
			reason: 'Error handling join queue button',
			severity: ErrorSeverity.MEDIUM,
			error,
			metadata: {
				userId: interaction.user.id,
				messageId: interaction.message.id,
			},
		});

		await safeReplyToInteraction(interaction, ERROR_MESSAGES.JOIN_QUEUE_ERROR);
	}
}

export async function handleLeaveQueueButton(
	interaction: ButtonInteraction,
	eventManager: EventManager,
	telemetry?: TelemetryService,
) {
	try {
		const messageId = interaction.message.id;
		const userId = interaction.user.id;
		const participantMap = eventManager.getParticipants(messageId);
		const timerData = eventManager.getTimer(messageId);

		if (!participantMap || !timerData) return;

		await interaction.deferUpdate();

		if (!eventManager.isUserInQueue(messageId, userId)) {
			await interaction.followUp({
				content: ERROR_MESSAGES.QUEUE_NOT_IN_QUEUE,
				flags: ['Ephemeral'],
			});
			return;
		}

		eventManager.removeFromQueue(messageId, userId);

		eventManager.queueUpdate(messageId);

		const matchId = eventManager.getMatchId(messageId);
		telemetry?.trackUserLeftQueue({
			guildId: interaction.guild?.id || 'unknown',
			eventId: messageId,
			userId: userId,
			participants: Array.from(participantMap.values()),
			channelId: interaction.channelId,
			matchId: matchId || 'unknown',
		});
	} catch (error) {
		handleError({
			reason: 'Error handling leave queue button',
			severity: ErrorSeverity.MEDIUM,
			error,
			metadata: {
				userId: interaction.user.id,
				messageId: interaction.message.id,
			},
		});

		await safeReplyToInteraction(interaction, ERROR_MESSAGES.LEAVE_QUEUE_ERROR);
	}
}

export async function handleSpectateButton(
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

		if (!participantMap) return;

		await interaction.deferUpdate();

		if (eventManager.isUserSpectating(messageId, userId)) {
			await interaction.followUp({
				content: ERROR_MESSAGES.SPECTATE_ALREADY_SPECTATING,
				flags: ['Ephemeral'],
			});
			return;
		}

		if (eventManager.isSpectatorsFull(messageId)) {
			await interaction.followUp({
				content: ERROR_MESSAGES.SPECTATE_FULL,
				flags: ['Ephemeral'],
			});
			return;
		}

		const matchId = eventManager.getMatchId(messageId);
		const telemetryData = {
			guildId: interaction.guild?.id || 'unknown',
			eventId: messageId,
			userId: userId,
			participants: Array.from(participantMap.values()),
			channelId: interaction.channelId,
			matchId: matchId || 'unknown',
		};

		eventManager.addSpectator(messageId, userId);

		if (participantMap.has(userId)) {
			eventManager.removeParticipant(messageId, userId);
			eventManager.queueUpdate(messageId);

			telemetry?.trackUserDropOut(telemetryData);
			telemetry?.trackUserStartedSpectating(telemetryData);
			return;
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

		eventManager.queueUpdate(messageId);

		telemetry?.trackUserStartedSpectating(telemetryData);
	} catch (error) {
		handleError({
			reason: 'Error handling spectate button',
			severity: ErrorSeverity.MEDIUM,
			error,
			metadata: {
				userId: interaction.user.id,
				messageId: interaction.message.id,
			},
		});

		await safeReplyToInteraction(interaction, ERROR_MESSAGES.SPECTATE_ERROR);
	}
}

export async function handleStopSpectatingButton(
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

		if (!eventManager.isUserSpectating(messageId, userId)) {
			await interaction.followUp({
				content: ERROR_MESSAGES.SPECTATE_NOT_SPECTATING,
				flags: ['Ephemeral'],
			});
			return;
		}

		eventManager.removeSpectator(messageId, userId);

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

		eventManager.queueUpdate(messageId);

		const matchId = eventManager.getMatchId(messageId);
		telemetry?.trackUserStoppedSpectating({
			guildId: interaction.guild?.id || 'unknown',
			eventId: messageId,
			userId: userId,
			participants: Array.from(participantMap.values()),
			channelId: interaction.channelId,
			matchId: matchId || 'unknown',
		});
	} catch (error) {
		handleError({
			reason: 'Error handling stop spectating button',
			severity: ErrorSeverity.MEDIUM,
			error,
			metadata: {
				userId: interaction.user.id,
				messageId: interaction.message.id,
			},
		});

		await safeReplyToInteraction(
			interaction,
			ERROR_MESSAGES.STOP_SPECTATE_ERROR,
		);
	}
}
