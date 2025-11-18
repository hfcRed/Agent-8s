import type {
	ButtonInteraction,
	ChatInputCommandInteraction,
	Client,
	GuildMember,
	GuildTextBasedChannel,
	PermissionResolvable,
	RepliableInteraction,
	StringSelectMenuInteraction,
	TextBasedChannel,
} from 'discord.js';
import { PermissionFlagsBits } from 'discord.js';
import {
	ADMIN_PERMISSIONS,
	ERROR_MESSAGES,
	EXCALIBUR_GUILD_ID,
	EXCALIBUR_RANKS,
	PING_ROLE_NAMES,
	PROCESSING_MESSAGES,
} from '../constants.js';
import type { EventManager } from '../event/event-manager.js';
import { ErrorSeverity, handleError } from './error-handler.js';

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

export function botHasPermission(
	permission: PermissionResolvable,
	client: Client,
	channel: GuildTextBasedChannel | TextBasedChannel | null,
) {
	const bot = client.user;

	if (!bot || !channel || !channel.isTextBased() || channel.isDMBased())
		return false;

	const botPermissions = channel.permissionsFor(bot);
	if (!botPermissions || !botPermissions.has(permission)) return false;

	return true;
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

export async function safeReplyToInteraction(
	interaction: RepliableInteraction,
	content: string,
) {
	try {
		if (interaction.replied || interaction.deferred) {
			await interaction.followUp({
				content,
				flags: ['Ephemeral'],
			});
		} else {
			await interaction.reply({
				content,
				flags: ['Ephemeral'],
			});
		}
	} catch (error) {
		handleError({
			reason: 'Failed to send error message to user',
			severity: ErrorSeverity.LOW,
			error,
		});
	}
}

export async function checkProcessingStates(
	messageId: string,
	eventManager: EventManager,
	interaction?: ButtonInteraction | ChatInputCommandInteraction,
) {
	if (eventManager.isProcessing(messageId, 'starting')) {
		if (interaction) {
			await safeReplyToInteraction(
				interaction,
				PROCESSING_MESSAGES.STILL_STARTING,
			);
		}
		return true;
	}
	if (eventManager.isProcessing(messageId, 'finishing')) {
		if (interaction) {
			await safeReplyToInteraction(
				interaction,
				PROCESSING_MESSAGES.ALREADY_FINISHING,
			);
		}
		return true;
	}

	if (eventManager.isProcessing(messageId, 'cancelling')) {
		if (interaction) {
			await safeReplyToInteraction(
				interaction,
				PROCESSING_MESSAGES.ALREADY_CANCELLING,
			);
		}
		return true;
	}

	if (eventManager.isProcessing(messageId, 'cleanup')) {
		if (interaction) {
			await safeReplyToInteraction(
				interaction,
				PROCESSING_MESSAGES.CLEANING_UP,
			);
		}
		return true;
	}

	if (
		interaction &&
		'message' in interaction &&
		eventManager.isEventFinalizing(interaction.message)
	) {
		await safeReplyToInteraction(interaction, ERROR_MESSAGES.EVENT_FINALIZING);
		return true;
	}

	return false;
}
