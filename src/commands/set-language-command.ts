import type { ChatInputCommandInteraction, GuildMember } from 'discord.js';
import type { GuildConfigStore } from '../config/guild-config-store.js';
import { getEventDictionary } from '../i18n/bilingual.js';
import { isLocale, resolveLocale, t } from '../i18n/index.js';
import { ErrorSeverity, handleError } from '../utils/error-handler.js';
import { isUserAdmin, safeReplyToInteraction } from '../utils/helpers.js';

export async function handleSetLanguageCommand(
	interaction: ChatInputCommandInteraction,
	guildConfig?: GuildConfigStore,
) {
	const dict = t(resolveLocale(interaction.locale));

	try {
		await interaction.deferReply({ flags: ['Ephemeral'] });

		const guildId = interaction.guildId;
		if (!guildId) {
			await interaction.editReply({ content: dict.errors.noBotPermissions });
			return;
		}

		if (!isUserAdmin(interaction.member as GuildMember)) {
			await interaction.editReply({ content: dict.errors.adminOnly });
			return;
		}

		if (!guildConfig) {
			await interaction.editReply({ content: dict.errors.configUnavailable });
			return;
		}

		const selected = interaction.options.getString('language', true);
		if (!isLocale(selected)) {
			await interaction.editReply({ content: dict.errors.setLanguageError });
			return;
		}

		const secondInput = interaction.options.getString('language_second', false);
		const secondLocale =
			secondInput && isLocale(secondInput) && secondInput !== selected
				? secondInput
				: undefined;

		await guildConfig.setLocale(guildId, selected, secondLocale);

		await interaction.editReply({
			content: getEventDictionary(selected, secondLocale).success.languageSet,
		});
	} catch (error) {
		handleError({
			reason: 'Error executing set-language command',
			severity: ErrorSeverity.MEDIUM,
			error,
			metadata: {
				userId: interaction.user.id,
				guildId: interaction.guildId || 'unknown',
			},
		});

		await safeReplyToInteraction(interaction, dict.errors.setLanguageError);
	}
}
