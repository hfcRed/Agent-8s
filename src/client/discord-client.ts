import { Client, GatewayIntentBits, Partials, REST, Routes } from 'discord.js';
import { AUTHOR_ID } from '../constants.js';
import { cleanupEvent } from '../event/event-lifecycle.js';
import type { EventManager } from '../event/event-manager.js';
import type { ThreadManager } from '../managers/thread-manager.js';
import type { VoiceChannelManager } from '../managers/voice-channel-manager.js';
import type { TelemetryService } from '../telemetry/telemetry.js';
import { ErrorSeverity, handleError } from '../utils/error-handler.js';
import { botHasPermission, isUserAdmin } from '../utils/helpers.js';
import {
	HIGH_RETRY_OPTIONS,
	LOW_RETRY_OPTIONS,
	withRetry,
} from '../utils/retry.js';
import { gracefulShutdown } from './shutdown.js';

export function createDiscordClient() {
	return new Client({
		intents: [
			GatewayIntentBits.Guilds,
			GatewayIntentBits.GuildMessages,
			GatewayIntentBits.GuildVoiceStates,
			GatewayIntentBits.MessageContent,
			GatewayIntentBits.DirectMessages,
		],
		allowedMentions: { parse: ['roles', 'users', 'everyone'] },
		partials: [Partials.Channel],
	});
}

export async function loginClient(client: Client, botToken: string) {
	try {
		await withRetry(() => client.login(botToken), HIGH_RETRY_OPTIONS);
		console.log('Discord client logged in');
	} catch (error) {
		handleError({
			reason: 'Failed to log in Discord client',
			severity: ErrorSeverity.HIGH,
			error,
		});
		process.exit(1);
	}
}

export async function registerCommands(
	client: Client,
	botToken: string,
	commands: unknown[],
) {
	const rest = new REST({ version: '10' }).setToken(botToken);

	if (!client.user) {
		handleError({
			reason: 'Client user not available for command registration',
			severity: ErrorSeverity.HIGH,
			error: new Error('Client user is undefined'),
		});
		return;
	}

	const clientUserId = client.user.id;

	try {
		await withRetry(
			() =>
				rest.put(Routes.applicationCommands(clientUserId), {
					body: commands,
				}),
			HIGH_RETRY_OPTIONS,
		);
		console.log('Successfully registered application commands');
	} catch (error) {
		handleError({
			reason: 'Failed to register application commands',
			severity: ErrorSeverity.HIGH,
			error,
		});
		process.exit(1);
	}
}

export function setupErrorHandlers(client: Client) {
	client.on('error', (error) => {
		handleError({
			reason: 'Discord client error',
			severity: ErrorSeverity.HIGH,
			error,
		});
	});

	client.on('warn', (warning) => {
		handleError({
			reason: 'Discord client warning',
			severity: ErrorSeverity.MEDIUM,
			error: new Error(warning),
		});
	});

	process.on('uncaughtException', (error) => {
		handleError({
			reason: 'Uncaught exception in process',
			severity: ErrorSeverity.HIGH,
			error,
		});
	});

	process.on('unhandledRejection', (reason, promise) => {
		handleError({
			reason: 'Unhandled promise rejection',
			severity: ErrorSeverity.HIGH,
			error: reason,
			metadata: { promise: String(promise) },
		});
	});
}

export function setupMessageCreateHandler(
	client: Client,
	eventManager: EventManager,
	threadManager: ThreadManager,
	voiceChannelManager: VoiceChannelManager,
	telemetry?: TelemetryService,
) {
	const messageBatches = new Map();

	const bulkDeleteMessages = async (channelId: string) => {
		const batch = messageBatches.get(channelId);
		if (!batch || batch.messages.length === 0) return;

		const channel = client.channels.cache.get(channelId);
		if (!channel?.isTextBased() || channel.isDMBased()) return;

		try {
			await withRetry(
				() => channel.bulkDelete(batch.messages, true),
				LOW_RETRY_OPTIONS,
			);
		} catch (error) {
			handleError({
				reason: 'Failed to bulk delete messages',
				severity: ErrorSeverity.LOW,
				error,
				metadata: { channelId, messageCount: batch.messages.length },
			});
		} finally {
			messageBatches.delete(channelId);
		}
	};

	client.on('messageCreate', async (message) => {
		if (
			message.channel.isDMBased() &&
			message.author.id === AUTHOR_ID &&
			message.content.toLowerCase() === 'shutdown'
		) {
			await gracefulShutdown(
				'DM Shutdown Command',
				client,
				eventManager,
				threadManager,
				voiceChannelManager,
				telemetry,
			);
			process.exit(1);
		}

		if (
			message.author.bot ||
			!message.guild ||
			message.channel.isThread() ||
			!botHasPermission('ViewChannel', client, message.channel) ||
			!botHasPermission('ManageMessages', client, message.channel)
		)
			return;

		const member = message.member;
		if (!member) return;

		if (!isUserAdmin(member) && message.interactionMetadata?.type !== 2) {
			const channelId = message.channel.id;

			let batch = messageBatches.get(channelId);
			if (!batch) {
				batch = {
					messages: [],
					timeout: setTimeout(() => bulkDeleteMessages(channelId), 2000),
				};
				messageBatches.set(channelId, batch);
			}

			batch.messages.push(message.id);

			if (batch.messages.length >= 50) {
				clearTimeout(batch.timeout);
				await bulkDeleteMessages(channelId);
			}
		}
	});
}

export function setupEventMessageDeleteHandler(
	client: Client,
	eventManager: EventManager,
	threadManager: ThreadManager,
	voiceChannelManager: VoiceChannelManager,
) {
	client.on('messageDelete', async (message) => {
		if (!message.author?.bot || message.author.id !== client.user?.id) return;

		const eventData = eventManager.getParticipants(message.id);
		if (!eventData) return;

		try {
			await cleanupEvent(
				message.id,
				eventManager,
				client,
				threadManager,
				voiceChannelManager,
			);
		} catch (error) {
			handleError({
				reason: 'Failed to cleanup event after message deletion',
				severity: ErrorSeverity.MEDIUM,
				error,
				metadata: { messageId: message.id },
			});
		}
	});
}
