import type { GuildMember, StringSelectMenuInteraction } from 'discord.js';
import { EmbedBuilder } from 'discord.js';
import { ERROR_MESSAGES } from '../constants.js';
import type { EventManager } from '../event/event-manager.js';
import { updateParticipantFields } from '../utils/embed-utils.js';
import { ErrorSeverity, handleError } from '../utils/error-handler.js';
import {
	getExcaliburRankOfUser,
	safeReplyToInteraction,
} from '../utils/helpers.js';

export async function handleRoleSelection(
	interaction: StringSelectMenuInteraction,
	eventManager: EventManager,
) {
	try {
		const messageId = interaction.message.id;
		const userId = interaction.user.id;
		const participantMap = eventManager.getParticipants(messageId);

		if (!participantMap) return;

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

		const embed = EmbedBuilder.from(interaction.message.embeds[0]);

		updateParticipantFields(embed, participantMap);

		await interaction.editReply({ embeds: [embed] });
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

		await safeReplyToInteraction(interaction, ERROR_MESSAGES.ROLE_UPDATE_ERROR);
	}
}
