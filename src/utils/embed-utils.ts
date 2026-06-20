import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	EmbedBuilder,
	StringSelectMenuBuilder,
	StringSelectMenuOptionBuilder,
} from 'discord.js';
import { COLORS, DEFAULT_ROLE_KEY, ROLE_KEYS, TIMINGS } from '../constants.js';
import { isBilingual } from '../i18n/bilingual.js';
import type { Dictionary } from '../i18n/index.js';
import { getEmoteForRank } from './helpers.js';

export function createEventEmbed(
	guildId: string | null | undefined,
	rankId: string | null,
	username: string,
	avatarUrl: string,
	userId: string,
	casual: boolean,
	dict: Dictionary,
	timeInMinutes?: number,
	info?: string,
) {
	const startTime = Date.now();
	const embedFields = [
		{
			name: dict.fields.participantsCount(1),
			value: `- ${getEmoteForRank(guildId, rankId)}<@${userId}> 👑${isBilingual(dict) ? '\n' : ''}`,
			inline: true,
		},
		{
			name: dict.fields.role,
			value: `- ${dict.roles[DEFAULT_ROLE_KEY]}`,
			inline: true,
		},
		{
			name: dict.fields.start,
			value: timeInMinutes
				? dict.start.atTime(startTime + timeInMinutes * TIMINGS.MINUTE_IN_MS)
				: dict.start.whenFull,
		},
		{ name: dict.fields.status, value: dict.status.open },
	];
	const embed = new EmbedBuilder()
		.setAuthor({
			name: username,
			iconURL: avatarUrl,
		})
		.setTitle(casual ? dict.titles.casual : dict.titles.competitive)
		.addFields(embedFields)
		.setColor(COLORS.OPEN);

	if (info) embed.setDescription(info);

	return embed;
}

export function createEventButtons(dict: Dictionary, timeInMinutes?: number) {
	const buttons = [
		new ButtonBuilder()
			.setEmoji('📝')
			.setCustomId('signup')
			.setLabel(dict.buttons.signUp)
			.setStyle(ButtonStyle.Primary),
		new ButtonBuilder()
			.setEmoji('🚪')
			.setCustomId('signout')
			.setLabel(dict.buttons.signOut)
			.setStyle(ButtonStyle.Danger),
		new ButtonBuilder()
			.setEmoji('❌')
			.setCustomId('cancel')
			.setLabel(dict.buttons.cancelEvent)
			.setStyle(ButtonStyle.Secondary),
	];

	if (timeInMinutes) {
		buttons.push(
			new ButtonBuilder()
				.setEmoji('▶️')
				.setCustomId('startnow')
				.setLabel(dict.buttons.startNow)
				.setStyle(ButtonStyle.Success),
		);
	}

	return new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons);
}

export function createEventStartedButtons(
	dict: Dictionary,
	spectators: boolean = false,
) {
	const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setEmoji('📝')
			.setCustomId('dropin')
			.setLabel(dict.buttons.dropIn)
			.setStyle(ButtonStyle.Primary),
		new ButtonBuilder()
			.setEmoji('🚪')
			.setCustomId('dropout')
			.setLabel(dict.buttons.dropOut)
			.setStyle(ButtonStyle.Danger),
		new ButtonBuilder()
			.setEmoji('⏳')
			.setCustomId('joinqueue')
			.setLabel(dict.buttons.joinQueue)
			.setStyle(ButtonStyle.Secondary),
		new ButtonBuilder()
			.setEmoji('❌')
			.setCustomId('leavequeue')
			.setLabel(dict.buttons.leaveQueue)
			.setStyle(ButtonStyle.Secondary),
		new ButtonBuilder()
			.setEmoji('🏁')
			.setCustomId('finish')
			.setLabel(dict.buttons.finishEvent)
			.setStyle(ButtonStyle.Success),
	);

	if (!spectators) return [row1];

	const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setEmoji('👁️')
			.setCustomId('spectate')
			.setLabel(dict.buttons.spectate)
			.setStyle(ButtonStyle.Secondary),
		new ButtonBuilder()
			.setEmoji('🚫')
			.setCustomId('stopspectating')
			.setLabel(dict.buttons.stopSpectating)
			.setStyle(ButtonStyle.Secondary),
	);

	return [row1, row2];
}

export function createRoleSelectMenu(dict: Dictionary) {
	const select = new StringSelectMenuBuilder()
		.setCustomId('select')
		.setPlaceholder(dict.select.placeholder)
		.addOptions(
			ROLE_KEYS.map((key) => {
				const [primary, secondary] = dict.roles[key].split('\n- ');
				return new StringSelectMenuOptionBuilder()
					.setLabel(secondary ? `${primary} (${secondary})` : primary)
					.setValue(key);
			}),
		);

	return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
}
