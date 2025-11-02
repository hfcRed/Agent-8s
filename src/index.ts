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
import type { EventTimer } from './types.js';

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

const participants = new Map<string, Set<string>>();
const eventCreators = new Map<string, string>();
const eventTimers = new Map<string, EventTimer>();
const eventThreads = new Map<string, string>();

client.on('interactionCreate', async (interaction) => {
	try {
		if (
			interaction.isChatInputCommand() &&
			interaction.commandName === 'create'
		) {
			await handleCreateCommand(interaction);
		}

		if (interaction.isButton()) {
			const messageId = interaction.message.id;
			const userId = interaction.user.id;

			const participantSet = participants.get(messageId);
			const timerData = eventTimers.get(messageId);
			const creatorId = eventCreators.get(messageId);

			if (!participantSet || !timerData || !creatorId) return;

			switch (interaction.customId) {
				case 'signup':
					await handleSignUpButton(
						interaction,
						userId,
						participantSet,
						timerData,
					);
					break;
				case 'signout':
					await handleSignOutButton(
						interaction,
						userId,
						participantSet,
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
						participantSet,
						creatorId,
					);
					break;
				case 'finish':
					await handleFinishButton(interaction, userId, creatorId);
					break;
			}
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

	const row = new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons);

	const embedFields = [
		{ name: 'Participants (1)', value: `- ${userMention}` },
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
		.setTitle('8s Sign Up')
		.addFields(embedFields)
		.setColor(COLORS.OPEN);

	const rolePing = getPingsForServer(interaction);

	const reply = await interaction.reply({
		content: rolePing || undefined,
		embeds: [embed],
		components: [row],
	});
	const message = await reply.fetch();

	participants.set(message.id, new Set([userMention]));
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
		setTimeout(
			async () => {
				const participantSet = participants.get(message.id);
				const timerData = eventTimers.get(message.id);
				if (!participantSet || !timerData || timerData.hasStarted) return;

				if (participantSet.size === MAX_PARTICIPANTS) {
					await startEvent(message, participantSet);
				} else {
					const embed = EmbedBuilder.from(message.embeds[0]);
					updateEmbedField(embed, 'Start', 'When 8 players have signed up');
					await message.edit({ embeds: [embed] });
				}
			},
			timeInMinutes * 60 * 1000,
		);
	}
}

async function handleSignUpButton(
	interaction: ButtonInteraction,
	userId: string,
	participantSet: Set<string>,
	timerData: EventTimer,
) {
	const userMention = createUserMention(userId);

	if (
		participantSet.size >= MAX_PARTICIPANTS &&
		!participantSet.has(userMention)
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

	participantSet.add(userMention);

	telemetry?.trackUserSignUp(
		interaction.guild?.id || 'unknown',
		interaction.message.id,
		interaction.user.id,
		userIdsFromMentions(participantSet),
	);

	await updateParticipantEmbed(interaction, participantSet, timerData);
}

async function handleSignOutButton(
	interaction: ButtonInteraction,
	userId: string,
	participantSet: Set<string>,
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
	participantSet.delete(userMention);

	telemetry?.trackUserSignOut(
		interaction.guild?.id || 'unknown',
		interaction.message.id,
		interaction.user.id,
		userIdsFromMentions(participantSet),
	);

	await updateParticipantEmbed(interaction, participantSet, timerData);
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

	await interaction.message.edit({ embeds: [embed], components: [] });
	await interaction.deferUpdate();

	telemetry?.trackEventCancelled(
		interaction.guild?.id || 'unknown',
		messageId,
		userIdsFromMentions(participants.get(messageId) || new Set<string>()),
	);

	participants.delete(messageId);
	eventTimers.delete(messageId);
	eventCreators.delete(messageId);
}

async function handleStartNowButton(
	interaction: ButtonInteraction,
	userId: string,
	participantSet: Set<string>,
	creatorId: string,
) {
	if (userId !== creatorId) {
		await interaction.reply({
			content: ERROR_MESSAGES.CREATOR_ONLY_START,
			flags: ['Ephemeral'],
		});
		return;
	}

	if (participantSet.size !== MAX_PARTICIPANTS) {
		await interaction.deferUpdate();
		return;
	}

	await startEvent(interaction.message, participantSet);
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

	await interaction.message.edit({ embeds: [embed], components: [] });
	await interaction.deferUpdate();

	telemetry?.trackEventFinished(
		interaction.guild?.id || 'unknown',
		messageId,
		userIdsFromMentions(participants.get(messageId) || new Set<string>()),
	);

	participants.delete(messageId);
	eventTimers.delete(messageId);
	eventCreators.delete(messageId);
	eventThreads.delete(messageId);
}

async function startEvent(message: Message, participantSet: Set<string>) {
	const timerData = eventTimers.get(message.id);
	if (!timerData || timerData.hasStarted) return;

	timerData.hasStarted = true;

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

	const userIds = userIdsFromMentions(participantSet);

	for (const id of userIds) {
		await thread.members.add(id);
	}

	telemetry?.trackEventStarted(
		message.guild?.id || 'unknown',
		message.id,
		userIds,
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
	interaction: ButtonInteraction,
	participantSet: Set<string>,
	timerData: EventTimer,
) {
	await interaction.deferUpdate();

	const embed = EmbedBuilder.from(interaction.message.embeds[0]);

	const status =
		participantSet.size === MAX_PARTICIPANTS
			? STATUS_MESSAGES.READY
			: STATUS_MESSAGES.OPEN;
	updateEmbedField(embed, 'Status', status);

	updateEmbedFieldByMatch(
		embed,
		'Participants',
		`Participants (${participantSet.size})`,
		Array.from(participantSet)
			.map((p) => `- ${p}`)
			.join('\n'),
	);

	await interaction.message.edit({ embeds: [embed] });

	const timeElapsed = Date.now() - timerData.startTime;
	const timeIsUpOrNotSet =
		timerData.duration === 0 || timeElapsed >= timerData.duration;

	if (participantSet.size === MAX_PARTICIPANTS && timeIsUpOrNotSet) {
		await startEvent(interaction.message, participantSet);
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

function userIdsFromMentions(mentions: Set<string>) {
	return Array.from(mentions.values()).map((mention) =>
		mention.replace(/[<@>]/g, ''),
	);
}

function getPingsForServer(
	interaction: ChatInputCommandInteraction,
): string | null {
	if (!interaction.guild) return null;

	const roles = interaction.guild.roles.cache.filter((role) =>
		PING_ROLE_NAMES.includes(role.name),
	);

	if (roles.size === 0) return null;

	return roles.map((role) => `||<@&${role.id}>||`).join(' ');
}

client.login(botToken);
