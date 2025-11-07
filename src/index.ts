import { GuildMember, SlashCommandBuilder } from 'discord.js';
import dotenv from 'dotenv';
import {
	createDiscordClient,
	loginClient,
	registerCommands,
	setupErrorHandlers,
	setupMessageDeletionHandler,
} from './client/discord-client.js';
import { handleCreateCommand } from './commands/create-command.js';
import { handleStatusCommand } from './commands/status-command.js';
import { cleanupStaleEvents } from './event/event-lifecycle.js';
import { EventManager } from './event/event-manager.js';
import {
	checkProcessingStates,
	handleCancelButton,
	handleFinishButton,
	handleSignOutButton,
	handleSignUpButton,
	handleStartNowButton,
} from './interactions/button-handlers.js';
import { handleRoleSelection } from './interactions/menu-handlers.js';
import { initializeTelemetry } from './telemetry/telemetry.js';

dotenv.config();
const botToken = process.env.BOT_TOKEN;

if (!botToken) {
	console.error('BOT_TOKEN not found in .env file');
	process.exit(1);
}

const telemetryUrl = process.env.TELEMETRY_URL;
const telemetryToken = process.env.TELEMETRY_TOKEN;

const telemetry = initializeTelemetry(telemetryUrl, telemetryToken);
const eventManager = new EventManager();
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
		.setDescription('Display bot status and statistics')
		.toJSON(),
];

appClient.once('clientReady', async () => {
	await registerCommands(appClient, botToken, commands);
});

appClient.on('interactionCreate', async (interaction) => {
	if (
		!interaction.guild ||
		!interaction.member ||
		!(interaction.member instanceof GuildMember)
	)
		return;

	try {
		if (
			interaction.isChatInputCommand() &&
			interaction.commandName === 'create'
		) {
			await handleCreateCommand(interaction, eventManager, telemetry);
			return;
		}

		if (
			interaction.isChatInputCommand() &&
			interaction.commandName === 'status'
		) {
			await handleStatusCommand(interaction, eventManager, telemetry);
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
					await handleSignUpButton(interaction, eventManager, telemetry);
					break;
				case 'signout':
					await handleSignOutButton(interaction, eventManager, telemetry);
					break;
				case 'cancel':
					await handleCancelButton(
						interaction,
						eventManager,
						appClient,
						telemetry,
					);
					break;
				case 'startnow':
					await handleStartNowButton(
						interaction,
						eventManager,
						appClient,
						telemetry,
					);
					break;
				case 'finish':
					await handleFinishButton(
						interaction,
						eventManager,
						appClient,
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
setupErrorHandlers(appClient);

setInterval(
	() => cleanupStaleEvents(eventManager, appClient, telemetry),
	60 * 60 * 1000,
);
