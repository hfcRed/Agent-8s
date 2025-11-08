import { randomUUID } from 'node:crypto';
import type { ChatInputCommandInteraction } from 'discord.js';
import { ERROR_MESSAGES, TIMINGS, WEAPON_ROLES } from '../constants.js';
import { createEventStartTimeout } from '../event/event-lifecycle.js';
import type { EventManager } from '../event/event-manager.js';
import type { ThreadManager } from '../managers/thread-manager.js';
import type { VoiceChannelManager } from '../managers/voice-channel-manager.js';
import type { TelemetryService } from '../telemetry/telemetry.js';
import {
	createEventButtons,
	createEventEmbed,
	createRoleSelectMenu,
} from '../utils/embed-utils.js';
import { getExcaliburRankOfUser, getPingsForServer } from '../utils/helpers.js';

export async function handleCreateCommand(
	interaction: ChatInputCommandInteraction,
	eventManager: EventManager,
	threadManager: ThreadManager,
	voiceChannelManager: VoiceChannelManager,
	telemetry?: TelemetryService,
) {
	if (eventManager.isUserInAnyEvent(interaction.user.id)) {
		await interaction.reply({
			content: ERROR_MESSAGES.ALREADY_SIGNED_UP,
			flags: ['Ephemeral'],
		});
		return;
	}

	const casual = !!interaction.options.getBoolean('casual', false);
	const info = interaction.options.getString('info', false) ?? undefined;
	const timeInMinutes =
		interaction.options.getInteger('time', false) ?? undefined;
	const startTime = Date.now();

	const buttonRow = createEventButtons(timeInMinutes);
	const selectRow = createRoleSelectMenu();

	const embed = createEventEmbed(
		interaction.user.username,
		interaction.user.displayAvatarURL(),
		interaction.user.id,
		casual,
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

	eventManager.setParticipants(
		message.id,
		new Map([
			[
				interaction.user.id,
				{
					userId: interaction.user.id,
					role: WEAPON_ROLES[0],
					rank: getExcaliburRankOfUser(interaction),
				},
			],
		]),
	);
	eventManager.setCreator(message.id, interaction.user.id);
	eventManager.setTimer(message.id, {
		startTime,
		duration: timeInMinutes ? timeInMinutes * TIMINGS.MINUTE_IN_MS : undefined,
		hasStarted: false,
	});
	eventManager.setMatchId(message.id, matchId);
	eventManager.setChannelId(message.id, message.channelId);
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
}
