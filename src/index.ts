import { randomUUID } from 'node:crypto';
import {
	ActionRowBuilder,
	ButtonBuilder,
	type ButtonInteraction,
	ButtonStyle,
	ChannelType,
	type ChatInputCommandInteraction,
	Client,
	EmbedBuilder,
	GatewayIntentBits,
	type Message,
	REST,
	Routes,
	SlashCommandBuilder,
	StringSelectMenuBuilder,
	type StringSelectMenuInteraction,
	StringSelectMenuOptionBuilder,
	type TextChannel,
} from 'discord.js';
import dotenv from 'dotenv';
import {
	COLORS,
	ERROR_MESSAGES,
	MAX_PARTICIPANTS,
	PING_ROLE_NAMES,
	STATUS_MESSAGES,
} from './constants.js';
import { EventRecorder } from './event-recorder.js';
import { TelemetryService } from './telemetry.js';
import type { EventTimer, ParticipantMap } from './types.js';

/**
 * Discord bot entry point that registers slash commands, tracks event state,
 * and routes user interactions to the appropriate handlers.
 */
const parsed = dotenv.config();
const botToken = parsed.parsed?.BOT_TOKEN ?? process.env.BOT_TOKEN;
const telemetryUrl = parsed.parsed?.TELEMETRY_URL ?? process.env.TELEMETRY_URL;
const telemetryToken =
	parsed.parsed?.TELEMETRY_TOKEN ?? process.env.TELEMETRY_TOKEN;
const databaseUrl = parsed.parsed?.DATABASE_URL ?? process.env.DATABASE_URL;
const databaseSchema =
	parsed.parsed?.DATABASE_SCHEMA ?? process.env.DATABASE_SCHEMA;
const telemetryEventsTable =
	parsed.parsed?.TELEMETRY_EVENTS_TABLE ?? process.env.TELEMETRY_EVENTS_TABLE;

if (!botToken) {
	console.error('BOT_TOKEN not found in .env file');
	process.exit(1);
}

/**
 * Optional telemetry client used to forward interaction lifecycle metrics.
 */
const eventRecorder = databaseUrl
	? new EventRecorder(databaseUrl, {
			schema: databaseSchema,
			table: telemetryEventsTable,
		})
	: null;
const telemetry =
	telemetryUrl && telemetryToken
		? new TelemetryService(
				telemetryUrl,
				telemetryToken,
				eventRecorder ?? undefined,
			)
		: eventRecorder
			? new TelemetryService(null, null, eventRecorder)
			: null;

eventRecorder
	?.initialize()
	.catch((error) =>
		console.error('Failed to prepare telemetry persistence', error),
	);

/**
 * Slash command definitions registered with the Discord API at startup.
 */
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
		.toJSON(),
];

const rest = new REST({ version: '10' }).setToken(botToken);

const client = new Client({
	intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
	allowedMentions: { parse: ['roles'] },
});

/**
 * Registers slash commands with Discord as soon as the bot client is ready.
 */
client.once('clientReady', async () => {
	if (!client.user) return;

	await rest.put(Routes.applicationCommands(client.user.id), {
		body: commands,
	});
});

/**
 * In-memory event state keyed by the bot message ID created for each event.
 * These maps are cleared when an event completes, is cancelled, or expires.
 */
const eventParticipants = new Map<string, ParticipantMap>();
const eventCreators = new Map<string, string>();
const eventTimers = new Map<string, EventTimer>();
const eventThreads = new Map<string, string>();
const eventTimeouts = new Map<string, NodeJS.Timeout>();
const eventMatchIds = new Map<string, string>();

/**
 * Routes Discord interactions to the relevant handler based on component type.
 */
client.on('interactionCreate', async (interaction) => {
	try {
		if (
			interaction.isChatInputCommand() &&
			interaction.commandName === 'create'
		) {
			await handleCreateCommand(interaction);
		}

		if (!interaction.isMessageComponent()) return;

		const messageId = interaction.message.id;
		const userId = interaction.user.id;
		const participantMap = eventParticipants.get(messageId);

		if (!participantMap) return;

		if (interaction.isButton()) {
			const timerData = eventTimers.get(messageId);
			const creatorId = eventCreators.get(messageId);

			if (!timerData || !creatorId) return;

			switch (interaction.customId) {
				case 'signup':
					await handleSignUpButton(
						interaction,
						userId,
						participantMap,
						timerData,
					);
					break;
				case 'signout':
					await handleSignOutButton(
						interaction,
						userId,
						participantMap,
						creatorId,
						timerData,
					);
					break;
				case 'cancel':
					await handleCancelButton(interaction, userId, creatorId);
					break;
				case 'startnow':
					await handleStartNowButton(
						interaction,
						userId,
						participantMap,
						creatorId,
					);
					break;
				case 'finish':
					await handleFinishButton(interaction, userId, creatorId);
					break;
			}
		}

		if (interaction.isStringSelectMenu()) {
			await handleRoleSelection(interaction, userId, participantMap);
		}
	} catch (error) {
		console.error(error);

		if (interaction.isRepliable() && !interaction.replied) {
			await interaction.reply({
				content: 'An error occurred while processing your request.',
				flags: ['Ephemeral'],
			});
		}
	}
});

/**
 * Handles the /create slash command by creating the event embed, registering
 * local state tracking, and setting up any scheduled start timers.
 */
async function handleCreateCommand(interaction: ChatInputCommandInteraction) {
	if (isUserInAnyEvent(interaction.user.id)) {
		await interaction.reply({
			content: ERROR_MESSAGES.ALREADY_SIGNED_UP,
			flags: ['Ephemeral'],
		});
		return;
	}

	const casual = !!interaction.options.getBoolean('casual', false);
	const timeInMinutes = interaction.options.getInteger('time', false);
	const startTime = Date.now();
	const userMention = createUserMention(interaction.user.id);

	const buttons = [
		new ButtonBuilder()
			.setEmoji('📝')
			.setCustomId('signup')
			.setLabel('Sign Up')
			.setStyle(ButtonStyle.Primary),
		new ButtonBuilder()
			.setEmoji('🚪')
			.setCustomId('signout')
			.setLabel('Sign Out')
			.setStyle(ButtonStyle.Danger),
		new ButtonBuilder()
			.setEmoji('❌')
			.setCustomId('cancel')
			.setLabel('Cancel Event')
			.setStyle(ButtonStyle.Secondary),
	];

	if (timeInMinutes) {
		buttons.push(
			new ButtonBuilder()
				.setEmoji('▶️')
				.setCustomId('startnow')
				.setLabel('Start Now')
				.setStyle(ButtonStyle.Success),
		);
	}

	const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
		...buttons,
	);

	const select = new StringSelectMenuBuilder()
		.setCustomId('select')
		.setPlaceholder('Select a weapon role')
		.addOptions(
			new StringSelectMenuOptionBuilder().setLabel('Slayer').setValue('slayer'),
			new StringSelectMenuOptionBuilder()
				.setLabel('Support')
				.setValue('support'),
			new StringSelectMenuOptionBuilder()
				.setLabel('Skirmisher')
				.setValue('skirmisher'),
			new StringSelectMenuOptionBuilder()
				.setLabel('Backline')
				.setValue('backline'),
			new StringSelectMenuOptionBuilder().setLabel('Flex').setValue('flex'),
			new StringSelectMenuOptionBuilder().setLabel('Cooler').setValue('cooler'),
		);

	const selectRow =
		new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);

	const embedFields = [
		{ name: 'Participants (1)', value: `- ${userMention}`, inline: true },
		{
			name: 'Role',
			value: '- None',
			inline: true,
		},
		{
			name: 'Start',
			value: timeInMinutes
				? `<t:${Math.floor((startTime + timeInMinutes * 60 * 1000) / 1000)}:R>`
				: 'When 8 players have signed up',
		},
		{ name: 'Status', value: STATUS_MESSAGES.OPEN },
	];

	const embed = new EmbedBuilder()
		.setAuthor({
			name: interaction.user.username,
			iconURL: interaction.user.displayAvatarURL(),
		})
		.setTitle(`${casual ? '[Casual] ' : '[Competitive]'} 8s Sign Up`)
		.addFields(embedFields)
		.setColor(COLORS.OPEN);

	const rolePing = getPingsForServer(interaction, casual);

	const reply = await interaction.reply({
		content: rolePing || undefined,
		embeds: [embed],
		components: [buttonRow, selectRow],
	});
	const message = await reply.fetch();
	const matchId = randomUUID();

	eventParticipants.set(
		message.id,
		new Map([[userMention, { userId: userMention, role: null }]]),
	);
	eventCreators.set(message.id, interaction.user.id);
	eventTimers.set(message.id, {
		startTime,
		duration: timeInMinutes ? timeInMinutes * 60 * 1000 : 0,
		hasStarted: false,
	});
	eventMatchIds.set(message.id, matchId);

	telemetry?.trackEventCreated(
		interaction.guild?.id || 'unknown',
		message.id,
		interaction.user.id,
		timeInMinutes || undefined,
		interaction.channelId,
		matchId,
	);

	if (timeInMinutes) {
		const timeout = setTimeout(
			async () => {
				const participantSet = eventParticipants.get(message.id);
				const timerData = eventTimers.get(message.id);
				if (!participantSet || !timerData || timerData.hasStarted) {
					eventTimeouts.delete(message.id);
					return;
				}

				if (participantSet.size === MAX_PARTICIPANTS) {
					await startEvent(message, participantSet);
				} else {
					const embed = EmbedBuilder.from(message.embeds[0]);
					updateEmbedField(embed, 'Start', 'When 8 players have signed up');
					await message.edit({ embeds: [embed] });
				}

				eventTimeouts.delete(message.id);
			},
			timeInMinutes * 60 * 1000,
		);

		eventTimeouts.set(message.id, timeout);
	}
}

/**
 * Adds the interacting user to the event, updates telemetry, and refreshes the
 * participant embed when the Sign Up button is pressed.
 */
async function handleSignUpButton(
	interaction: ButtonInteraction,
	userId: string,
	participantMap: ParticipantMap,
	timerData: EventTimer,
) {
	const userMention = createUserMention(userId);

	if (
		participantMap.size >= MAX_PARTICIPANTS &&
		!participantMap.has(userMention)
	) {
		await interaction.deferUpdate();
		return;
	}

	if (isUserInAnyEvent(userId)) {
		await interaction.reply({
			content: ERROR_MESSAGES.ALREADY_SIGNED_UP,
			flags: ['Ephemeral'],
		});
		return;
	}

	participantMap.set(userMention, { userId: userMention, role: null });

	const matchId = eventMatchIds.get(interaction.message.id);
	telemetry?.trackUserSignUp(
		interaction.guild?.id || 'unknown',
		interaction.message.id,
		interaction.user.id,
		userMentionsToUserIds(participantMap),
		interaction.channelId,
		matchId,
	);

	await updateParticipantEmbed(interaction, participantMap, timerData);
}

/**
 * Removes the interacting user from the participant list while preventing the
 * event creator from opting out of their own lobby.
 */
async function handleSignOutButton(
	interaction: ButtonInteraction,
	userId: string,
	participantMap: ParticipantMap,
	creatorId: string,
	timerData: EventTimer,
) {
	if (userId === creatorId) {
		await interaction.reply({
			content: ERROR_MESSAGES.CREATOR_CANNOT_SIGNOUT,
			flags: ['Ephemeral'],
		});
		return;
	}

	const userMention = createUserMention(userId);
	participantMap.delete(userMention);

	const matchId = eventMatchIds.get(interaction.message.id);
	telemetry?.trackUserSignOut(
		interaction.guild?.id || 'unknown',
		interaction.message.id,
		interaction.user.id,
		userMentionsToUserIds(participantMap),
		interaction.channelId,
		matchId,
	);

	await updateParticipantEmbed(interaction, participantMap, timerData);
}

/**
 * Cancels an event when invoked by its creator, updates visual state, and
 * clears all cached data for the associated message.
 */
async function handleCancelButton(
	interaction: ButtonInteraction,
	userId: string,
	creatorId: string,
) {
	if (userId !== creatorId) {
		await interaction.reply({
			content: ERROR_MESSAGES.CREATOR_ONLY_CANCEL,
			flags: ['Ephemeral'],
		});
		return;
	}

	const messageId = interaction.message.id;
	const embed = EmbedBuilder.from(interaction.message.embeds[0]).setColor(
		COLORS.CANCELLED,
	);

	updateEmbedField(embed, 'Status', STATUS_MESSAGES.CANCELLED);

	await interaction.deferUpdate();
	await interaction.message.edit({ embeds: [embed], components: [] });

	const matchId = eventMatchIds.get(messageId);
	telemetry?.trackEventCancelled(
		interaction.guild?.id || 'unknown',
		messageId,
		userMentionsToUserIds(
			eventParticipants.get(messageId) ||
				new Map<string, { userId: string; role: string | null }>(),
		),
		interaction.channelId,
		matchId,
	);

	cleanupEvent(messageId);
}

/**
 * Starts the event immediately when the lobby is full and the creator invokes
 * the Start Now button.
 */
async function handleStartNowButton(
	interaction: ButtonInteraction,
	userId: string,
	participantMap: ParticipantMap,
	creatorId: string,
) {
	if (userId !== creatorId) {
		await interaction.reply({
			content: ERROR_MESSAGES.CREATOR_ONLY_START,
			flags: ['Ephemeral'],
		});
		return;
	}

	if (participantMap.size !== MAX_PARTICIPANTS) {
		await interaction.deferUpdate();
		return;
	}

	await startEvent(interaction.message, participantMap);
}

/**
 * Completes an active event, locks the associated thread, and records telemetry.
 */
async function handleFinishButton(
	interaction: ButtonInteraction,
	userId: string,
	creatorId: string,
) {
	if (userId !== creatorId) {
		await interaction.reply({
			content: ERROR_MESSAGES.CREATOR_ONLY_FINISH,
			flags: ['Ephemeral'],
		});
		return;
	}

	const messageId = interaction.message.id;

	const threadId = eventThreads.get(messageId);
	const channel = interaction.channel as TextChannel | null;
	if (threadId && channel) {
		const thread = await channel.threads.fetch(threadId);
		if (thread) {
			await thread.setLocked(true);
			await thread.setArchived(true);
		}
	}

	const embed = EmbedBuilder.from(interaction.message.embeds[0]).setColor(
		COLORS.FINISHED,
	);

	updateEmbedField(embed, 'Status', STATUS_MESSAGES.FINISHED);

	await interaction.deferUpdate();
	await interaction.message.edit({ embeds: [embed], components: [] });

	const matchId = eventMatchIds.get(messageId);
	telemetry?.trackEventFinished(
		interaction.guild?.id || 'unknown',
		messageId,
		userMentionsToUserIds(
			eventParticipants.get(messageId) ||
				new Map<string, { userId: string; role: string | null }>(),
		),
		interaction.channelId,
		matchId,
	);

	cleanupEvent(messageId);
}

/**
 * Persists the weapon role selected by the user and updates shared state plus
 * the visible embed with the new assignment.
 */
async function handleRoleSelection(
	interaction: StringSelectMenuInteraction,
	userId: string,
	participantMap: ParticipantMap,
) {
	const userMention = createUserMention(userId);
	if (!participantMap.has(userMention)) {
		await interaction.reply({
			content: ERROR_MESSAGES.NOT_SIGNED_UP,
			flags: ['Ephemeral'],
		});
		return;
	}

	const selectedValue = interaction.values[0];
	const component = interaction.component;
	const selectedOption = component.options.find(
		(option) => option.value === selectedValue,
	);
	const selectedRole = selectedOption?.label || selectedValue;

	participantMap.set(userMention, {
		userId: userMention,
		role: selectedRole,
	});

	const timerData = eventTimers.get(interaction.message.id);

	if (!timerData) return;

	await updateParticipantEmbed(interaction, participantMap, timerData);
}

/**
 * Transitions a lobby into an active event, creates a private thread, and
 * invites all registered participants.
 */
async function startEvent(message: Message, participantMap: ParticipantMap) {
	const timerData = eventTimers.get(message.id);
	if (!timerData || timerData.hasStarted) return;

	timerData.hasStarted = true;
	const matchId = eventMatchIds.get(message.id);

	const timeout = eventTimeouts.get(message.id);
	if (timeout) {
		clearTimeout(timeout);
		eventTimeouts.delete(message.id);
	}

	const embed = EmbedBuilder.from(message.embeds[0]).setColor(COLORS.STARTED);

	updateEmbedField(embed, 'Status', STATUS_MESSAGES.STARTED);
	updateEmbedField(embed, 'Start', `<t:${Math.floor(Date.now() / 1000)}:R>`);

	const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setEmoji('🏁')
			.setCustomId('finish')
			.setLabel('Finish Event')
			.setStyle(ButtonStyle.Success),
	);

	await message.edit({ embeds: [embed], components: [row] });

	const channel = message.channel as TextChannel;
	const thread = await channel.threads.create({
		name: '8s Game Ready!',
		autoArchiveDuration: 60,
		type: ChannelType.PrivateThread,
	});

	await thread.send({
		embeds: [EmbedBuilder.from(message.embeds[0])],
	});

	eventThreads.set(message.id, thread.id);

	const newParticipantsMap = userMentionsToUserIds(participantMap);

	for (const participant of newParticipantsMap) {
		await thread.members.add(participant.userId);
	}

	telemetry?.trackEventStarted(
		message.guild?.id || 'unknown',
		message.id,
		newParticipantsMap,
		message.channelId,
		matchId,
	);
}

/**
 * Updates a field on the event embed by exact name match.
 */
function updateEmbedField(
	embed: EmbedBuilder,
	fieldName: string,
	newValue: string,
) {
	const fields = embed.data.fields || [];
	const field = fields.find((f) => f.name === fieldName);
	if (field) {
		field.value = newValue;
	}
	embed.setFields(fields);
}

/**
 * Updates a field on the event embed using a partial match to find dynamic slots.
 */
function updateEmbedFieldByMatch(
	embed: EmbedBuilder,
	partialName: string,
	newName: string,
	newValue: string,
) {
	const fields = embed.data.fields || [];
	const field = fields.find((f) => f.name.includes(partialName));
	if (field) {
		field.name = newName;
		field.value = newValue;
	}
	embed.setFields(fields);
}

/**
 * Syncs the event embed with the current participant roster and triggers an
 * automatic start when the lobby fills and any timers have elapsed.
 */
async function updateParticipantEmbed(
	interaction: ButtonInteraction | StringSelectMenuInteraction,
	participantMap: ParticipantMap,
	timerData: EventTimer,
) {
	const embed = EmbedBuilder.from(interaction.message.embeds[0]);

	const status =
		participantMap.size === MAX_PARTICIPANTS
			? STATUS_MESSAGES.READY
			: STATUS_MESSAGES.OPEN;
	updateEmbedField(embed, 'Status', status);

	updateEmbedFieldByMatch(
		embed,
		'Participants',
		`Participants (${participantMap.size})`,
		Array.from(participantMap)
			.map((p) => `- ${p[1].userId}`)
			.join('\n'),
	);

	updateEmbedField(
		embed,
		'Role',
		Array.from(participantMap.values())
			.map((p) => `- ${p.role || 'None'}`)
			.join('\n'),
	);

	await interaction.deferUpdate();
	await interaction.message.edit({ embeds: [embed] });

	const timeElapsed = Date.now() - timerData.startTime;
	const timeIsUpOrNotSet =
		timerData.duration === 0 || timeElapsed >= timerData.duration;

	if (participantMap.size === MAX_PARTICIPANTS && timeIsUpOrNotSet) {
		await startEvent(interaction.message, participantMap);
	}
}

/**
 * Returns true if the supplied user is already registered in any tracked event.
 */
function isUserInAnyEvent(userId: string): boolean {
	const mention = createUserMention(userId);
	for (const [_, participantSet] of eventParticipants.entries()) {
		if (participantSet.has(mention)) {
			return true;
		}
	}
	return false;
}

/**
 * Creates a Discord mention string for the provided user ID.
 */
function createUserMention(userId: string) {
	return `<@${userId}>`;
}

/**
 * Converts a map keyed by user mentions into an array of clean user IDs and roles.
 */
function userMentionsToUserIds(mentions: ParticipantMap) {
	return Array.from(mentions.values()).map((mention) => {
		return {
			userId: mention.userId.replace(/[<@>]/g, ''),
			role: mention.role,
		};
	});
}

/**
 * Resolves which roles to ping for the current guild based on the lobby type.
 */
function getPingsForServer(
	interaction: ChatInputCommandInteraction,
	casual: boolean,
): string | null {
	if (!interaction.guild) return null;

	const roles = interaction.guild.roles.cache.filter(
		(role) =>
			PING_ROLE_NAMES.includes(role.name) &&
			(casual || !role.name.toLowerCase().includes('casual')),
	);

	if (roles.size === 0) return null;

	return roles.map((role) => `||<@&${role.id}>||`).join(' ');
}

/**
 * Clears all cached state associated with a specific event.
 */
function cleanupEvent(messageId: string) {
	const timeout = eventTimeouts.get(messageId);
	if (timeout) {
		clearTimeout(timeout);
		eventTimeouts.delete(messageId);
	}

	eventParticipants.delete(messageId);
	eventCreators.delete(messageId);
	eventTimers.delete(messageId);
	eventThreads.delete(messageId);
	eventMatchIds.delete(messageId);
}

/**
 * Periodically scans active events and expires any that have exceeded their lifetime.
 */
async function cleanupStaleEvents() {
	const MAX_EVENT_LIFETIME = 24 * 60 * 60 * 1000;
	const now = Date.now();

	for (const [messageId, timerData] of eventTimers.entries()) {
		if (now - timerData.startTime < MAX_EVENT_LIFETIME) return;

		try {
			for (const [_, channel] of client.channels.cache) {
				if (!channel.isTextBased() || channel.isDMBased()) continue;

				const message = await channel.messages.fetch(messageId);

				const embed = EmbedBuilder.from(message.embeds[0]).setColor(
					COLORS.CANCELLED,
				);
				updateEmbedField(embed, 'Status', STATUS_MESSAGES.EXPIRED);

				await message.edit({ embeds: [embed], components: [] });

				const threadId = eventThreads.get(messageId);
				if (threadId && channel.isThread() === false) {
					const thread = await (channel as TextChannel).threads.fetch(threadId);
					if (thread) {
						await thread.setLocked(true);
						await thread.setArchived(true);
					}
				}

				const matchId = eventMatchIds.get(messageId);
				telemetry?.trackEventExpired(
					message.guild?.id || 'unknown',
					messageId,
					userMentionsToUserIds(
						eventParticipants.get(messageId) ||
							new Map<string, { userId: string; role: string | null }>(),
					),
					message.channelId,
					matchId,
				);

				break;
			}
		} catch (error) {
			console.error(error);
		} finally {
			cleanupEvent(messageId);
		}
	}
}

setInterval(cleanupStaleEvents, 60 * 60 * 1000);
client.login(botToken);
