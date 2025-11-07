import {
	type Client,
	EmbedBuilder,
	type Guild,
	type Message,
	type TextChannel,
} from 'discord.js';
import { COLORS, MAX_PARTICIPANTS, STATUS_MESSAGES } from '../constants.js';
import { checkProcessingStates } from '../interactions/button-handlers.js';
import { threadManager } from '../managers/thread-manager.js';
import { voiceChannelManager } from '../managers/voice-channel-manager.js';
import type { TelemetryService } from '../telemetry/telemetry.js';
import type { ParticipantMap } from '../types.js';
import {
	createEventStartedButtons,
	createRoleSelectMenu,
	updateEmbedField,
} from '../utils/embed-utils.js';
import type { EventManager } from './event-manager.js';

export async function startEvent(
	message: Message,
	participantMap: ParticipantMap,
	eventManager: EventManager,
	appClient: Client,
	telemetry?: TelemetryService,
) {
	const timerData = eventManager.getTimer(message.id);
	if (!timerData || timerData.hasStarted) return;

	timerData.hasStarted = true;
	const matchId = eventManager.getMatchId(message.id);
	const shortId = matchId?.slice(0, 5);

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

	const channel = message.channel as TextChannel;

	const thread = await threadManager.createEventThread(
		channel,
		shortId || 'unknown',
	);

	if (thread) {
		await threadManager.sendAndPinEmbed(
			thread,
			EmbedBuilder.from(message.embeds[0]),
		);
		eventManager.setThread(message.id, thread.id);
	}

	const participants = Array.from(participantMap.values());

	if (thread) {
		await threadManager.addMembers(
			thread,
			participants.map((p) => p.userId),
		);
	}

	const voiceChannels = await voiceChannelManager.createEventVoiceChannels(
		message.guild as Guild,
		channel,
		participants.map((p) => p.userId),
		shortId || 'unknown',
		appClient,
	);

	eventManager.setVoiceChannels(message.id, voiceChannels);

	if (thread) {
		await threadManager.sendMessage(
			thread,
			`**Voice Channels Created**\n${voiceChannels.map((channelId) => `<#${channelId}>`).join('\n')}`,
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
) {
	if (eventManager.isProcessing(eventId, 'cleanup')) return;

	eventManager.setProcessing(eventId, 'cleanup');
	try {
		const threadId = eventManager.getThread(eventId);
		if (threadId) {
			for (const [_, channel] of appClient.channels.cache) {
				if (!channel.isTextBased() || channel.isDMBased() || channel.isThread())
					continue;

				try {
					const thread = await threadManager.fetchThread(
						channel as TextChannel,
						threadId,
					);
					if (thread) {
						await threadManager.lockAndArchive(thread);
						break;
					}
				} catch {}
			}
		}

		const voiceChannelIds = eventManager.getVoiceChannels(eventId);
		if (voiceChannelIds) {
			await voiceChannelManager.deleteChannels(appClient, voiceChannelIds);
		}

		eventManager.clearAllEventData(eventId);
	} finally {
		eventManager.clearProcessing(eventId, 'cleanup');
		eventManager.deleteProcessingStates(eventId);
	}
}

export async function cleanupStaleEvents(
	eventManager: EventManager,
	appClient: Client,
	telemetry?: TelemetryService,
) {
	const MAX_EVENT_LIFETIME = 24 * 60 * 60 * 1000;
	const now = Date.now();

	for (const [messageId, timerData] of eventManager.getAllTimers()) {
		if (now - timerData.startTime < MAX_EVENT_LIFETIME) continue;

		try {
			for (const [_, channel] of appClient.channels.cache) {
				if (!channel.isTextBased() || channel.isDMBased()) continue;

				try {
					const message = await channel.messages.fetch(messageId);

					const embed = EmbedBuilder.from(message.embeds[0]).setColor(
						COLORS.CANCELLED,
					);
					updateEmbedField(embed, 'Status', STATUS_MESSAGES.EXPIRED);

					await message.edit({ embeds: [embed], components: [] });

					const matchId = eventManager.getMatchId(messageId);
					const participants = eventManager.getParticipants(messageId);
					telemetry?.trackEventExpired({
						guildId: message.guild?.id || 'unknown',
						eventId: messageId,
						userId: appClient.user?.id || 'unknown',
						participants: Array.from((participants || new Map()).values()),
						channelId: message.channelId,
						matchId: matchId || 'unknown',
					});

					break;
				} catch (error) {
					console.error(
						`Failed to fetch message ${messageId} in channel ${channel.id}:`,
						error,
					);
				}
			}
		} catch (error) {
			console.error(`Failed to clean up stale event ${messageId}:`, error);
		} finally {
			await cleanupEvent(messageId, eventManager, appClient);
		}
	}
}

export async function createEventStartTimeout(
	message: Message,
	timeInMinutes: number,
	eventManager: EventManager,
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
		`⏳ <t:${Math.floor((Date.now() + timeInMinutes * 60 * 1000) / 1000)}:R>`,
	);
	await message.edit({ embeds: [embed] });

	const timeout = setTimeout(
		async () => {
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
						);
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
				console.error(
					`Error in timeout callback for event ${message.id}:`,
					error,
				);
			} finally {
				eventManager.deleteTimeout(message.id);
			}
		},
		timeInMinutes * 60 * 1000,
	);

	eventManager.setTimeout(message.id, timeout);
}
