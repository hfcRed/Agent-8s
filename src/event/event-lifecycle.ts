import {
	type Client,
	EmbedBuilder,
	type Guild,
	type Message,
	type TextChannel,
} from 'discord.js';
import {
	COLORS,
	MAX_PARTICIPANTS,
	STATUS_MESSAGES,
	TIMINGS,
} from '../constants.js';
import { checkProcessingStates } from '../interactions/button-handlers.js';
import type { ThreadManager } from '../managers/thread-manager.js';
import type { VoiceChannelManager } from '../managers/voice-channel-manager.js';
import type { TelemetryService } from '../telemetry/telemetry.js';
import type { ParticipantMap } from '../types.js';
import {
	createEventStartedButtons,
	createRoleSelectMenu,
	updateEmbedField,
} from '../utils/embed-utils.js';
import { ErrorSeverity, handleError } from '../utils/error-handler.js';
import type { EventManager } from './event-manager.js';

export async function startEvent(
	message: Message,
	participantMap: ParticipantMap,
	eventManager: EventManager,
	appClient: Client,
	threadManager: ThreadManager,
	voiceChannelManager: VoiceChannelManager,
	telemetry?: TelemetryService,
) {
	const timerData = eventManager.getTimer(message.id);
	if (!timerData || timerData.hasStarted) return;

	timerData.hasStarted = true;
	const matchId = eventManager.getMatchId(message.id);
	const shortId = matchId?.slice(0, 5);

	await eventManager.deleteRepingMessageIfExists(message.id, appClient);

	const timeout = eventManager.getTimeout(message.id);
	if (timeout) {
		clearTimeout(timeout);
		eventManager.deleteTimeout(message.id);
	}

	const embed = EmbedBuilder.from(message.embeds[0]).setColor(COLORS.STARTED);

	updateEmbedField(embed, 'Status', STATUS_MESSAGES.STARTED);
	updateEmbedField(embed, 'Start', `⏳ <t:${Math.floor(Date.now() / 1000)}:R>`);

	const buttonRow = createEventStartedButtons();
	const selectRow = createRoleSelectMenu();

	await message.edit({ embeds: [embed], components: [buttonRow, selectRow] });

	const participants = Array.from(participantMap.values());
	const channel = message.channel as TextChannel;
	const thread = await threadManager.createEventThread(
		channel,
		shortId || 'unknown',
	);

	const voiceChannels = await voiceChannelManager.createEventVoiceChannels(
		message.guild as Guild,
		channel,
		participants.map((p) => p.userId),
		shortId || 'unknown',
		appClient,
	);
	eventManager.setVoiceChannels(message.id, voiceChannels);

	if (thread) {
		eventManager.setThread(message.id, thread.id);

		await threadManager.sendAndPinEmbed(
			thread,
			EmbedBuilder.from(message.embeds[0]),
		);

		await threadManager.sendMessage(
			thread,
			`**Voice Channels Created**\n\n${voiceChannels.map((channelId) => `<#${channelId}>`).join('\n')}`,
		);

		await threadManager.addMembers(
			thread,
			participants.map((p) => p.userId),
		);
	}

	telemetry?.trackEventStarted({
		guildId: message.guild?.id || 'unknown',
		eventId: message.id,
		userId: eventManager.getCreator(message.id) || 'unknown',
		participants: participants,
		channelId: message.channelId,
		matchId: matchId || 'unknown',
	});
}

export async function cleanupEvent(
	eventId: string,
	eventManager: EventManager,
	appClient: Client,
	threadManager: ThreadManager,
	voiceChannelManager: VoiceChannelManager,
) {
	if (eventManager.isProcessing(eventId, 'cleanup')) return;

	eventManager.setProcessing(eventId, 'cleanup');
	try {
		await eventManager.deleteRepingMessageIfExists(eventId, appClient);

		const threadId = eventManager.getThread(eventId);
		const channelId = eventManager.getChannelId(eventId);

		if (threadId && channelId) {
			try {
				const channel = await appClient.channels.fetch(channelId);

				if (channel?.isTextBased() && !channel.isDMBased()) {
					const thread = await threadManager.fetchThread(
						channel as TextChannel,
						threadId,
					);

					if (thread) {
						await threadManager.lockAndArchive(thread);
					}
				}
			} catch (error) {
				handleError({
					reason: 'Failed to fetch and archive thread during cleanup',
					severity: ErrorSeverity.LOW,
					error,
					metadata: { threadId, channelId, eventId },
				});
			}
		}

		const voiceChannelIds = eventManager.getVoiceChannels(eventId);
		if (voiceChannelIds) {
			await voiceChannelManager.deleteChannels(appClient, voiceChannelIds);
		}

		eventManager.clearAllEventData(eventId);
	} catch (error) {
		handleError({
			reason: 'Failed to cleanup event',
			severity: ErrorSeverity.MEDIUM,
			error,
			metadata: { eventId },
		});
	} finally {
		eventManager.clearProcessing(eventId, 'cleanup');
		eventManager.deleteProcessingStates(eventId);
	}
}

export async function cleanupStaleEvents(
	eventManager: EventManager,
	appClient: Client,
	threadManager: ThreadManager,
	voiceChannelManager: VoiceChannelManager,
	telemetry?: TelemetryService,
) {
	const MAX_EVENT_LIFETIME = TIMINGS.DAY_IN_MS;
	const now = Date.now();

	for (const [messageId, timerData] of eventManager.getAllTimers()) {
		if (now - timerData.startTime < MAX_EVENT_LIFETIME) continue;

		try {
			const channelId = eventManager.getChannelId(messageId);
			const guildId = eventManager.getGuildId(messageId);

			let message: Message | null = null;

			if (channelId) {
				try {
					const channel = await appClient.channels.fetch(channelId);
					if (channel?.isTextBased() && !channel.isDMBased()) {
						message = await channel.messages.fetch(messageId);
					}
				} catch (error) {
					handleError({
						reason: 'Failed to fetch stale event message',
						severity: ErrorSeverity.LOW,
						error,
						metadata: { messageId, channelId },
					});
				}
			}
			if (message) {
				const embed = EmbedBuilder.from(message.embeds[0]).setColor(
					COLORS.CANCELLED,
				);
				updateEmbedField(embed, 'Status', STATUS_MESSAGES.EXPIRED);

				await message.edit({ embeds: [embed], components: [] });

				const matchId = eventManager.getMatchId(messageId);
				const participants = eventManager.getParticipants(messageId);

				telemetry?.trackEventExpired({
					guildId: guildId || message.guild?.id || 'unknown',
					eventId: messageId,
					userId: appClient.user?.id || 'unknown',
					participants: Array.from((participants || new Map()).values()),
					channelId: message.channelId,
					matchId: matchId || 'unknown',
				});
			}
		} catch (error) {
			handleError({
				reason: `Failed to process stale event ${messageId}`,
				severity: ErrorSeverity.LOW,
				error,
				metadata: { messageId },
			});
		} finally {
			await cleanupEvent(
				messageId,
				eventManager,
				appClient,
				threadManager,
				voiceChannelManager,
			);
		}
	}
}

export async function createEventStartTimeout(
	message: Message,
	timeInMinutes: number,
	eventManager: EventManager,
	threadManager: ThreadManager,
	voiceChannelManager: VoiceChannelManager,
	telemetry?: TelemetryService,
) {
	const existingTimeout = eventManager.getTimeout(message.id);
	if (existingTimeout) {
		clearTimeout(existingTimeout);
		eventManager.deleteTimeout(message.id);
	}

	const embed = EmbedBuilder.from(message.embeds[0]);
	updateEmbedField(
		embed,
		'Start',
		`⏳ <t:${Math.floor((Date.now() + timeInMinutes * TIMINGS.MINUTE_IN_MS) / 1000)}:R>`,
	);
	await message.edit({ embeds: [embed] });

	const timeout = setTimeout(async () => {
		try {
			const currentParticipantMap = eventManager.getParticipants(message.id);
			const timerData = eventManager.getTimer(message.id);

			if (!currentParticipantMap || !timerData || timerData.hasStarted) {
				eventManager.deleteTimeout(message.id);
				return;
			}

			if (
				currentParticipantMap.size === MAX_PARTICIPANTS &&
				!(await checkProcessingStates(message.id, eventManager))
			) {
				eventManager.setProcessing(message.id, 'starting');
				try {
					await startEvent(
						message,
						currentParticipantMap,
						eventManager,
						message.client,
						threadManager,
						voiceChannelManager,
						telemetry,
					);
				} catch (error) {
					handleError({
						reason: 'Failed to start event from timeout',
						severity: ErrorSeverity.MEDIUM,
						error,
						metadata: { messageId: message.id },
					});
				} finally {
					eventManager.clearProcessing(message.id, 'starting');
				}
			} else {
				const embed = EmbedBuilder.from(message.embeds[0]);
				embed.setColor(COLORS.OPEN);

				updateEmbedField(embed, 'Start', '👥 When 8 players have signed up');
				updateEmbedField(embed, 'Status', STATUS_MESSAGES.OPEN);

				await message.edit({ embeds: [embed] });
			}
		} catch (error) {
			handleError({
				reason: 'Failed to process event start timeout',
				severity: ErrorSeverity.MEDIUM,
				error,
				metadata: { messageId: message.id },
			});
		} finally {
			eventManager.deleteTimeout(message.id);
		}
	}, timeInMinutes * TIMINGS.MINUTE_IN_MS);

	eventManager.setTimeout(message.id, timeout);
}
