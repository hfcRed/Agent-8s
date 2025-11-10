import { GuildMember, SlashCommandBuilder } from 'discord.js';
import dotenv from 'dotenv';
import {
	createDiscordClient,
	loginClient,
	registerCommands,
	setupErrorHandlers,
	setupEventMessageDeleteHandler,
	setupMessageDeletionHandler,
} from './client/discord-client.js';
import { handleCreateCommand } from './commands/create-command.js';
import { handleRepingCommand } from './commands/reping-command.js';
import { handleStatusCommand } from './commands/status-command.js';
import { ERROR_MESSAGES, TIMINGS } from './constants.js';
import { cleanupStaleEvents } from './event/event-lifecycle.js';
import { EventManager } from './event/event-manager.js';
import {
	checkProcessingStates,
	handleCancelButton,
	handleDropInButton,
	handleDropOutButton,
	handleFinishButton,
	handleSignOutButton,
	handleSignUpButton,
	handleStartNowButton,
} from './interactions/button-handlers.js';
import { handleRoleSelection } from './interactions/menu-handlers.js';
import { ThreadManager } from './managers/thread-manager.js';
import { VoiceChannelManager } from './managers/voice-channel-manager.js';
import { initializeTelemetry } from './telemetry/telemetry.js';
import { botHasPermission } from './utils/helpers.js';

dotenv.config({ quiet: true });
const botToken = process.env.BOT_TOKEN;

if (!botToken) {
	console.error('BOT_TOKEN not found in .env file');
	process.exit(1);
}

const telemetryUrl = process.env.TELEMETRY_URL;
const telemetryToken = process.env.TELEMETRY_TOKEN;

const telemetry = initializeTelemetry(telemetryUrl, telemetryToken);
const eventManager = new EventManager();
const threadManager = new ThreadManager();
const voiceChannelManager = new VoiceChannelManager();
const appClient = createDiscordClient();

loginClient(appClient, botToken).then();

const commands = [
	new SlashCommandBuilder()
		.setName('create')
		.setDescription('Create a new 8s event')
		.addIntegerOption((option) =>
			option
				.setName('time')
				.setDescription(
					'Time in minutes before the event starts. If not specified, event starts when 8 players sign up.',
				)
				.setRequired(false)
				.setMinValue(1),
		)
		.addBooleanOption((option) =>
			option
				.setName('casual')
				.setDescription('Whether to ping casual roles.')
				.setRequired(false),
		)
		.addStringOption((option) =>
			option
				.setName('info')
				.setDescription('Add a description to the event.')
				.setRequired(false),
		)
		.toJSON(),
	new SlashCommandBuilder()
		.setName('status')
		.setDescription('Display bot status and statistics.')
		.toJSON(),
	new SlashCommandBuilder()
		.setName('re-ping')
		.setDescription('Re-ping the roles for your event.')
		.toJSON(),
];

appClient.once('clientReady', async () => {
	await registerCommands(appClient, botToken, commands);
});

appClient.on('interactionCreate', async (interaction) => {
	const channel = interaction.channel;
	const bot = appClient.user?.id;

	const permitted = !!(
		interaction.guild &&
		interaction.member &&
		interaction.member instanceof GuildMember &&
		channel &&
		bot &&
		!channel.isDMBased() &&
		channel.permissionsFor(bot)?.has('ViewChannel')
	);

	if (
		!permitted &&
		(interaction.isMessageComponent() || interaction.isChatInputCommand())
	) {
		await interaction.reply({
			content: ERROR_MESSAGES.NO_BOT_PERMISSIONS,
			flags: ['Ephemeral'],
		});
		return;
	}

	try {
		if (
			interaction.guild &&
			interaction.isChatInputCommand() &&
			!botHasPermission('ViewChannel', appClient, interaction.channel)
		) {
			await interaction.reply({
				content: ERROR_MESSAGES.NO_BOT_PERMISSIONS,
				flags: ['Ephemeral'],
			});
			return;
		}

		if (
			interaction.isChatInputCommand() &&
			interaction.commandName === 'create'
		) {
			await handleCreateCommand(
				interaction,
				eventManager,
				threadManager,
				voiceChannelManager,
				telemetry,
			);
			return;
		}

		if (
			interaction.isChatInputCommand() &&
			interaction.commandName === 'status'
		) {
			await handleStatusCommand(interaction, eventManager, telemetry);
			return;
		}

		if (
			interaction.isChatInputCommand() &&
			interaction.commandName === 're-ping'
		) {
			await handleRepingCommand(interaction, eventManager);
			return;
		}

		if (!interaction.isMessageComponent()) return;

		const messageId = interaction.message.id;
		const participantMap = eventManager.getParticipants(messageId);

		if (!participantMap) return;

		if (interaction.isButton()) {
			const isProcessing = await checkProcessingStates(
				messageId,
				eventManager,
				interaction,
			);

			if (isProcessing) return;

			switch (interaction.customId) {
				case 'signup':
					await handleSignUpButton(
						interaction,
						eventManager,
						threadManager,
						voiceChannelManager,
						telemetry,
					);
					break;
				case 'signout':
					await handleSignOutButton(
						interaction,
						eventManager,
						threadManager,
						voiceChannelManager,
						telemetry,
					);
					break;
				case 'cancel':
					await handleCancelButton(
						interaction,
						eventManager,
						appClient,
						threadManager,
						voiceChannelManager,
						telemetry,
					);
					break;
				case 'startnow':
					await handleStartNowButton(
						interaction,
						eventManager,
						appClient,
						threadManager,
						voiceChannelManager,
						telemetry,
					);
					break;
				case 'finish':
					await handleFinishButton(
						interaction,
						eventManager,
						appClient,
						threadManager,
						voiceChannelManager,
						telemetry,
					);
					break;
				case 'dropout':
					await handleDropOutButton(
						interaction,
						eventManager,
						appClient,
						threadManager,
						voiceChannelManager,
						telemetry,
					);
					break;
				case 'dropin':
					await handleDropInButton(
						interaction,
						eventManager,
						appClient,
						threadManager,
						voiceChannelManager,
						telemetry,
					);
					break;
			}
		}

		if (interaction.isStringSelectMenu()) {
			await handleRoleSelection(interaction, eventManager);
		}
	} catch (error) {
		console.error(error);

		try {
			if (
				interaction.isRepliable() &&
				!interaction.replied &&
				!interaction.deferred
			) {
				await interaction.reply({
					content: 'An error occurred while processing your request.',
					flags: ['Ephemeral'],
				});
			} else if (
				interaction.isRepliable() &&
				(interaction.replied || interaction.deferred)
			) {
				await interaction.followUp({
					content: 'An error occurred while processing your request.',
					flags: ['Ephemeral'],
				});
			}
		} catch (replyError) {
			console.error('Failed to send error message to user:', replyError);
		}
	}
});

setupMessageDeletionHandler(appClient);
setupEventMessageDeleteHandler(
	appClient,
	eventManager,
	threadManager,
	voiceChannelManager,
);
setupErrorHandlers(appClient);

setInterval(
	() =>
		cleanupStaleEvents(
			eventManager,
			appClient,
			threadManager,
			voiceChannelManager,
			telemetry,
		),
	TIMINGS.HOUR_IN_MS,
);
