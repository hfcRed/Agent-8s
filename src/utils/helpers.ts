import type {
	ButtonInteraction,
	ChatInputCommandInteraction,
	GuildMember,
	StringSelectMenuInteraction,
} from 'discord.js';
import { PermissionFlagsBits } from 'discord.js';
import {
	ADMIN_PERMISSIONS,
	EXCALIBUR_GUILD_ID,
	EXCALIBUR_RANKS,
	PING_ROLE_NAMES,
} from '../constants.js';

export function isUserAdmin(member: GuildMember) {
	return ADMIN_PERMISSIONS.some((permission) =>
		member.permissions.has(PermissionFlagsBits[permission]),
	);
}

export function getPingsForServer(
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

export function getExcaliburRankOfUser(
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
