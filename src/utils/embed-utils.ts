import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	EmbedBuilder,
	StringSelectMenuBuilder,
	StringSelectMenuOptionBuilder,
} from 'discord.js';
import {
	COLORS,
	FIELD_NAMES,
	PARTICIPANT_FIELD_NAME,
	START_MESSAGES,
	STATUS_MESSAGES,
	TIMINGS,
	TITLES,
	WEAPON_ROLES,
} from '../constants.js';

export function createEventEmbed(
	username: string,
	avatarUrl: string,
	userId: string,
	casual: boolean,
	timeInMinutes?: number,
	info?: string,
) {
	const startTime = Date.now();
	const embedFields = [
		{
			name: PARTICIPANT_FIELD_NAME(1),
			value: `- <@${userId}>`,
			inline: true,
		},
		{
			name: FIELD_NAMES.ROLE,
			value: `- ${WEAPON_ROLES[0]}`,
			inline: true,
		},
		{
			name: FIELD_NAMES.START,
			value: timeInMinutes
				? START_MESSAGES.AT_TIME(
						startTime + timeInMinutes * TIMINGS.MINUTE_IN_MS,
					)
				: START_MESSAGES.WHEN_FULL,
		},
		{ name: FIELD_NAMES.STATUS, value: STATUS_MESSAGES.OPEN },
	];
	const embed = new EmbedBuilder()
		.setAuthor({
			name: username,
			iconURL: avatarUrl,
		})
		.setTitle(casual ? TITLES.CASUAL : TITLES.COMPETITIVE)
		.addFields(embedFields)
		.setColor(COLORS.OPEN);

	if (info) embed.setDescription(info);

	return embed;
}

export function createEventButtons(timeInMinutes?: number) {
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

	return new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons);
}

export function createEventStartedButtons() {
	return new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setEmoji('📝')
			.setCustomId('dropin')
			.setLabel('Drop In')
			.setStyle(ButtonStyle.Primary),
		new ButtonBuilder()
			.setEmoji('🚪')
			.setCustomId('dropout')
			.setLabel('Drop Out')
			.setStyle(ButtonStyle.Danger),
		new ButtonBuilder()
			.setEmoji('⏳')
			.setCustomId('joinqueue')
			.setLabel('Join Queue')
			.setStyle(ButtonStyle.Secondary),
		new ButtonBuilder()
			.setEmoji('❌')
			.setCustomId('leavequeue')
			.setLabel('Leave Queue')
			.setStyle(ButtonStyle.Secondary),
		new ButtonBuilder()
			.setEmoji('🏁')
			.setCustomId('finish')
			.setLabel('Finish Event')
			.setStyle(ButtonStyle.Success),
	);
}

export function createRoleSelectMenu() {
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

	return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
}
