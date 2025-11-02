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
import { TelemetryService } from './telemetry.js';
import type { EventTimer, ParticipantMap } from './types.js';

const parsed = dotenv.config();
const botToken = parsed.parsed?.BOT_TOKEN;
const telemetryUrl = parsed.parsed?.TELEMETRY_URL;
const telemetryToken = parsed.parsed?.TELEMETRY_TOKEN;

if (!botToken) {
	console.error('BOT_TOKEN not found in .env file');
	process.exit(1);
}

const telemetry =
	telemetryUrl && telemetryToken
		? new TelemetryService(telemetryUrl, telemetryToken)
		: null;

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

client.once('clientReady', async () => {
	if (!client.user) return;

	await rest.put(Routes.applicationCommands(client.user.id), {
		body: commands,
	});
});

const participants = new Map<string, ParticipantMap>();
const eventCreators = new Map<string, string>();
const eventTimers = new Map<string, EventTimer>();
const eventThreads = new Map<string, string>();
const eventTimeouts = new Map<string, NodeJS.Timeout>();

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
		const participantMap = participants.get(messageId);

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

	participants.set(
		message.id,
		new Map([[userMention, { userId: userMention, role: null }]]),
	);
	eventCreators.set(message.id, interaction.user.id);
	eventTimers.set(message.id, {
		startTime,
		duration: timeInMinutes ? timeInMinutes * 60 * 1000 : 0,
		hasStarted: false,
	});

	telemetry?.trackEventCreated(
		interaction.guild?.id || 'unknown',
		message.id,
		interaction.user.id,
		timeInMinutes || undefined,
	);

	if (timeInMinutes) {
		const timeout = setTimeout(
			async () => {
				const participantSet = participants.get(message.id);
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

	telemetry?.trackUserSignUp(
		interaction.guild?.id || 'unknown',
		interaction.message.id,
		interaction.user.id,
		userMentionsToUserIds(participantMap),
	);

	await updateParticipantEmbed(interaction, participantMap, timerData);
}

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

	telemetry?.trackUserSignOut(
		interaction.guild?.id || 'unknown',
		interaction.message.id,
		interaction.user.id,
		userMentionsToUserIds(participantMap),
	);

	await updateParticipantEmbed(interaction, participantMap, timerData);
}

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

	telemetry?.trackEventCancelled(
		interaction.guild?.id || 'unknown',
		messageId,
		userMentionsToUserIds(
			participants.get(messageId) ||
				new Map<string, { userId: string; role: string | null }>(),
		),
	);

	cleanupEvent(messageId);
}

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

	telemetry?.trackEventFinished(
		interaction.guild?.id || 'unknown',
		messageId,
		userMentionsToUserIds(
			participants.get(messageId) ||
				new Map<string, { userId: string; role: string | null }>(),
		),
	);

	cleanupEvent(messageId);
}

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

async function startEvent(message: Message, participantMap: ParticipantMap) {
	const timerData = eventTimers.get(message.id);
	if (!timerData || timerData.hasStarted) return;

	timerData.hasStarted = true;

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
	);
}

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

function isUserInAnyEvent(userId: string): boolean {
	const mention = createUserMention(userId);
	for (const [_, participantSet] of participants.entries()) {
		if (participantSet.has(mention)) {
			return true;
		}
	}
	return false;
}

function createUserMention(userId: string) {
	return `<@${userId}>`;
}

function userMentionsToUserIds(mentions: ParticipantMap) {
	return Array.from(mentions.values()).map((mention) => {
		return {
			userId: mention.userId.replace(/[<@>]/g, ''),
			role: mention.role,
		};
	});
}

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

function cleanupEvent(messageId: string) {
	const timeout = eventTimeouts.get(messageId);
	if (timeout) {
		clearTimeout(timeout);
		eventTimeouts.delete(messageId);
	}

	participants.delete(messageId);
	eventCreators.delete(messageId);
	eventTimers.delete(messageId);
	eventThreads.delete(messageId);
}

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

				telemetry?.trackEventExpired(
					message.guild?.id || 'unknown',
					messageId,
					userMentionsToUserIds(
						participants.get(messageId) ||
							new Map<string, { userId: string; role: string | null }>(),
					),
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
