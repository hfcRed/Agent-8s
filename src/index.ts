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
	type Guild,
	GuildMember,
	type Message,
	OverwriteType,
	PermissionFlagsBits,
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
	ADMIN_PERMISSIONS,
	COLORS,
	ERROR_MESSAGES,
	EXCALIBUR_GUILD_ID,
	EXCALIBUR_RANKS,
	MAX_PARTICIPANTS,
	PING_ROLE_NAMES,
	PROCESSING_MESSAGES,
	STATUS_MESSAGES,
	WEAPON_ROLES,
} from './constants.js';
import { TelemetryService } from './telemetry/telemetry.js';
import type { EventOperation, EventTimer, ParticipantMap } from './types.js';

dotenv.config();
const botToken = process.env.BOT_TOKEN;

if (!botToken) {
	console.error('BOT_TOKEN not found in .env file');
	process.exit(1);
}

const telemetryUrl = process.env.TELEMETRY_URL;
const telemetryToken = process.env.TELEMETRY_TOKEN;

/**
 * Optional telemetry client used to forward interaction lifecycle metrics.
 */
const telemetry =
	telemetryUrl && telemetryToken
		? new TelemetryService(telemetryUrl, telemetryToken)
		: undefined;

const rest = new REST({ version: '10' }).setToken(botToken);

const appClient = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.GuildVoiceStates,
		GatewayIntentBits.MessageContent,
	],
	allowedMentions: { parse: ['roles'] },
});

appClient
	.login(botToken)
	.then(() => {
		console.log('Discord client logged in');
	})
	.catch((error) => {
		console.error('Failed to log in Discord client:', error);
		process.exit(1);
	});

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

appClient.once('clientReady', async () => {
	if (!appClient.user) return;

	try {
		await rest.put(Routes.applicationCommands(appClient.user.id), {
			body: commands,
		});
		console.log('Successfully registered application commands');
	} catch (error) {
		console.error('Failed to register application commands:', error);
		process.exit(1);
	}
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
const eventVoiceChannels = new Map<string, string[]>();
const eventProcessingStates = new Map<string, Set<EventOperation>>();

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
			await handleCreateCommand(interaction);
		}

		if (!interaction.isMessageComponent()) return;

		const messageId = interaction.message.id;
		const userId = interaction.user.id;
		const participantMap = eventParticipants.get(messageId);

		if (!participantMap) return;

		if (interaction.isButton()) {
			if (isProcessing(messageId, 'starting')) {
				await interaction.reply({
					content: PROCESSING_MESSAGES.STILL_STARTING,
					flags: ['Ephemeral'],
				});
				return;
			}

			if (isProcessing(messageId, 'finishing')) {
				await interaction.reply({
					content: PROCESSING_MESSAGES.ALREADY_FINISHING,
					flags: ['Ephemeral'],
				});
				return;
			}

			if (isProcessing(messageId, 'cancelling')) {
				await interaction.reply({
					content: PROCESSING_MESSAGES.ALREADY_CANCELLING,
					flags: ['Ephemeral'],
				});
				return;
			}

			if (isEventFinalizing(interaction.message)) {
				await interaction.reply({
					content: ERROR_MESSAGES.EVENT_FINALIZING,
					flags: ['Ephemeral'],
				});
				return;
			}

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
					await handleCancelButton(
						interaction,
						userId,
						participantMap,
						creatorId,
					);
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
					await handleFinishButton(
						interaction,
						userId,
						participantMap,
						creatorId,
					);
					break;
			}
		}

		if (interaction.isStringSelectMenu()) {
			await handleRoleSelection(interaction, userId, participantMap);
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

/**
 * Handles the /create slash command by creating the event embed
 * and setting up any scheduled start timers.
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
	const timeInMinutes =
		interaction.options.getInteger('time', false) ?? undefined;
	const startTime = Date.now();

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
			WEAPON_ROLES.map((role) =>
				new StringSelectMenuOptionBuilder()
					.setLabel(role)
					.setValue(role.toLowerCase()),
			),
		);

	const selectRow =
		new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);

	const embedFields = [
		{
			name: 'Participants (1)',
			value: `- <@${interaction.user.id}>`,
			inline: true,
		},
		{
			name: 'Role',
			value: WEAPON_ROLES[0],
			inline: true,
		},
		{
			name: 'Start',
			value: timeInMinutes
				? `⏳ <t:${Math.floor((startTime + timeInMinutes * 60 * 1000) / 1000)}:R>`
				: '👥 When 8 players have signed up',
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
		new Map([
			[
				interaction.user.id,
				{
					userId: interaction.user.id,
					role: WEAPON_ROLES[0],
					rank: getExcaliburRankOfUser(interaction),
				},
			],
		]),
	);
	eventCreators.set(message.id, interaction.user.id);
	eventTimers.set(message.id, {
		startTime,
		duration: timeInMinutes ? timeInMinutes * 60 * 1000 : undefined,
		hasStarted: false,
	});
	eventMatchIds.set(message.id, matchId);

	telemetry?.trackEventCreated({
		guildId: interaction.guild?.id || 'unknown',
		eventId: message.id,
		userId: interaction.user.id,
		participants: Array.from(
			(eventParticipants.get(message.id) || new Map()).values(),
		),
		channelId: interaction.channelId,
		matchId,
		timeToStart: timeInMinutes,
	});

	if (timeInMinutes) createEventStartTimeout(message, timeInMinutes);
}

/**
 * Sets a timeout to automatically start the event after the specified time.
 */
async function createEventStartTimeout(
	message: Message,
	timeInMinutes: number,
) {
	const existingTimeout = eventTimeouts.get(message.id);
	if (existingTimeout) {
		clearTimeout(existingTimeout);
		eventTimeouts.delete(message.id);
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
				const participantMap = eventParticipants.get(message.id);
				const timerData = eventTimers.get(message.id);

				if (!participantMap || !timerData || timerData.hasStarted) {
					eventTimeouts.delete(message.id);
					return;
				}

				if (
					participantMap.size === MAX_PARTICIPANTS &&
					!isProcessing(message.id, 'starting') &&
					!isProcessing(message.id, 'finishing') &&
					!isProcessing(message.id, 'cleanup') &&
					!isProcessing(message.id, 'cancelling')
				) {
					setProcessing(message.id, 'starting');
					try {
						await startEvent(message, participantMap);
					} finally {
						clearProcessing(message.id, 'starting');
					}
				} else {
					const embed = EmbedBuilder.from(message.embeds[0]);
					updateEmbedField(embed, 'Start', '👥 When 8 players have signed up');
					await message.edit({ embeds: [embed] });
				}
			} catch (error) {
				console.error(
					`Error in timeout callback for event ${message.id}:`,
					error,
				);
			} finally {
				eventTimeouts.delete(message.id);
			}
		},
		timeInMinutes * 60 * 1000,
	);

	eventTimeouts.set(message.id, timeout);
}

/**
 * Adds the interacting user to the event participant list if there is room.
 */
async function handleSignUpButton(
	interaction: ButtonInteraction,
	userId: string,
	participantMap: ParticipantMap,
	timerData: EventTimer,
) {
	await interaction.deferUpdate();

	if (participantMap.size >= MAX_PARTICIPANTS && !participantMap.has(userId)) {
		await interaction.followUp({
			content: ERROR_MESSAGES.EVENT_FULL,
			flags: ['Ephemeral'],
		});
		return;
	}

	if (isUserInAnyEvent(userId)) {
		await interaction.followUp({
			content: ERROR_MESSAGES.ALREADY_SIGNED_UP,
			flags: ['Ephemeral'],
		});
		return;
	}

	participantMap.set(userId, {
		userId: userId,
		role: WEAPON_ROLES[0],
		rank: getExcaliburRankOfUser(interaction),
	});

	const matchId = eventMatchIds.get(interaction.message.id);
	telemetry?.trackUserSignUp({
		guildId: interaction.guild?.id || 'unknown',
		eventId: interaction.message.id,
		userId: userId,
		participants: Array.from(participantMap.values()),
		channelId: interaction.channelId,
		matchId: matchId || 'unknown',
	});

	await updateParticipantEmbed(interaction, participantMap, timerData);
}

/**
 * Removes the interacting user from the participant list.
 * Event creators cannot sign out.
 */
async function handleSignOutButton(
	interaction: ButtonInteraction,
	userId: string,
	participantMap: ParticipantMap,
	creatorId: string,
	timerData: EventTimer,
) {
	await interaction.deferUpdate();

	if (userId === creatorId) {
		await interaction.followUp({
			content: ERROR_MESSAGES.CREATOR_CANNOT_SIGNOUT,
			flags: ['Ephemeral'],
		});
		return;
	}

	participantMap.delete(userId);

	const matchId = eventMatchIds.get(interaction.message.id);
	telemetry?.trackUserSignOut({
		guildId: interaction.guild?.id || 'unknown',
		eventId: interaction.message.id,
		userId: userId,
		participants: Array.from(participantMap.values()),
		channelId: interaction.channelId,
		matchId: matchId || 'unknown',
	});

	await updateParticipantEmbed(interaction, participantMap, timerData);
}

/**
 * Cancels the event. Can be invoked by the event creator or administrators.
 */
async function handleCancelButton(
	interaction: ButtonInteraction,
	userId: string,
	participantMap: ParticipantMap,
	creatorId: string,
) {
	await interaction.deferUpdate();

	const isCreator = userId === creatorId;
	const isAdmin = isUserAdmin(interaction.member as GuildMember);

	if (!isCreator && !isAdmin) {
		await interaction.followUp({
			content: ERROR_MESSAGES.CREATOR_ONLY_CANCEL,
			flags: ['Ephemeral'],
		});
		return;
	}

	const messageId = interaction.message.id;

	setProcessing(messageId, 'cancelling');
	try {
		const embed = EmbedBuilder.from(interaction.message.embeds[0]).setColor(
			COLORS.CANCELLED,
		);

		updateEmbedField(embed, 'Status', STATUS_MESSAGES.CANCELLED);

		await interaction.editReply({ embeds: [embed], components: [] });

		const matchId = eventMatchIds.get(messageId);
		telemetry?.trackEventCancelled({
			guildId: interaction.guild?.id || 'unknown',
			eventId: messageId,
			userId: userId,
			participants: Array.from(participantMap.values()),
			channelId: interaction.channelId,
			matchId: matchId || 'unknown',
		});

		await cleanupEvent(messageId);
	} finally {
		clearProcessing(messageId, 'cancelling');
	}
}

/**
 * Starts the event immediately when the lobby is full.
 * Can only be invoked by the event creator.
 */
async function handleStartNowButton(
	interaction: ButtonInteraction,
	userId: string,
	participantMap: ParticipantMap,
	creatorId: string,
) {
	await interaction.deferUpdate();

	const messageId = interaction.message.id;

	if (userId !== creatorId) {
		await interaction.followUp({
			content: ERROR_MESSAGES.CREATOR_ONLY_START,
			flags: ['Ephemeral'],
		});
		return;
	}

	if (participantMap.size !== MAX_PARTICIPANTS) {
		await interaction.followUp({
			content: ERROR_MESSAGES.NOT_ENOUGH_PARTICIPANTS,
			flags: ['Ephemeral'],
		});
		return;
	}

	setProcessing(messageId, 'starting');
	try {
		await startEvent(interaction.message, participantMap);
	} finally {
		clearProcessing(messageId, 'starting');
	}
}

/**
 * Completes an active event and locks and archives the associated thread.
 * Can be invoked by the event creator or administrators.
 */
async function handleFinishButton(
	interaction: ButtonInteraction,
	userId: string,
	participantMap: ParticipantMap,
	creatorId: string,
) {
	await interaction.deferUpdate();
	const isCreator = userId === creatorId;
	const isAdmin = isUserAdmin(interaction.member as GuildMember);

	if (!isCreator && !isAdmin) {
		await interaction.followUp({
			content: ERROR_MESSAGES.CREATOR_ONLY_FINISH,
			flags: ['Ephemeral'],
		});
		return;
	}

	const messageId = interaction.message.id;

	setProcessing(messageId, 'finishing');
	try {
		const threadId = eventThreads.get(messageId);
		const channel = interaction.channel as TextChannel | null;
		if (threadId && channel) {
			try {
				const thread = await channel.threads.fetch(threadId);
				if (thread) {
					await thread.setLocked(true);
					await thread.setArchived(true);
				}
			} catch (error) {
				console.error(`Failed to manage thread ${threadId}:`, error);
			}
		}

		const embed = EmbedBuilder.from(interaction.message.embeds[0]).setColor(
			COLORS.FINISHED,
		);

		updateEmbedField(embed, 'Status', STATUS_MESSAGES.FINISHED);

		await interaction.editReply({ embeds: [embed], components: [] });

		const matchId = eventMatchIds.get(messageId);
		telemetry?.trackEventFinished({
			guildId: interaction.guild?.id || 'unknown',
			eventId: messageId,
			userId: userId,
			participants: Array.from(participantMap.values()),
			channelId: interaction.channelId,
			matchId: matchId || 'unknown',
		});

		await cleanupEvent(messageId);
	} finally {
		clearProcessing(messageId, 'finishing');
	}
}

/**
 * Updates the weapon role for the interacting user.
 * Can only be invoked by users who are signed up for the event.
 */
async function handleRoleSelection(
	interaction: StringSelectMenuInteraction,
	userId: string,
	participantMap: ParticipantMap,
) {
	await interaction.deferUpdate();

	if (!participantMap.has(userId)) {
		await interaction.followUp({
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

	participantMap.set(userId, {
		userId: userId,
		role: selectedRole,
		rank: getExcaliburRankOfUser(interaction),
	});

	const timerData = eventTimers.get(interaction.message.id);

	if (!timerData) return;

	await updateParticipantEmbed(interaction, participantMap, timerData);
}

/**
 * Starts the event, creates a private thread, and
 * invites all registered participants.
 */
async function startEvent(message: Message, participantMap: ParticipantMap) {
	const timerData = eventTimers.get(message.id);
	if (!timerData || timerData.hasStarted) return;

	timerData.hasStarted = true;
	const matchId = eventMatchIds.get(message.id);
	const shortId = matchId?.slice(0, 5);

	const timeout = eventTimeouts.get(message.id);
	if (timeout) {
		clearTimeout(timeout);
		eventTimeouts.delete(message.id);
	}

	const embed = EmbedBuilder.from(message.embeds[0]).setColor(COLORS.STARTED);

	updateEmbedField(embed, 'Status', STATUS_MESSAGES.STARTED);
	updateEmbedField(embed, 'Start', `⏳ <t:${Math.floor(Date.now() / 1000)}:R>`);

	const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setEmoji('🏁')
			.setCustomId('finish')
			.setLabel('Finish Event')
			.setStyle(ButtonStyle.Success),
	);

	await message.edit({ embeds: [embed], components: [row] });

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

		eventThreads.set(message.id, createdThread.id);
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

	const guild = message.guild as Guild;
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

	eventVoiceChannels.set(message.id, voiceChannels);

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
		userId: eventCreators.get(message.id) || 'unknown',
		participants: participants,
		channelId: message.channelId,
		matchId: matchId || 'unknown',
	});
}

/**
 * Updates a fields value on the event embed by exact name match.
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
 * Updates a fields value on the event embed using a partial match to find dynamic field names.
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
 * Updates the embed with the current participant list and triggers an
 * automatic start when the lobby fills and any timers have elapsed.
 */
async function updateParticipantEmbed(
	interaction: ButtonInteraction | StringSelectMenuInteraction,
	participantMap: ParticipantMap,
	timerData: EventTimer,
) {
	const embed = EmbedBuilder.from(interaction.message.embeds[0]);

	updateEmbedFieldByMatch(
		embed,
		'Participants',
		`Participants (${participantMap.size})`,
		Array.from(participantMap.values())
			.map((p) => `- <@${p.userId}>`)
			.join('\n'),
	);

	updateEmbedField(
		embed,
		'Role',
		Array.from(participantMap.values())
			.map((p) => `- ${p.role || 'None'}`)
			.join('\n'),
	);

	if (isEventFinalizing(interaction.message)) {
		await interaction.editReply({ embeds: [embed] });
		return;
	}

	const status =
		participantMap.size === MAX_PARTICIPANTS
			? STATUS_MESSAGES.READY
			: STATUS_MESSAGES.OPEN;
	updateEmbedField(embed, 'Status', status);

	const timeElapsed = Date.now() - timerData.startTime;
	const timeIsUpOrNotSet =
		!timerData.duration || timeElapsed >= timerData.duration;

	if (participantMap.size === MAX_PARTICIPANTS && timeIsUpOrNotSet) {
		embed.setColor(COLORS.FINALIZING);
		updateEmbedField(embed, 'Status', STATUS_MESSAGES.FINALIZING);
		await interaction.editReply({ embeds: [embed] });

		createEventStartTimeout(interaction.message, 0.2);
		return;
	}

	await interaction.editReply({ embeds: [embed] });
}

/**
 * Returns true if the supplied user is already registered in any event.
 */
function isUserInAnyEvent(userId: string) {
	for (const [_, participantSet] of eventParticipants.entries()) {
		if (participantSet.has(userId)) {
			return true;
		}
	}
	return false;
}

/**
 * Checks if a user has administrator permissions.
 */
function isUserAdmin(member: GuildMember) {
	return ADMIN_PERMISSIONS.some((permission) =>
		member.permissions.has(PermissionFlagsBits[permission]),
	);
}

/**
 * Resolves which roles to ping for the current guild based on the lobby type.
 */
function getPingsForServer(
	interaction: ChatInputCommandInteraction,
	casual: boolean,
) {
	if (!interaction.guild) return null;

	const roles = interaction.guild.roles.cache.filter((role) =>
		casual
			? role.name === PING_ROLE_NAMES.casual
			: role.name === PING_ROLE_NAMES.competitive,
	);

	if (roles.size === 0) return null;

	return roles.map((role) => `||<@&${role.id}>||`).join(' ');
}

/**
 * Returns the Excalibur rank of the interacting user if they are in the Excalibur server.
 */
function getExcaliburRankOfUser(
	interaction:
		| ChatInputCommandInteraction
		| ButtonInteraction
		| StringSelectMenuInteraction,
) {
	if (interaction.guild?.id !== EXCALIBUR_GUILD_ID) return null;

	const roles = interaction.member?.roles;
	if (!roles || Array.isArray(roles)) return null;

	const resolved = Array.from(roles.valueOf()).map((r) => {
		return { id: r[1].id, name: r[1].name };
	});

	for (const rankKey in EXCALIBUR_RANKS) {
		const rank = EXCALIBUR_RANKS[rankKey as keyof typeof EXCALIBUR_RANKS];
		if (resolved.find((r) => r.id === rank.id)) {
			return rankKey as keyof typeof EXCALIBUR_RANKS;
		}
		if (resolved.find((r) => r.name === rank.name)) {
			return rankKey as keyof typeof EXCALIBUR_RANKS;
		}
	}

	return null;
}

/**
 * Checks if an event is currently in finalizing state.
 */
function isEventFinalizing(message: Message) {
	const embed = message.embeds[0];
	if (!embed || !embed.fields) return false;

	const statusField = embed.fields.find((field) => field.name === 'Status');
	return statusField?.value === STATUS_MESSAGES.FINALIZING;
}

/**
 * Helper functions to manage processing states for race condition protection
 */
function isProcessing(messageId: string, operation: EventOperation) {
	const states = eventProcessingStates.get(messageId) || new Set();
	return states.has(operation);
}

function setProcessing(messageId: string, operation: EventOperation) {
	const states = eventProcessingStates.get(messageId) || new Set();
	states.add(operation);
	eventProcessingStates.set(messageId, states);

	// Its possible for an operation to get stuck (like a bot crash),
	// so we want to auto-clear the processing state after a timeout
	setTimeout(() => {
		clearProcessing(messageId, operation);
	}, 10000);
}

function clearProcessing(messageId: string, operation: EventOperation) {
	const states = eventProcessingStates.get(messageId);
	if (!states) return;

	states.delete(operation);
	if (states.size === 0) {
		eventProcessingStates.delete(messageId);
	}
}

/**
 * Clears all data associated with a specific event.
 */
async function cleanupEvent(messageId: string) {
	if (isProcessing(messageId, 'cleanup')) return;

	setProcessing(messageId, 'cleanup');
	try {
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

		const voiceChannelIds = eventVoiceChannels.get(messageId);
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
			eventVoiceChannels.delete(messageId);
		}
	} finally {
		clearProcessing(messageId, 'cleanup');
		eventProcessingStates.delete(messageId);
	}
}

/**
 * Looks through all active events and cleans up any
 * that have exceeded their maximum lifetime.
 */
async function cleanupStaleEvents() {
	const MAX_EVENT_LIFETIME = 24 * 60 * 60 * 1000;
	const now = Date.now();

	for (const [messageId, timerData] of eventTimers.entries()) {
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

					const threadId = eventThreads.get(messageId);
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

					const matchId = eventMatchIds.get(messageId);
					telemetry?.trackEventExpired({
						guildId: message.guild?.id || 'unknown',
						eventId: messageId,
						userId: appClient.user?.id || 'unknown',
						participants: Array.from(
							(eventParticipants.get(messageId) || new Map()).values(),
						),
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
			await cleanupEvent(messageId);
		}
	}
}

setInterval(cleanupStaleEvents, 60 * 60 * 1000);

/**
 * Message deletion handler to remove non-command messages from non-admin users
 */
appClient.on('messageCreate', async (message) => {
	if (message.author.bot || !message.guild) return;

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

appClient.on('error', (error) => {
	console.error('Discord client error:', error);
});

appClient.on('warn', (warning) => {
	console.warn('Discord client warning:', warning);
});

process.on('uncaughtException', (error) => {
	console.error('Uncaught Exception:', error);
	process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
	console.error('Unhandled Rejection at:', promise, 'reason:', reason);
	process.exit(1);
});
