import { faker } from '@faker-js/faker';
import type {
	ChatInputCommandInteraction,
	CommandInteractionOptionResolver,
	Message,
	User,
} from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleCreateCommand } from '../commands/create-command.js';
import { ERROR_MESSAGES, TIMINGS, WEAPON_ROLES } from '../constants.js';
import { EventManager } from '../event/event-manager.js';
import type { ThreadManager } from '../managers/thread-manager.js';
import type { VoiceChannelManager } from '../managers/voice-channel-manager.js';
import type { TelemetryService } from '../telemetry/telemetry.js';

vi.mock('../event/event-lifecycle.js', () => ({
	createEventStartTimeout: vi.fn(),
}));

vi.mock('../utils/embed-utils.js', () => ({
	createEventButtons: vi.fn(() => ({ components: [] })),
	createRoleSelectMenu: vi.fn(() => ({ components: [] })),
	createEventEmbed: vi.fn(() => ({
		title: 'Test Event',
		fields: [],
	})),
}));

vi.mock('../utils/helpers.js', () => ({
	getExcaliburRankOfUser: vi.fn(() => '5'),
	getPingsForServer: vi.fn(() => '@everyone'),
}));

describe('handleCreateCommand', () => {
	let eventManager: EventManager;
	let threadManager: ThreadManager;
	let voiceChannelManager: VoiceChannelManager;
	let telemetry: TelemetryService;
	let interaction: ChatInputCommandInteraction;
	let mockMessage: Message;
	let mockUser: User;

	beforeEach(() => {
		eventManager = new EventManager();
		threadManager = {} as ThreadManager;
		voiceChannelManager = {} as VoiceChannelManager;
		telemetry = {
			trackEventCreated: vi.fn(),
		} as unknown as TelemetryService;

		mockUser = {
			id: faker.string.uuid(),
			username: 'TestUser',
			displayAvatarURL: vi.fn(() => 'https://example.com/avatar.png'),
		} as unknown as User;

		mockMessage = {
			id: faker.string.uuid(),
			channelId: faker.string.uuid(),
		} as Message;

		const mockReply = {
			fetch: vi.fn(async () => mockMessage),
		};

		interaction = {
			user: mockUser,
			guild: { id: faker.string.uuid() },
			guildId: faker.string.uuid(),
			channelId: faker.string.uuid(),
			options: {
				getBoolean: vi.fn(() => false),
				getString: vi.fn(() => null),
				getInteger: vi.fn(() => null),
			} as unknown as CommandInteractionOptionResolver,
			reply: vi.fn(async () => mockReply),
		} as unknown as ChatInputCommandInteraction;
	});

	it('should prevent user from creating event if already signed up', async () => {
		eventManager.setParticipants(
			faker.string.uuid(),
			new Map([
				[
					mockUser.id,
					{
						userId: mockUser.id,
						role: WEAPON_ROLES[0],
						rank: null,
					},
				],
			]),
		);

		await handleCreateCommand(
			interaction,
			eventManager,
			threadManager,
			voiceChannelManager,
			telemetry,
		);

		expect(interaction.reply).toHaveBeenCalledWith({
			content: ERROR_MESSAGES.ALREADY_SIGNED_UP,
			flags: ['Ephemeral'],
		});
	});

	it('should create event with default options', async () => {
		await handleCreateCommand(
			interaction,
			eventManager,
			threadManager,
			voiceChannelManager,
			telemetry,
		);

		expect(interaction.reply).toHaveBeenCalled();
		const participants = eventManager.getParticipants(mockMessage.id);
		expect(participants?.size).toBe(1);
		expect(participants?.has(mockUser.id)).toBe(true);
	});

	it('should create event with custom time', async () => {
		const timeInMinutes = 30;
		interaction.options.getInteger = vi.fn((name, required?: boolean) => {
			if (name === 'time') return timeInMinutes;
			return required ? 0 : null;
		}) as CommandInteractionOptionResolver['getInteger'];

		await handleCreateCommand(
			interaction,
			eventManager,
			threadManager,
			voiceChannelManager,
			telemetry,
		);

		const timer = eventManager.getTimer(mockMessage.id);
		expect(timer?.duration).toBe(timeInMinutes * TIMINGS.MINUTE_IN_MS);
	});

	it('should create casual event', async () => {
		interaction.options.getBoolean = vi.fn((name) =>
			name === 'casual' ? true : false,
		);

		await handleCreateCommand(
			interaction,
			eventManager,
			threadManager,
			voiceChannelManager,
			telemetry,
		);

		expect(interaction.reply).toHaveBeenCalled();
		const participants = eventManager.getParticipants(mockMessage.id);
		expect(participants).toBeDefined();
	});

	it('should create event with custom info', async () => {
		const customInfo = 'Test tournament';
		interaction.options.getString = vi.fn((name, required?: boolean) => {
			if (name === 'info') return customInfo;
			return required ? '' : null;
		}) as CommandInteractionOptionResolver['getString'];

		await handleCreateCommand(
			interaction,
			eventManager,
			threadManager,
			voiceChannelManager,
			telemetry,
		);

		expect(interaction.reply).toHaveBeenCalled();
	});

	it('should set creator correctly', async () => {
		await handleCreateCommand(
			interaction,
			eventManager,
			threadManager,
			voiceChannelManager,
			telemetry,
		);

		const creator = eventManager.getCreator(mockMessage.id);
		expect(creator).toBe(mockUser.id);
	});

	it('should set initial timer state', async () => {
		await handleCreateCommand(
			interaction,
			eventManager,
			threadManager,
			voiceChannelManager,
			telemetry,
		);

		const timer = eventManager.getTimer(mockMessage.id);
		expect(timer?.hasStarted).toBe(false);
		expect(timer?.startTime).toBeDefined();
	});

	it('should set match ID', async () => {
		await handleCreateCommand(
			interaction,
			eventManager,
			threadManager,
			voiceChannelManager,
			telemetry,
		);

		const matchId = eventManager.getMatchId(mockMessage.id);
		expect(matchId).toBeDefined();
		expect(typeof matchId).toBe('string');
	});

	it('should set channel and guild IDs', async () => {
		await handleCreateCommand(
			interaction,
			eventManager,
			threadManager,
			voiceChannelManager,
			telemetry,
		);

		const channelId = eventManager.getChannelId(mockMessage.id);
		const guildId = eventManager.getGuildId(mockMessage.id);
		expect(channelId).toBe(mockMessage.channelId);
		expect(guildId).toBe(interaction.guildId);
	});

	it('should track event creation with telemetry', async () => {
		await handleCreateCommand(
			interaction,
			eventManager,
			threadManager,
			voiceChannelManager,
			telemetry,
		);

		expect(telemetry.trackEventCreated).toHaveBeenCalledWith(
			expect.objectContaining({
				guildId: interaction.guild?.id,
				eventId: mockMessage.id,
				userId: mockUser.id,
				channelId: interaction.channelId,
			}),
		);
	});

	it('should work without telemetry', async () => {
		await handleCreateCommand(
			interaction,
			eventManager,
			threadManager,
			voiceChannelManager,
			undefined,
		);

		expect(interaction.reply).toHaveBeenCalled();
		const participants = eventManager.getParticipants(mockMessage.id);
		expect(participants?.size).toBe(1);
	});

	it('should add user with correct weapon role', async () => {
		await handleCreateCommand(
			interaction,
			eventManager,
			threadManager,
			voiceChannelManager,
			telemetry,
		);

		const participants = eventManager.getParticipants(mockMessage.id);
		const participant = participants?.get(mockUser.id);
		expect(participant?.role).toBe(WEAPON_ROLES[0]);
	});
});
