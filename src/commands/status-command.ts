import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { COLORS, TIME_UNITS } from '../constants.js';
import type { EventManager } from '../event/event-manager.js';
import { type Dictionary, resolveLocale, t } from '../i18n/index.js';
import type {
	TelemetryService,
	TelemetryStatus,
} from '../telemetry/telemetry.js';
import { ErrorSeverity, handleError } from '../utils/error-handler.js';
import { safeReplyToInteraction } from '../utils/helpers.js';

const BOT_START_TIME = Date.now();
const BOT_VERSION = getBotVersion();

function getBotVersion() {
	try {
		const versionPath = join(process.cwd(), '.version');
		return readFileSync(versionPath, 'utf-8').trim();
	} catch {
		return 'unknown';
	}
}

export async function handleStatusCommand(
	interaction: ChatInputCommandInteraction,
	eventManager: EventManager,
	telemetry?: TelemetryService,
) {
	const dict = t(resolveLocale(interaction.locale));

	try {
		await interaction.deferReply({ flags: ['Ephemeral'] });

		const uptime = Date.now() - BOT_START_TIME;
		const memoryUsage = process.memoryUsage();
		const guildCount = interaction.client.guilds.cache.size;
		const nodeVersion = process.version;

		let activeEventsCount = 0;
		let totalParticipants = 0;
		for (const [_, participants] of eventManager.getAllParticipants()) {
			activeEventsCount++;
			totalParticipants += participants.size;
		}

		const embed = new EmbedBuilder()
			.setColor(COLORS.STATUS)
			.setTitle(dict.statusCommand.title)
			.addFields(
				{
					name: dict.statusCommand.version,
					value: BOT_VERSION,
					inline: true,
				},
				{
					name: dict.statusCommand.node,
					value: nodeVersion,
					inline: true,
				},
				{
					name: dict.statusCommand.guilds,
					value: `${guildCount}`,
					inline: true,
				},
				{
					name: dict.statusCommand.uptime,
					value: formatUptime(uptime),
					inline: true,
				},
				{
					name: dict.statusCommand.ping,
					value: `${interaction.client.ws.ping}ms`,
					inline: true,
				},
				{
					name: dict.statusCommand.telemetry,
					value: formatTelemetryStatus(dict, telemetry?.getStatus?.()),
					inline: true,
				},
				{
					name: dict.statusCommand.activeEvents,
					value: `${activeEventsCount}`,
					inline: true,
				},
				{
					name: dict.statusCommand.totalParticipants,
					value: `${totalParticipants}`,
					inline: true,
				},
				{
					name: dict.statusCommand.memoryUsage,
					value: [
						`RSS: ${formatMemoryUsage(memoryUsage.rss)}`,
						`Heap: ${formatMemoryUsage(memoryUsage.heapUsed)} / ${formatMemoryUsage(memoryUsage.heapTotal)}`,
					].join('\n'),
					inline: false,
				},
			);

		await interaction.editReply({
			embeds: [embed],
		});
	} catch (error) {
		handleError({
			reason: 'Error executing status command',
			severity: ErrorSeverity.MEDIUM,
			error,
			metadata: {
				userId: interaction.user.id,
				guildId: interaction.guildId || 'unknown',
			},
		});

		await safeReplyToInteraction(interaction, dict.errors.statusError);
	}
}

function formatUptime(milliseconds: number) {
	const units = [
		{ label: 'd', value: Math.floor(milliseconds / TIME_UNITS.DAY_IN_MS) },
		{
			label: 'h',
			value: Math.floor((milliseconds / TIME_UNITS.HOUR_IN_MS) % 24),
		},
		{
			label: 'm',
			value: Math.floor((milliseconds / TIME_UNITS.MINUTE_IN_MS) % 60),
		},
		{
			label: 's',
			value: Math.floor((milliseconds / TIME_UNITS.SECOND_IN_MS) % 60),
		},
	];

	return (
		units
			.filter((unit) => unit.value > 0)
			.map((unit) => `${unit.value}${unit.label}`)
			.join(' ') || '0s'
	);
}

function formatMemoryUsage(bytes: number) {
	const mb = bytes / 1024 / 1024;
	return `${mb.toFixed(2)} MB`;
}

function formatTelemetryStatus(dict: Dictionary, status?: TelemetryStatus) {
	if (!status) return dict.statusCommand.telemetryDisabled;
	if (status.remoteEnabled && status.databaseEnabled)
		return dict.statusCommand.telemetryHttpDb;
	if (status.remoteEnabled) return dict.statusCommand.telemetryHttp;
	if (status.databaseEnabled) return dict.statusCommand.telemetryDb;
	return dict.statusCommand.telemetryDisabled;
}
