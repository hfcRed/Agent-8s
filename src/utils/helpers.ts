import type {
	ButtonInteraction,
	ChatInputCommandInteraction,
	Guild,
	GuildMember,
	StringSelectMenuInteraction,
} from 'discord.js';
import {
	ApplicationCommandPermissionType,
	PermissionFlagsBits,
} from 'discord.js';
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

const permissionsCache = new Map();
const CACHE_DURATION = 60 * 5 * 1000;

export function clearPermissionsCache() {
	permissionsCache.clear();
}

export async function checkCommandPermissions(guild: Guild, channelId: string) {
	try {
		const cacheKey = `${guild.id}-${channelId}`;
		const cached = permissionsCache.get(cacheKey);

		if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
			return cached.data;
		}

		const allPermissions = await guild.commands.permissions.fetch({});
		if (allPermissions.size === 0) {
			permissionsCache.set(cacheKey, { data: false, timestamp: Date.now() });
			return false;
		}

		const permissions = Array.from(allPermissions)[0][1];
		let isChannelAllowed = false;

		const channels = permissions.filter(
			(perm) =>
				perm.type === ApplicationCommandPermissionType.Channel &&
				perm.permission === true,
		);

		if (channels.length === 0) {
			isChannelAllowed = false;
		}

		channels.forEach((channelPerm) => {
			if (channelPerm.id === channelId) {
				isChannelAllowed = true;
			}
		});

		permissionsCache.set(cacheKey, {
			data: isChannelAllowed,
			timestamp: Date.now(),
		});
		return isChannelAllowed;
	} catch (error) {
		console.error('Error checking command permissions:', error);
		return false;
	}
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
