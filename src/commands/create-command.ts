import { randomUUID } from 'node:crypto';
import type { ChatInputCommandInteraction, GuildMember } from 'discord.js';
import { DEFAULT_ROLE_KEY, TIMINGS } from '../constants.js';
import { createEventStartTimeout } from '../event/event-lifecycle.js';
import type { EventManager } from '../event/event-manager.js';
import { resolveLocale, t } from '../i18n/index.js';
import type { ThreadManager } from '../managers/thread-manager.js';
import type { VoiceChannelManager } from '../managers/voice-channel-manager.js';
import type { TelemetryService } from '../telemetry/telemetry.js';
import {
	createEventButtons,
	createEventEmbed,
	createRoleSelectMenu,
} from '../utils/embed-utils.js';
import { ErrorSeverity, handleError } from '../utils/error-handler.js';
import {
	getExcaliburRankOfUser,
	getPingsForServer,
	safeReplyToInteraction,
} from '../utils/helpers.js';

export async function handleCreateCommand(
	interaction: ChatInputCommandInteraction,
	eventManager: EventManager,
	threadManager: ThreadManager,
	voiceChannelManager: VoiceChannelManager,
	telemetry?: TelemetryService,
) {
	const dict = t(resolveLocale(interaction.locale));

	try {
		if (eventManager.isUserInAnyEvent(interaction.user.id)) {
			await interaction.reply({
				content: dict.errors.alreadySignedUp,
				flags: ['Ephemeral'],
			});
			return;
		}

		const locale = resolveLocale(interaction.guildLocale);

		const casual = !!interaction.options.getBoolean('casual', false);
		const spectators = !!interaction.options.getBoolean('spectators', false);
		const info = interaction.options.getString('info', false) ?? undefined;
		const timeInMinutes =
			interaction.options.getInteger('time', false) ?? undefined;
		const startTime = Date.now();

		const buttonRow = createEventButtons(locale, timeInMinutes);
		const selectRow = createRoleSelectMenu(locale);

		const rankId = getExcaliburRankOfUser(
			interaction.guild?.id,
			interaction.member as GuildMember,
		);

		const embed = createEventEmbed(
			interaction.guild?.id,
			rankId,
			interaction.user.username,
			interaction.user.displayAvatarURL(),
			interaction.user.id,
			casual,
			locale,
			timeInMinutes,
			info,
		);

		const rolePing = getPingsForServer(interaction, casual);

		const reply = await interaction.reply({
			content: rolePing || undefined,
			embeds: [embed],
			components: [buttonRow, selectRow],
		});
		const message = await reply.fetch();
		const matchId = randomUUID();

		eventManager.setCreator(message.id, interaction.user.id);
		eventManager.setMatchId(message.id, matchId);
		eventManager.setChannelId(message.id, message.channelId);
		eventManager.setMessageData(message.id, casual, spectators, info);
		eventManager.setLocale(message.id, locale);

		await eventManager.removeUserFromAllQueues(interaction.user.id, telemetry);

		eventManager.setTimer(message.id, {
			startTime,
			duration: timeInMinutes
				? timeInMinutes * TIMINGS.MINUTE_IN_MS
				: undefined,
			hasStarted: false,
		});

		eventManager.setParticipants(
			message.id,
			new Map([
				[
					interaction.user.id,
					{
						userId: interaction.user.id,
						role: DEFAULT_ROLE_KEY,
						rank: rankId,
					},
				],
			]),
		);

		if (interaction.guildId) {
			eventManager.setGuildId(message.id, interaction.guildId);
		}

		const participants = eventManager.getParticipants(message.id);
		telemetry?.trackEventCreated({
			guildId: interaction.guild?.id || 'unknown',
			eventId: message.id,
			userId: interaction.user.id,
			participants: Array.from((participants || new Map()).values()),
			channelId: interaction.channelId,
			matchId,
			timeToStart: timeInMinutes,
		});

		if (timeInMinutes) {
			createEventStartTimeout(
				message,
				timeInMinutes,
				eventManager,
				threadManager,
				voiceChannelManager,
				telemetry,
			);
		}
	} catch (error) {
		handleError({
			reason: 'Error executing create command',
			severity: ErrorSeverity.MEDIUM,
			error,
			metadata: {
				userId: interaction.user.id,
				guildId: interaction.guildId || 'unknown',
			},
		});

		await safeReplyToInteraction(interaction, dict.errors.createError);
	}
}
