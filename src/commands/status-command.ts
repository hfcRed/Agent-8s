import { type ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import type { EventManager } from '../event/event-manager.js';
import type { TelemetryService } from '../telemetry/telemetry.js';
import { ErrorSeverity, handleError } from '../utils/error-handler.js';
import { safeReplyToInteraction } from '../utils/helpers.js';

const BOT_START_TIME = Date.now();
const BOT_VERSION = process.env.npm_package_version || 'unknown';

export async function handleStatusCommand(
	interaction: ChatInputCommandInteraction,
	eventManager: EventManager,
	telemetry?: TelemetryService,
) {
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
			.setColor(0x5865f2)
			.setTitle('Bot Status')
			.addFields(
				{
					name: '📦 Version',
					value: BOT_VERSION,
					inline: true,
				},
				{
					name: '🟢 Node.js',
					value: nodeVersion,
					inline: true,
				},
				{
					name: '🌐 Guilds',
					value: `${guildCount}`,
					inline: true,
				},
				{
					name: '⏱️ Uptime',
					value: formatUptime(uptime),
					inline: true,
				},
				{
					name: '🏓 Ping',
					value: `${interaction.client.ws.ping}ms`,
					inline: true,
				},
				{
					name: '🔔 Telemetry',
					value: telemetry ? '✅ Enabled' : '❌ Disabled',
					inline: true,
				},
				{
					name: '📊 Active Events',
					value: `${activeEventsCount}`,
					inline: true,
				},
				{
					name: '👥 Total Participants',
					value: `${totalParticipants}`,
					inline: true,
				},
				{
					name: '💾 Memory Usage',
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

		await safeReplyToInteraction(
			interaction,
			'An error occurred while fetching bot status.',
		);
	}
}

function formatUptime(milliseconds: number) {
	const units = [
		{ label: 'd', value: Math.floor(milliseconds / 86400000) },
		{ label: 'h', value: Math.floor((milliseconds / 3600000) % 24) },
		{ label: 'm', value: Math.floor((milliseconds / 60000) % 60) },
		{ label: 's', value: Math.floor((milliseconds / 1000) % 60) },
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
