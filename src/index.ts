import { GuildMember, SlashCommandBuilder } from 'discord.js';
import dotenv from 'dotenv';
import {
	createDiscordClient,
	loginClient,
	registerCommands,
	setupErrorHandlers,
	setupEventMessageDeleteHandler,
	setupMessageCreateHandler,
} from './client/discord-client.js';
import { isInShutdownMode, setupShutdownHandlers } from './client/shutdown.js';
import { handleCreateCommand } from './commands/create-command.js';
import { handleKickCommand } from './commands/kick-command.js';
import { handleRepingCommand } from './commands/reping-command.js';
import { handleStatusCommand } from './commands/status-command.js';
import { ERROR_MESSAGES, TIMINGS } from './constants.js';
import { cleanupStaleEvents } from './event/event-lifecycle.js';
import { EventManager } from './event/event-manager.js';
import {
	handleCancelButton,
	handleDropInButton,
	handleDropOutButton,
	handleFinishButton,
	handleJoinQueueButton,
	handleLeaveQueueButton,
	handleSignOutButton,
	handleSignUpButton,
	handleSpectateButton,
	handleStartNowButton,
	handleStopSpectatingButton,
} from './interactions/button-handlers.js';
import { handleRoleSelection } from './interactions/menu-handlers.js';
import { ThreadManager } from './managers/thread-manager.js';
import { VoiceChannelManager } from './managers/voice-channel-manager.js';
import { recordInteraction } from './telemetry/metrics.js';
import { initializeTelemetry } from './telemetry/telemetry.js';
import { ErrorSeverity, handleError } from './utils/error-handler.js';
import {
	botHasPermission,
	checkProcessingStates,
	safeReplyToInteraction,
} from './utils/helpers.js';

dotenv.config({ quiet: true });
const botToken = process.env.BOT_TOKEN;

if (!botToken) {
	handleError({
		reason: 'BOT_TOKEN not found in .env file',
		severity: ErrorSeverity.HIGH,
		error: new Error('BOT_TOKEN is undefined'),
	});
	process.exit(1);
}

const telemetryUrl = process.env.TELEMETRY_URL;
const telemetryToken = process.env.TELEMETRY_TOKEN;

const commands = [
	new SlashCommandBuilder()
		.setName('create')
		.setDescription('Create a new 8s event.')
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
		.addBooleanOption((option) =>
			option
				.setName('spectators')
				.setDescription('Whether to allow spectators for this event.')
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
	new SlashCommandBuilder()
		.setName('kick')
		.setDescription('Kick the selected user from your event.')
		.addUserOption((option) =>
			option.setName('user').setDescription('User to kick').setRequired(true),
		)
		.toJSON(),
];

const telemetry = initializeTelemetry(telemetryUrl, telemetryToken);
const threadManager = new ThreadManager();
const voiceChannelManager = new VoiceChannelManager();
const appClient = createDiscordClient();
const eventManager = new EventManager(appClient);
const lockedUsers = new Set<string>();

loginClient(appClient, botToken).then();

appClient.once('clientReady', async () => {
	await registerCommands(appClient, botToken, commands);
});

appClient.on('interactionCreate', async (interaction) => {
	if (!interaction.isRepliable()) return;

	const userId = interaction.user.id;

	try {
		if (isInShutdownMode()) {
			await interaction.reply({
				content: ERROR_MESSAGES.SHUTDOWN_WARNING,
				flags: ['Ephemeral'],
			});
			return;
		}

		const isValidInteraction =
			appClient.user &&
			interaction.guild &&
			interaction.channel &&
			!interaction.channel.isDMBased() &&
			interaction.member instanceof GuildMember &&
			botHasPermission('ViewChannel', appClient, interaction.channel);

		if (!isValidInteraction) {
			await interaction.reply({
				content: ERROR_MESSAGES.NO_BOT_PERMISSIONS,
				flags: ['Ephemeral'],
			});
			return;
		}

		if (lockedUsers.has(userId)) {
			await interaction.reply({
				content: ERROR_MESSAGES.ACTION_IN_PROGRESS,
				flags: ['Ephemeral'],
			});
			return;
		}

		lockedUsers.add(userId);

		recordInteraction(interaction.type.toString());

		if (interaction.isChatInputCommand()) {
			const commandHandlers: Record<string, () => Promise<void>> = {
				reping: () => handleRepingCommand(interaction, eventManager, telemetry),
				status: () => handleStatusCommand(interaction, eventManager, telemetry),
				create: () =>
					handleCreateCommand(
						interaction,
						eventManager,
						threadManager,
						voiceChannelManager,
						telemetry,
					),
				kick: () =>
					handleKickCommand(
						interaction,
						eventManager,
						threadManager,
						voiceChannelManager,
						telemetry,
					),
			};

			const handler =
				commandHandlers[interaction.commandName.replaceAll('-', '')];

			if (handler) await handler();
			return;
		}

		if (!interaction.isMessageComponent()) return;

		const messageId = interaction.message.id;
		if (!eventManager.getParticipants(messageId)) return;

		if (interaction.isButton()) {
			const isProcessing = await checkProcessingStates(
				messageId,
				eventManager,
				interaction,
			);
			if (isProcessing) return;

			const buttonHandlers: Record<string, () => Promise<void>> = {
				signup: () =>
					handleSignUpButton(
						interaction,
						eventManager,
						threadManager,
						voiceChannelManager,
						telemetry,
					),
				signout: () =>
					handleSignOutButton(
						interaction,
						eventManager,
						threadManager,
						voiceChannelManager,
						telemetry,
					),
				cancel: () =>
					handleCancelButton(
						interaction,
						eventManager,
						appClient,
						threadManager,
						voiceChannelManager,
						telemetry,
					),
				startnow: () =>
					handleStartNowButton(
						interaction,
						eventManager,
						appClient,
						threadManager,
						voiceChannelManager,
						telemetry,
					),
				finish: () =>
					handleFinishButton(
						interaction,
						eventManager,
						appClient,
						threadManager,
						voiceChannelManager,
						telemetry,
					),
				dropout: () =>
					handleDropOutButton(
						interaction,
						eventManager,
						appClient,
						threadManager,
						voiceChannelManager,
						telemetry,
					),
				dropin: () =>
					handleDropInButton(
						interaction,
						eventManager,
						appClient,
						threadManager,
						voiceChannelManager,
						telemetry,
					),
				joinqueue: () =>
					handleJoinQueueButton(interaction, eventManager, telemetry),
				leavequeue: () =>
					handleLeaveQueueButton(interaction, eventManager, telemetry),
				spectate: () =>
					handleSpectateButton(
						interaction,
						eventManager,
						appClient,
						threadManager,
						voiceChannelManager,
						telemetry,
					),
				stopspectating: () =>
					handleStopSpectatingButton(
						interaction,
						eventManager,
						appClient,
						threadManager,
						voiceChannelManager,
						telemetry,
					),
			};

			const handler = buttonHandlers[interaction.customId];
			if (handler) await handler();
		}

		if (interaction.isStringSelectMenu()) {
			await handleRoleSelection(interaction, eventManager);
		}
	} catch (error) {
		handleError({
			reason: 'Error processing interaction',
			severity: ErrorSeverity.MEDIUM,
			error,
			metadata: {
				interactionType: interaction.type,
				userId: interaction.user.id,
				guildId: interaction.guildId || 'unknown',
			},
		});

		await safeReplyToInteraction(interaction, ERROR_MESSAGES.UNEXPECTED_ERROR);
	} finally {
		lockedUsers.delete(userId);
	}
});

setupErrorHandlers(appClient);
setupMessageCreateHandler(
	appClient,
	eventManager,
	threadManager,
	voiceChannelManager,
	telemetry,
);
setupEventMessageDeleteHandler(
	appClient,
	eventManager,
	threadManager,
	voiceChannelManager,
);
setupShutdownHandlers(
	appClient,
	eventManager,
	threadManager,
	voiceChannelManager,
	telemetry,
);

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
