import { Client, GatewayIntentBits, REST, Routes } from 'discord.js';
import { cleanupEvent } from '../event/event-lifecycle.js';
import type { EventManager } from '../event/event-manager.js';
import type { ThreadManager } from '../managers/thread-manager.js';
import type { VoiceChannelManager } from '../managers/voice-channel-manager.js';
import { checkCommandPermissions, isUserAdmin } from '../utils/helpers.js';

export function createDiscordClient() {
	return new Client({
		intents: [
			GatewayIntentBits.Guilds,
			GatewayIntentBits.GuildMessages,
			GatewayIntentBits.GuildVoiceStates,
			GatewayIntentBits.MessageContent,
		],
		allowedMentions: { parse: ['roles'] },
	});
}

export async function loginClient(client: Client, botToken: string) {
	try {
		await client.login(botToken);
		console.log('Discord client logged in');
	} catch (error) {
		console.error('Failed to log in Discord client:', error);
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
		console.error('Client user not available for command registration');
		return;
	}

	try {
		await rest.put(Routes.applicationCommands(client.user.id), {
			body: commands,
		});
		console.log('Successfully registered application commands');
	} catch (error) {
		console.error('Failed to register application commands:', error);
		process.exit(1);
	}
}

export function setupErrorHandlers(client: Client) {
	client.on('error', (error) => {
		console.error('Discord client error:', error);
	});

	client.on('warn', (warning) => {
		console.warn('Discord client warning:', warning);
	});

	process.on('uncaughtException', (error) => {
		console.error('Uncaught Exception:', error);
	});

	process.on('unhandledRejection', (reason, promise) => {
		console.error('Unhandled Rejection at:', promise, 'reason:', reason);
	});
}

export function setupMessageDeletionHandler(client: Client) {
	client.on('messageCreate', async (message) => {
		if (message.author.bot || !message.guild) return;

		const hasPermission = await checkCommandPermissions(
			message.guild,
			message.channel.id,
		);

		if (!hasPermission) return;

		try {
			const member = message.member;
			if (!member) return;

			if (!isUserAdmin(member) && message.interactionMetadata?.type !== 2) {
				await message.delete();
			}
		} catch (error) {
			console.error('Error handling message deletion:', error);
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
			console.error(
				`Failed to cleanup event after message deletion ${message.id}:`,
				error,
			);
		}
	});
}
