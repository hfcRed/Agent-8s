import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ChannelType,
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

const MAX_PARTICIPANTS = 2;

const parsed = dotenv.config();
const token = parsed.parsed?.BOT_TOKEN;

if (!token) {
	console.error('BOT_TOKEN not found in .env file');
	process.exit(1);
}

const client = new Client({
	intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

const participants = new Map<string, Set<string>>();
const eventCreators = new Map<string, string>();
const eventTimers = new Map<
	string,
	{ startTime: number; duration: number; hasStarted: boolean }
>();
const eventThreads = new Map<string, string>();

async function startEvent(message: Message, participantSet: Set<string>) {
	const timerData = eventTimers.get(message.id);
	if (!timerData || timerData.hasStarted) return;
	timerData.hasStarted = true;

	const finishButton = new ButtonBuilder()
		.setEmoji('🏁')
		.setCustomId('finish')
		.setLabel('Finish Event')
		.setStyle(ButtonStyle.Success);

	const row = new ActionRowBuilder<ButtonBuilder>().addComponents(finishButton);

	const embed = EmbedBuilder.from(message.embeds[0]);
	const existingFields = embed.data.fields || [];

	existingFields.forEach((field) => {
		if (field.name === 'Status') {
			field.value = '✅ Event Started!';
		}
		if (field.name === 'Start') {
			field.value = `<t:${Math.floor(Date.now() / 1000)}:R>`;
		}
	});

	embed.setColor('#1cff5c');
	embed.setFields(existingFields);
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

	const userIds = Array.from(participantSet).map((mention) =>
		mention.replace(/[<@>]/g, ''),
	);

	for (const id of userIds) {
		await thread.members.add(id);
	}
}

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

const rest = new REST({ version: '10' }).setToken(token);

client.once('clientReady', async () => {
	if (!client.user) return;

	await rest.put(Routes.applicationCommands(client.user.id), {
		body: commands,
	});
});

client.on('interactionCreate', async (interaction) => {
	if (interaction.isChatInputCommand()) {
		if (interaction.commandName === 'create') {
			for (const [_, participantSet] of participants.entries()) {
				if (participantSet.has(`<@${interaction.user.id}>`)) {
					await interaction.reply({
						content:
							'You are already signed up for an event. Please sign out, cancel, or wait for the event to finish before joining a new one.',
						flags: ['Ephemeral'],
					});
					return;
				}
			}

			const timeInMinutes = interaction.options.getInteger('time', false);
			const startTime = Date.now();

			const buttons = [];

			buttons.push(
				new ButtonBuilder()
					.setEmoji('📝')
					.setCustomId('signup')
					.setLabel('Sign Up')
					.setStyle(ButtonStyle.Primary),
			);

			buttons.push(
				new ButtonBuilder()
					.setEmoji('🚪')
					.setCustomId('signout')
					.setLabel('Sign Out')
					.setStyle(ButtonStyle.Danger),
			);

			buttons.push(
				new ButtonBuilder()
					.setEmoji('❌')
					.setCustomId('cancel')
					.setLabel('Cancel Event')
					.setStyle(ButtonStyle.Secondary),
			);

			if (timeInMinutes) {
				buttons.push(
					new ButtonBuilder()
						.setEmoji('▶️')
						.setCustomId('startnow')
						.setLabel('Start Now')
						.setStyle(ButtonStyle.Success),
				);
			}

			const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
				...buttons,
			);

			const embedFields = [
				{ name: 'Participants (1)', value: `<@${interaction.user.id}>` },
			];

			embedFields.push({
				name: 'Start',
				value: timeInMinutes
					? `<t:${Math.floor((startTime + timeInMinutes * 60 * 1000) / 1000)}:R>`
					: 'When 8 players have signed up',
			});

			embedFields.push({
				name: 'Status',
				value: '🟢 Open for sign ups',
			});

			const embed = new EmbedBuilder()
				.setAuthor({
					name: interaction.user.username,
					iconURL: interaction.user.displayAvatarURL(),
				})
				.setTitle('8s Sign Up')
				.addFields(embedFields)
				.setColor('#626CE9');

			const reply = await interaction.reply({
				embeds: [embed],
				components: [row],
			});
			const message = await reply.fetch();

			participants.set(message.id, new Set([`<@${interaction.user.id}>`]));
			eventCreators.set(message.id, interaction.user.id);
			eventTimers.set(message.id, {
				startTime,
				duration: timeInMinutes ? timeInMinutes * 60 * 1000 : 0,
				hasStarted: false,
			});

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
							const existingFields = embed.data.fields || [];

							existingFields.forEach((field) => {
								if (field.name === 'Start') {
									field.value = 'When 8 players have signed up';
								}
							});

							embed.setFields(existingFields);
							await message.edit({ embeds: [embed] });
						}
					},
					timeInMinutes * 60 * 1000,
				);
			}
		}
	}

	if (interaction.isButton()) {
		const messageId = interaction.message.id;
		const userId = interaction.user.id;

		const participantSet = participants.get(messageId);
		const timerData = eventTimers.get(messageId);
		const creatorId = eventCreators.get(messageId);

		if (!participantSet || !timerData || !creatorId) return;

		if (interaction.customId === 'startnow') {
			if (userId !== creatorId) {
				await interaction.reply({
					content: 'Only the event creator can start the event.',
					flags: ['Ephemeral'],
				});
				return;
			}

			if (participantSet.size !== MAX_PARTICIPANTS) {
				await interaction.deferUpdate();
				return;
			}

			await startEvent(interaction.message, participantSet);
			return;
		}

		if (interaction.customId === 'cancel') {
			if (userId !== creatorId) {
				await interaction.reply({
					content: 'Only the event creator can cancel this event.',
					flags: ['Ephemeral'],
				});
				return;
			}

			participants.delete(messageId);
			eventTimers.delete(messageId);
			eventCreators.delete(messageId);

			const embed = EmbedBuilder.from(interaction.message.embeds[0]);
			const existingFields = embed.data.fields || [];

			existingFields.forEach((field) => {
				if (field.name === 'Status') {
					field.value = '❌ Event cancelled';
				}
			});

			embed.setColor('#ff1c1c');
			embed.setFields(existingFields);
			await interaction.message.edit({ embeds: [embed], components: [] });
			await interaction.deferUpdate();
			return;
		}

		if (interaction.customId === 'finish') {
			if (userId !== creatorId) {
				await interaction.reply({
					content: 'Only the event creator can finish this event.',
					flags: ['Ephemeral'],
				});

				return;
			}

			participants.delete(messageId);
			eventTimers.delete(messageId);
			eventCreators.delete(messageId);

			const threadId = eventThreads.get(messageId);
			const channel = interaction.channel as TextChannel | null;
			if (threadId && channel) {
				const thread = await channel.threads.fetch(threadId);
				if (thread) {
					await thread.setLocked(true);
					await thread.setArchived(true);
				}
			}

			const embed = EmbedBuilder.from(interaction.message.embeds[0]);
			const existingFields = embed.data.fields || [];
			existingFields.forEach((field) => {
				if (field.name === 'Status') {
					field.value = '🏁 Event Finished';
				}
			});

			embed.setColor('#ff1c1c');
			embed.setFields(existingFields);
			await interaction.message.edit({ embeds: [embed], components: [] });
			await interaction.deferUpdate();
			return;
		}

		if (interaction.customId === 'signup') {
			if (participantSet.size >= 8 && !participantSet.has(`<@${userId}>`)) {
				await interaction.deferUpdate();
				return;
			}

			for (const [_, participantSet] of participants.entries()) {
				if (participantSet.has(`<@${interaction.user.id}>`)) {
					await interaction.reply({
						content:
							'You are already signed up for an event. Please sign out, cancel, or wait for the event to finish before joining a new one.',
						flags: ['Ephemeral'],
					});
					return;
				}
			}

			participantSet.add(`<@${userId}>`);
		}

		if (interaction.customId === 'signout') {
			if (userId === creatorId) {
				await interaction.reply({
					content:
						'The event creator cannot sign out. Please cancel the event instead.',
					flags: ['Ephemeral'],
				});
				return;
			}

			participantSet.delete(`<@${userId}>`);
		}

		await interaction.deferUpdate();

		const embed = EmbedBuilder.from(interaction.message.embeds[0]);
		const existingFields = embed.data.fields || [];

		existingFields.forEach((field) => {
			if (field.name === 'Status') {
				field.value =
					participantSet.size === MAX_PARTICIPANTS
						? '✅ Ready to Start!'
						: '🟢 Open for Sign Ups';
			}
			if (field.name.includes('Participants')) {
				field.name = `Participants (${participantSet.size})`;
				field.value = Array.from(participantSet).join('\n');
			}
		});

		embed.setFields(existingFields);
		await interaction.message.edit({ embeds: [embed] });

		const timeElapsed = Date.now() - timerData.startTime;
		const timeIsUpOrNotSet =
			timerData.duration === 0 || timeElapsed >= timerData.duration;

		if (participantSet.size === MAX_PARTICIPANTS && timeIsUpOrNotSet) {
			await startEvent(interaction.message, participantSet);
		}
	}
});

client.login(token);
