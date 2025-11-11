import type { Client } from 'discord.js';
import { EmbedBuilder } from 'discord.js';
import { AUTHOR_ID, COLORS, STATUS_MESSAGES, TIMINGS } from '../constants.js';
import { cleanupEvent } from '../event/event-lifecycle.js';
import type { EventManager } from '../event/event-manager.js';
import type { ThreadManager } from '../managers/thread-manager.js';
import type { VoiceChannelManager } from '../managers/voice-channel-manager.js';
import { stopMetricsServer } from '../telemetry/metrics.js';
import type { TelemetryService } from '../telemetry/telemetry.js';
import { updateEmbedField } from '../utils/embed-utils.js';

let isShuttingDown = false;
let hasRetried = false;

export function isInShutdownMode() {
	return isShuttingDown;
}

async function gracefulShutdown(
	signal: string,
	client: Client,
	eventManager: EventManager,
	threadManager: ThreadManager,
	voiceChannelManager: VoiceChannelManager,
	telemetry?: TelemetryService,
) {
	if (isShuttingDown) {
		console.log('Shutdown already in progress...');
		return;
	}

	isShuttingDown = true;
	console.log(`Received ${signal}, starting graceful shutdown...`);

	if (AUTHOR_ID) {
		const author = await client.users.fetch(AUTHOR_ID);
		await author.send(
			`----------------------------------\n⚠️ Bot shutdown initiated!\n\n**Reason:** ${signal}\n**Time:** <t:${Math.floor(Date.now() / 1000)}:F>\n----------------------------------`,
		);
	}

	try {
		const allTimers = Array.from(eventManager.getAllTimers());
		console.log(`Found ${allTimers.length} active event(s) to clean up`);

		for (let i = 0; i < allTimers.length; i++) {
			const [eventId] = allTimers[i];

			const channelId = eventManager.getChannelId(eventId);
			let isFinalizing = false;

			if (channelId) {
				const channel = await client.channels.fetch(channelId);

				if (channel?.isTextBased() && !channel.isDMBased()) {
					const message = await channel.messages.fetch(eventId);
					isFinalizing = eventManager.isEventFinalizing(message);
				}
			}

			if (isFinalizing) {
				const waitTime =
					TIMINGS.EVENT_START_DELAY_MINUTES * TIMINGS.MINUTE_IN_MS * 2;
				console.log(
					`Event ${eventId} is finalizing, waiting ${waitTime}ms before cleanup...`,
				);

				await new Promise((resolve) => setTimeout(resolve, waitTime));
			}

			console.log(
				`Updating event message ${i + 1}/${allTimers.length}: ${eventId}`,
			);
			if (channelId) {
				const channel = await client.channels.fetch(channelId);

				if (channel?.isTextBased() && !channel.isDMBased()) {
					const message = await channel.messages.fetch(eventId);
					const embed = EmbedBuilder.from(message.embeds[0]).setColor(
						COLORS.CANCELLED,
					);

					updateEmbedField(embed, 'Status', STATUS_MESSAGES.SHUTDOWN);
					await message.edit({ embeds: [embed], components: [] });
				}
			}

			console.log(`Cleaning up event ${i + 1}/${allTimers.length}: ${eventId}`);
			await cleanupEvent(
				eventId,
				eventManager,
				client,
				threadManager,
				voiceChannelManager,
			);

			// Timeout to avoid Discord rate limits
			if (i < allTimers.length - 1) {
				console.log(
					`Waiting ${TIMINGS.SHUTDOWN_EVENT_CLEANUP_DELAY_MS}ms before next cleanup...`,
				);
				await new Promise((resolve) =>
					setTimeout(resolve, TIMINGS.SHUTDOWN_EVENT_CLEANUP_DELAY_MS),
				);
			}
		}
		console.log('All events cleaned up');

		if (telemetry) {
			console.log('Closing telemetry connections...');
			await telemetry.dispose();
			console.log('Telemetry connections closed');
		}

		console.log('Stopping metrics server...');
		await stopMetricsServer();
		console.log('Metrics server stopped');

		if (AUTHOR_ID) {
			const author = await client.users.fetch(AUTHOR_ID);
			await author.send(
				`----------------------------------\n✅ Bot shutdown complete - disconnecting now\n\n**Time:** <t:${Math.floor(Date.now() / 1000)}:F>\n----------------------------------`,
			);
		}

		console.log('Destroying Discord client...');
		client.destroy();
		console.log('Discord client destroyed');

		console.log('Graceful shutdown complete');
	} catch (error) {
		console.error('Error during graceful shutdown:', error);

		if (AUTHOR_ID) {
			const author = await client.users.fetch(AUTHOR_ID);
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			await author.send(
				`----------------------------------\n❌ Error during bot shutdown\n\n**Error:** ${errorMessage}\n\n**Time:** <t:${Math.floor(Date.now() / 1000)}:F>\n----------------------------------`,
			);
		}

		if (!hasRetried) {
			console.log('Retrying graceful shutdown...');

			hasRetried = true;
			await gracefulShutdown(
				signal,
				client,
				eventManager,
				threadManager,
				voiceChannelManager,
				telemetry,
			);
		} else {
			throw error;
		}
	}
}

export function setupShutdownHandlers(
	client: Client,
	eventManager: EventManager,
	threadManager: ThreadManager,
	voiceChannelManager: VoiceChannelManager,
	telemetry?: TelemetryService,
) {
	process.on(
		'SIGINT',
		async () =>
			await gracefulShutdown(
				'SIGINT',
				client,
				eventManager,
				threadManager,
				voiceChannelManager,
				telemetry,
			),
	);
	process.on(
		'SIGTERM',
		async () =>
			await gracefulShutdown(
				'SIGTERM',
				client,
				eventManager,
				threadManager,
				voiceChannelManager,
				telemetry,
			),
	);

	client.on('shardDisconnect', async (event, shardId) => {
		if (
			event.code === 4004 ||
			event.code === 4010 ||
			event.code === 4011 ||
			event.code === 4014
		) {
			console.error(`Fatal WebSocket error on shard ${shardId}:`, event);
			await gracefulShutdown(
				'shardDisconnect',
				client,
				eventManager,
				threadManager,
				voiceChannelManager,
				telemetry,
			);
			process.exit(1);
		}
	});
}
