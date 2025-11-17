import { faker } from '@faker-js/faker';
import type {
	APIEmbedField,
	ChatInputCommandInteraction,
	Client,
	InteractionReplyOptions,
} from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleStatusCommand } from '../commands/status-command.js';
import { EventManager } from '../event/event-manager.js';
import type { TelemetryService } from '../telemetry/telemetry.js';

// Helper function to extract embeds and fields from interaction reply
function getEmbedFields(call: unknown) {
	if (
		typeof call !== 'string' &&
		call &&
		typeof call === 'object' &&
		'embeds' in call
	) {
		const embed = (call as InteractionReplyOptions).embeds?.[0];
		if (embed && typeof embed === 'object') {
			// Check if it's an EmbedBuilder with data.fields
			if (
				'data' in embed &&
				embed.data &&
				typeof embed.data === 'object' &&
				'fields' in embed.data
			) {
				return embed.data.fields as APIEmbedField[];
			}
			// Check if it's a plain object with fields directly
			if ('fields' in embed) {
				return embed.fields as APIEmbedField[];
			}
		}
	}
	return undefined;
}

describe('handleStatusCommand', () => {
	let eventManager: EventManager;
	let telemetry: TelemetryService | undefined;
	let interaction: ChatInputCommandInteraction;

	beforeEach(() => {
		eventManager = new EventManager();
		telemetry = undefined;

		interaction = {
			client: {
				ws: { ping: 42 },
				guilds: {
					cache: {
						size: 5,
					},
				},
			} as Client,
			guild: { id: faker.string.uuid() },
			reply: vi.fn(),
			deferReply: vi.fn(async () => undefined),
			editReply: vi.fn(),
		} as unknown as ChatInputCommandInteraction;
	});

	it('should reply with status embed', async () => {
		await handleStatusCommand(interaction, eventManager, telemetry);

		expect(interaction.deferReply).toHaveBeenCalledWith({
			flags: ['Ephemeral'],
		});
		expect(interaction.editReply).toHaveBeenCalledWith({
			embeds: [
				expect.objectContaining({
					data: expect.objectContaining({
						title: 'Bot Status',
						color: 0x5865f2,
					}),
				}),
			],
		});
	});

	it('should show correct ping', async () => {
		await handleStatusCommand(interaction, eventManager, telemetry);

		const call = vi.mocked(interaction.editReply).mock.calls[0][0];
		const fields = getEmbedFields(call);
		const pingField = fields?.find((f: APIEmbedField) => f.name === '🏓 Ping');

		expect(pingField?.value).toBe('42ms');
	});

	it('should show telemetry as disabled when not provided', async () => {
		await handleStatusCommand(interaction, eventManager, undefined);

		const call = vi.mocked(interaction.editReply).mock.calls[0][0];
		const fields = getEmbedFields(call);
		const telemetryField = fields?.find(
			(f: APIEmbedField) => f.name === '🔔 Telemetry',
		);

		expect(telemetryField?.value).toBe('❌ Disabled');
	});

	it('should show telemetry as enabled when provided', async () => {
		telemetry = {} as TelemetryService;

		await handleStatusCommand(interaction, eventManager, telemetry);

		const call = vi.mocked(interaction.editReply).mock.calls[0][0];
		const fields = getEmbedFields(call);
		const telemetryField = fields?.find(
			(f: APIEmbedField) => f.name === '🔔 Telemetry',
		);

		expect(telemetryField?.value).toBe('✅ Enabled');
	});

	it('should show active events count', async () => {
		const eventId1 = faker.string.uuid();
		const eventId2 = faker.string.uuid();

		eventManager.setParticipants(
			eventId1,
			new Map([
				['user1', { userId: 'user1', role: 'Tank', rank: null }],
				['user2', { userId: 'user2', role: 'DPS', rank: null }],
			]),
		);
		eventManager.setParticipants(
			eventId2,
			new Map([['user3', { userId: 'user3', role: 'Healer', rank: null }]]),
		);

		await handleStatusCommand(interaction, eventManager, telemetry);

		const call = vi.mocked(interaction.editReply).mock.calls[0][0];
		const fields = getEmbedFields(call);
		const activeEventsField = fields?.find(
			(f: APIEmbedField) => f.name === '📊 Active Events',
		);

		expect(activeEventsField?.value).toBe('2');
	});

	it('should show total participants count', async () => {
		const eventId1 = faker.string.uuid();
		const eventId2 = faker.string.uuid();

		eventManager.setParticipants(
			eventId1,
			new Map([
				['user1', { userId: 'user1', role: 'Tank', rank: null }],
				['user2', { userId: 'user2', role: 'DPS', rank: null }],
			]),
		);
		eventManager.setParticipants(
			eventId2,
			new Map([['user3', { userId: 'user3', role: 'Healer', rank: null }]]),
		);

		await handleStatusCommand(interaction, eventManager, telemetry);

		const call = vi.mocked(interaction.editReply).mock.calls[0][0];
		const fields = getEmbedFields(call);
		const participantsField = fields?.find(
			(f: APIEmbedField) => f.name === '👥 Total Participants',
		);

		expect(participantsField?.value).toBe('3');
	});

	it('should show uptime', async () => {
		await handleStatusCommand(interaction, eventManager, telemetry);

		const call = vi.mocked(interaction.editReply).mock.calls[0][0];
		const fields = getEmbedFields(call);
		const uptimeField = fields?.find(
			(f: APIEmbedField) => f.name === '⏱️ Uptime',
		);

		expect(uptimeField?.value).toBeDefined();
		expect(uptimeField?.value).toMatch(/\d+[smhd]/);
	});

	it('should show memory usage', async () => {
		await handleStatusCommand(interaction, eventManager, telemetry);

		const call = vi.mocked(interaction.editReply).mock.calls[0][0];
		const fields = getEmbedFields(call);
		const memoryField = fields?.find(
			(f: APIEmbedField) => f.name === '💾 Memory Usage',
		);

		expect(memoryField?.value).toBeDefined();
		expect(memoryField?.value).toContain('MB');
		expect(memoryField?.value).toContain('RSS:');
		expect(memoryField?.value).toContain('Heap:');
	});

	it('should handle no active events', async () => {
		await handleStatusCommand(interaction, eventManager, telemetry);

		const call = vi.mocked(interaction.editReply).mock.calls[0][0];
		const fields = getEmbedFields(call);
		const activeEventsField = fields?.find(
			(f: APIEmbedField) => f.name === '📊 Active Events',
		);
		const participantsField = fields?.find(
			(f: APIEmbedField) => f.name === '👥 Total Participants',
		);

		expect(activeEventsField?.value).toBe('0');
		expect(participantsField?.value).toBe('0');
	});

	it('should show guild count', async () => {
		await handleStatusCommand(interaction, eventManager, telemetry);

		const call = vi.mocked(interaction.editReply).mock.calls[0][0];
		const fields = getEmbedFields(call);
		const guildField = fields?.find(
			(f: APIEmbedField) => f.name === '🌐 Guilds',
		);

		expect(guildField?.value).toBe('5');
	});

	it('should show bot version', async () => {
		await handleStatusCommand(interaction, eventManager, telemetry);

		const call = vi.mocked(interaction.editReply).mock.calls[0][0];
		const fields = getEmbedFields(call);
		const versionField = fields?.find(
			(f: APIEmbedField) => f.name === '📦 Version',
		);

		expect(versionField?.value).toBeDefined();
		expect(versionField?.value).toMatch(/\d+\.\d+\.\d+/);
	});

	it('should show Node.js version', async () => {
		await handleStatusCommand(interaction, eventManager, telemetry);

		const call = vi.mocked(interaction.editReply).mock.calls[0][0];
		const fields = getEmbedFields(call);
		const nodeField = fields?.find(
			(f: APIEmbedField) => f.name === '🟢 Node.js',
		);

		expect(nodeField?.value).toBeDefined();
		expect(nodeField?.value).toMatch(/^v\d+\.\d+\.\d+/);
	});
});
