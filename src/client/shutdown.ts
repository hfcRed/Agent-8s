import type { Client } from 'discord.js';
import { AUTHOR_ID, TIMESTAMP, TIMINGS } from '../constants.js';
import { cleanupEvent } from '../event/event-lifecycle.js';
import type { EventManager } from '../event/event-manager.js';
import type { ThreadManager } from '../managers/thread-manager.js';
import type { VoiceChannelManager } from '../managers/voice-channel-manager.js';
import { stopMetricsServer } from '../telemetry/metrics.js';
import type { TelemetryService } from '../telemetry/telemetry.js';
import { ErrorSeverity, handleError } from '../utils/error-handler.js';
import { MEDIUM_RETRY_OPTIONS, withRetryOrNull } from '../utils/retry.js';

let isShuttingDown = false;
let hasRetried = false;

export function isInShutdownMode() {
	return isShuttingDown;
}

export async function gracefulShutdown(
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

	try {
		const allTimers = Array.from(eventManager.getAllTimers());
		console.log(`Found ${allTimers.length} active event(s) to clean up`);

		if (AUTHOR_ID) {
			const author = await withRetryOrNull(
				() => client.users.fetch(AUTHOR_ID as string),
				MEDIUM_RETRY_OPTIONS,
			);

			if (author) {
				await withRetryOrNull(
					() =>
						author.send(
							`----------------------------------\n⚠️ Bot shutdown initiated!\n\n**Reason:** ${signal}\n**Time:** ${TIMESTAMP.FULL(Date.now())}\n----------------------------------`,
						),
					MEDIUM_RETRY_OPTIONS,
				);
				await withRetryOrNull(
					() =>
						author.send(
							`⚠️ Found ${allTimers.length} active event(s) to clean up before shutdown`,
						),
					MEDIUM_RETRY_OPTIONS,
				);
			}
		}

		for (let i = 0; i < allTimers.length; i++) {
			const [eventId] = allTimers[i];

			const channelId = eventManager.getChannelId(eventId);

			console.log(
				`Updating event message ${i + 1}/${allTimers.length}: ${eventId}`,
			);
			if (channelId) {
				eventManager.setTerminalState(eventId, 'shutdown');
				eventManager.queueUpdate(eventId, true);
			}

			console.log(`Cleaning up event ${i + 1}/${allTimers.length}: ${eventId}`);
			await cleanupEvent(
				eventId,
				eventManager,
				client,
				threadManager,
				voiceChannelManager,
			);

			if (AUTHOR_ID) {
				const author = await withRetryOrNull(
					() => client.users.fetch(AUTHOR_ID as string),
					MEDIUM_RETRY_OPTIONS,
				);

				if (author) {
					await withRetryOrNull(
						() =>
							author.send(
								`✅ Cleaned up event ${i + 1}/${allTimers.length}: ${eventId}`,
							),
						MEDIUM_RETRY_OPTIONS,
					);
				}
			}

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
			const author = await withRetryOrNull(
				() => client.users.fetch(AUTHOR_ID as string),
				MEDIUM_RETRY_OPTIONS,
			);

			if (author) {
				await withRetryOrNull(
					() =>
						author.send(
							`----------------------------------\n✅ Bot shutdown complete - disconnecting\n\n**Time:** <t:${Math.floor(Date.now() / 1000)}:F>\n----------------------------------`,
						),
					MEDIUM_RETRY_OPTIONS,
				);
			}
		}

		console.log('Destroying Discord client...');
		client.destroy();
		console.log('Discord client destroyed');

		console.log('Graceful shutdown complete');
	} catch (error) {
		handleError({
			reason: 'Error during graceful shutdown',
			severity: ErrorSeverity.HIGH,
			error,
		});

		if (AUTHOR_ID) {
			const author = await withRetryOrNull(
				() => client.users.fetch(AUTHOR_ID as string),
				MEDIUM_RETRY_OPTIONS,
			);

			if (author) {
				const errorMessage =
					error instanceof Error ? error.message : String(error);
				await withRetryOrNull(
					() =>
						author.send(
							`----------------------------------\n❌ Error during bot shutdown\n\n**Error:** ${errorMessage}\n\n**Time:** ${TIMESTAMP.FULL(Date.now())}\n----------------------------------`,
						),
					MEDIUM_RETRY_OPTIONS,
				);
			}
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
			handleError({
				reason: `Fatal WebSocket error on shard ${shardId}`,
				severity: ErrorSeverity.HIGH,
				error: new Error(`WebSocket closed with code ${event.code}`),
				metadata: { shardId, code: event.code },
			});

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
