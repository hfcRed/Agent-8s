import {
	ChannelType,
	type Client,
	EmbedBuilder,
	type Guild,
	type Message,
	OverwriteType,
	PermissionFlagsBits,
	type TextChannel,
} from 'discord.js';
import { COLORS, MAX_PARTICIPANTS, STATUS_MESSAGES } from '../constants.js';
import { checkProcessingStates } from '../interactions/button-handlers.js';
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
	let thread = null;
	try {
		const createdThread = await channel.threads.create({
			name: `8s Event - ${shortId}`,
			autoArchiveDuration: 60,
			type: ChannelType.PrivateThread,
		});

		const startMessage = await createdThread.send({
			embeds: [EmbedBuilder.from(message.embeds[0])],
		});
		await startMessage.pin();

		eventManager.setThread(message.id, createdThread.id);
		thread = createdThread;
	} catch (error) {
		console.error('Failed to create or send message to thread:', error);
	}

	const participants = Array.from(participantMap.values());

	if (thread) {
		for (const participant of participants) {
			try {
				await thread.members.add(participant.userId);
			} catch (error) {
				console.error(
					`Failed to add participant ${participant.userId} to thread:`,
					error,
				);
			}
		}
	}

	const voiceChannels = await createVoiceChannels(
		message.guild as Guild,
		channel,
		participants,
		shortId || 'unknown',
		appClient,
	);

	eventManager.setVoiceChannels(message.id, voiceChannels);

	if (thread) {
		try {
			await thread.send({
				content: `**Voice Channels Created**\n${voiceChannels.map((channelId) => `<#${channelId}>`).join('\n')}`,
			});
		} catch (error) {
			console.error('Failed to send voice channel info to thread:', error);
		}
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

async function createVoiceChannels(
	guild: Guild,
	channel: TextChannel,
	participants: Array<{ userId: string; role: string; rank: string | null }>,
	shortId: string,
	appClient: Client,
) {
	const voiceNames = ['👥 Group', '🔵 Team A', '🔴 Team B'];
	const voiceChannels: string[] = [];

	for (let i = 1; i <= 3; i++) {
		try {
			const voiceChannel = await guild.channels.create({
				name: `${voiceNames[i - 1]} - ${shortId}`,
				type: ChannelType.GuildVoice,
				parent: channel.parent,
				permissionOverwrites: [
					{
						id: guild.roles.everyone.id,
						deny: [
							PermissionFlagsBits.Connect,
							PermissionFlagsBits.ViewChannel,
						],
						type: OverwriteType.Role,
					},
					{
						id: appClient.user?.id || '',
						allow: [
							PermissionFlagsBits.Connect,
							PermissionFlagsBits.ViewChannel,
							PermissionFlagsBits.ManageChannels,
						],
						type: OverwriteType.Member,
					},
					...participants.map((participant) => ({
						id: participant.userId,
						allow: [
							PermissionFlagsBits.Connect,
							PermissionFlagsBits.ViewChannel,
							PermissionFlagsBits.Speak,
						],
						type: OverwriteType.Member,
					})),
				],
			});

			voiceChannels.push(voiceChannel.id);
		} catch (error) {
			console.error(
				`Failed to create voice channel ${voiceNames[i - 1]}:`,
				error,
			);
		}
	}

	return voiceChannels;
}

export async function cleanupEvent(
	eventId: string,
	eventManager: EventManager,
	appClient: Client,
) {
	if (eventManager.isProcessing(eventId, 'cleanup')) return;

	eventManager.setProcessing(eventId, 'cleanup');
	try {
		const voiceChannelIds = eventManager.getVoiceChannels(eventId);
		if (voiceChannelIds) {
			for (const channelId of voiceChannelIds) {
				try {
					const channel = await appClient.channels.fetch(channelId);
					if (channel?.isVoiceBased()) {
						await channel.delete();
					}
				} catch (error) {
					console.error(`Failed to delete voice channel ${channelId}:`, error);
				}
			}
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

					const threadId = eventManager.getThread(messageId);
					if (threadId && channel.isThread() === false) {
						try {
							const thread = await (channel as TextChannel).threads.fetch(
								threadId,
							);
							if (thread) {
								await thread.setLocked(true);
								await thread.setArchived(true);
							}
						} catch (threadError) {
							console.error(
								`Failed to manage thread ${threadId}:`,
								threadError,
							);
						}
					}

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
