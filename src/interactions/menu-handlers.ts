import type { GuildMember, StringSelectMenuInteraction } from 'discord.js';
import { DEFAULT_ROLE_KEY, ROLE_KEYS, type RoleKey } from '../constants.js';
import type { EventManager } from '../event/event-manager.js';
import { resolveLocale, t } from '../i18n/index.js';
import { ErrorSeverity, handleError } from '../utils/error-handler.js';
import {
	getExcaliburRankOfUser,
	safeReplyToInteraction,
} from '../utils/helpers.js';

export async function handleRoleSelection(
	interaction: StringSelectMenuInteraction,
	eventManager: EventManager,
) {
	const dict = t(resolveLocale(interaction.locale));

	try {
		const messageId = interaction.message.id;
		const userId = interaction.user.id;
		const participantMap = eventManager.getParticipants(messageId);

		if (!participantMap) return;

		await interaction.deferUpdate();

		if (!participantMap.has(userId)) {
			await interaction.followUp({
				content: dict.errors.notSignedUp,
				flags: ['Ephemeral'],
			});
			return;
		}

		const selectedValue = interaction.values[0];
		const selectedRole: RoleKey = (ROLE_KEYS as readonly string[]).includes(
			selectedValue,
		)
			? (selectedValue as RoleKey)
			: DEFAULT_ROLE_KEY;

		eventManager.addParticipant(messageId, userId, {
			userId: userId,
			role: selectedRole,
			rank: getExcaliburRankOfUser(
				interaction.guild?.id,
				interaction.member as GuildMember,
			),
		});

		const timerData = eventManager.getTimer(messageId);

		if (!timerData) return;

		eventManager.queueUpdate(messageId);
	} catch (error) {
		handleError({
			reason: 'Error handling role selection',
			severity: ErrorSeverity.MEDIUM,
			error,
			metadata: {
				userId: interaction.user.id,
				messageId: interaction.message.id,
			},
		});

		await safeReplyToInteraction(interaction, dict.errors.roleUpdateError);
	}
}
