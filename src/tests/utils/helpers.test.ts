import type {
	ButtonInteraction,
	ChatInputCommandInteraction,
	Client,
	GuildMember,
	GuildTextBasedChannel,
	RepliableInteraction,
	TextChannel,
} from 'discord.js';
import { PermissionFlagsBits } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	ADMIN_PERMISSIONS,
	EXCALIBUR_GUILD_ID,
	EXCALIBUR_RANKS,
	PING_ROLE_NAMES,
} from '../../constants.js';
import { EventManager } from '../../event/event-manager.js';
import {
	botHasPermission,
	checkProcessingStates,
	getEmoteForRank,
	getExcaliburRankOfUser,
	getPingsForServer,
	isUserAdmin,
	safeReplyToInteraction,
} from '../../utils/helpers.js';

describe('helpers', () => {
	describe('isUserAdmin', () => {
		it('should return true when member has Administrator permission', () => {
			const member = {
				permissions: {
					has: vi.fn().mockImplementation((perm) => {
						return perm === PermissionFlagsBits.Administrator;
					}),
				},
			} as unknown as GuildMember;

			expect(isUserAdmin(member)).toBe(true);
		});

		it('should return true when member has ManageMessages permission', () => {
			const member = {
				permissions: {
					has: vi.fn().mockImplementation((perm) => {
						return perm === PermissionFlagsBits.ManageMessages;
					}),
				},
			} as unknown as GuildMember;

			expect(isUserAdmin(member)).toBe(true);
		});

		it('should return false when member has no admin permissions', () => {
			const member = {
				permissions: {
					has: vi.fn().mockReturnValue(false),
				},
			} as unknown as GuildMember;

			expect(isUserAdmin(member)).toBe(false);
		});

		it('should check all admin permissions', () => {
			const hasSpy = vi.fn().mockReturnValue(false);
			const member = {
				permissions: {
					has: hasSpy,
				},
			} as unknown as GuildMember;

			isUserAdmin(member);

			expect(hasSpy).toHaveBeenCalledTimes(ADMIN_PERMISSIONS.length);
		});
	});

	describe('getPingsForServer', () => {
		it('should return casual ping role when casual is true', () => {
			const mockCollection = {
				size: 1,
				map: (fn: (role: { id: string; name: string }) => string) => [
					fn({ id: 'role1', name: PING_ROLE_NAMES.casual }),
				],
			};

			const interaction = {
				guild: {
					roles: {
						cache: {
							filter: vi.fn().mockReturnValue(mockCollection),
						},
					},
				},
			} as unknown as ChatInputCommandInteraction;

			const result = getPingsForServer(interaction, true);

			expect(result).toContain('role1');
			expect(result).toContain('||');
		});

		it('should return competitive ping role when casual is false', () => {
			const mockCollection = {
				size: 1,
				map: (fn: (role: { id: string; name: string }) => string) => [
					fn({ id: 'role2', name: PING_ROLE_NAMES.competitive }),
				],
			};

			const interaction = {
				guild: {
					roles: {
						cache: {
							filter: vi.fn().mockReturnValue(mockCollection),
						},
					},
				},
			} as unknown as ChatInputCommandInteraction;

			const result = getPingsForServer(interaction, false);

			expect(result).toContain('role2');
		});

		it('should return null when no guild', () => {
			const interaction = {
				guild: null,
			} as unknown as ChatInputCommandInteraction;

			const result = getPingsForServer(interaction, true);

			expect(result).toBeNull();
		});

		it('should return null when no matching roles found', () => {
			const interaction = {
				guild: {
					roles: {
						cache: {
							filter: vi.fn().mockReturnValue(new Map()),
						},
					},
				},
			} as unknown as ChatInputCommandInteraction;

			const result = getPingsForServer(interaction, true);

			expect(result).toBeNull();
		});

		it('should join multiple roles with spaces', () => {
			const mockCollection = {
				size: 2,
				map: (fn: (role: { id: string; name: string }) => string) => [
					fn({ id: 'role1', name: PING_ROLE_NAMES.casual }),
					fn({ id: 'role2', name: PING_ROLE_NAMES.casual }),
				],
			};

			const interaction = {
				guild: {
					roles: {
						cache: {
							filter: vi.fn().mockReturnValue(mockCollection),
						},
					},
				},
			} as unknown as ChatInputCommandInteraction;

			const result = getPingsForServer(interaction, true);

			expect(result).toContain('role1');
			expect(result).toContain('role2');
			expect(result).toContain(' ');
		});
	});

	describe('botHasPermission', () => {
		it('should return true when bot has permission', () => {
			const client = {
				user: {
					id: 'bot123',
				},
			} as unknown as Client;

			const channel = {
				isTextBased: () => true,
				isDMBased: () => false,
				permissionsFor: vi.fn().mockReturnValue({
					has: vi.fn().mockReturnValue(true),
				}),
			} as unknown as GuildTextBasedChannel;

			const result = botHasPermission(
				PermissionFlagsBits.SendMessages,
				client,
				channel,
			);

			expect(result).toBe(true);
		});

		it('should return false when bot lacks permission', () => {
			const client = {
				user: {
					id: 'bot123',
				},
			} as unknown as Client;

			const channel = {
				isTextBased: () => true,
				isDMBased: () => false,
				permissionsFor: vi.fn().mockReturnValue({
					has: vi.fn().mockReturnValue(false),
				}),
			} as unknown as GuildTextBasedChannel;

			const result = botHasPermission(
				PermissionFlagsBits.SendMessages,
				client,
				channel,
			);

			expect(result).toBe(false);
		});

		it('should return false when channel is DM', () => {
			const client = {
				user: {
					id: 'bot123',
				},
			} as unknown as Client;

			const channel = {
				isTextBased: () => true,
				isDMBased: () => true,
			} as unknown as TextChannel;

			const result = botHasPermission(
				PermissionFlagsBits.SendMessages,
				client,
				channel,
			);

			expect(result).toBe(false);
		});

		it('should return false when channel is null', () => {
			const client = {
				user: {
					id: 'bot123',
				},
			} as unknown as Client;

			const result = botHasPermission(
				PermissionFlagsBits.SendMessages,
				client,
				null,
			);

			expect(result).toBe(false);
		});

		it('should return false when client user is null', () => {
			const client = {
				user: null,
			} as unknown as Client;

			const channel = {
				isTextBased: () => true,
				isDMBased: () => false,
			} as unknown as TextChannel;

			const result = botHasPermission(
				PermissionFlagsBits.SendMessages,
				client,
				channel,
			);

			expect(result).toBe(false);
		});
	});

	describe('getExcaliburRankOfUser', () => {
		it('should return rank when user has matching role', () => {
			const member = {
				roles: {
					valueOf: () =>
						new Map([
							[
								'role1',
								{
									id: EXCALIBUR_RANKS['1'].id,
									name: EXCALIBUR_RANKS['1'].name,
								},
							],
						]),
				},
			} as unknown as GuildMember;

			const result = getExcaliburRankOfUser(EXCALIBUR_GUILD_ID, member);

			expect(result).toBe('1');
		});

		it('should return null when not in Excalibur guild', () => {
			const member = {
				roles: {
					valueOf: () => new Map(),
				},
			} as unknown as GuildMember;

			const result = getExcaliburRankOfUser('different-guild', member);

			expect(result).toBeNull();
		});

		it('should return null when user has no matching rank role', () => {
			const member = {
				roles: {
					valueOf: () =>
						new Map([['other-role', { id: 'other', name: 'Other' }]]),
				},
			} as unknown as GuildMember;

			const result = getExcaliburRankOfUser(EXCALIBUR_GUILD_ID, member);

			expect(result).toBeNull();
		});

		it('should match by role name if ID does not match', () => {
			const member = {
				roles: {
					valueOf: () =>
						new Map([
							[
								'role-wrong-id',
								{ id: 'wrong-id', name: EXCALIBUR_RANKS['2'].name },
							],
						]),
				},
			} as unknown as GuildMember;

			const result = getExcaliburRankOfUser(EXCALIBUR_GUILD_ID, member);

			expect(result).toBe('2');
		});
	});

	describe('safeReplyToInteraction', () => {
		beforeEach(() => {
			vi.clearAllMocks();
		});

		it('should reply when interaction has not been replied to', async () => {
			const replySpy = vi.fn().mockResolvedValue(undefined);
			const interaction = {
				replied: false,
				deferred: false,
				reply: replySpy,
			} as unknown as RepliableInteraction;

			await safeReplyToInteraction(interaction, 'Test message');

			expect(replySpy).toHaveBeenCalledWith({
				content: 'Test message',
				flags: ['Ephemeral'],
			});
		});

		it('should follow up when interaction was already replied', async () => {
			const followUpSpy = vi.fn().mockResolvedValue(undefined);
			const interaction = {
				replied: true,
				deferred: false,
				followUp: followUpSpy,
			} as unknown as RepliableInteraction;

			await safeReplyToInteraction(interaction, 'Test message');

			expect(followUpSpy).toHaveBeenCalledWith({
				content: 'Test message',
				flags: ['Ephemeral'],
			});
		});

		it('should follow up when interaction was deferred', async () => {
			const followUpSpy = vi.fn().mockResolvedValue(undefined);
			const interaction = {
				replied: false,
				deferred: true,
				followUp: followUpSpy,
			} as unknown as RepliableInteraction;

			await safeReplyToInteraction(interaction, 'Test message');

			expect(followUpSpy).toHaveBeenCalledWith({
				content: 'Test message',
				flags: ['Ephemeral'],
			});
		});

		it('should not throw when reply fails', async () => {
			const interaction = {
				replied: false,
				deferred: false,
				reply: vi.fn().mockRejectedValue(new Error('Network error')),
			} as unknown as RepliableInteraction;

			await expect(
				safeReplyToInteraction(interaction, 'Test'),
			).resolves.not.toThrow();
		});
	});

	describe('checkProcessingStates', () => {
		let eventManager: EventManager;
		let mockClient: Client;

		beforeEach(() => {
			mockClient = {
				channels: { fetch: vi.fn() },
				users: { cache: new Map() },
			} as unknown as Client;
			eventManager = new EventManager(mockClient);
		});

		it('should return true when event is starting', async () => {
			eventManager.setProcessing('msg1', 'starting');

			const result = await checkProcessingStates('msg1', eventManager);

			expect(result).toBe(true);
		});

		it('should return true when event is finishing', async () => {
			eventManager.setProcessing('msg1', 'finishing');

			const result = await checkProcessingStates('msg1', eventManager);

			expect(result).toBe(true);
		});

		it('should return true when event is cancelling', async () => {
			eventManager.setProcessing('msg1', 'cancelling');

			const result = await checkProcessingStates('msg1', eventManager);

			expect(result).toBe(true);
		});

		it('should return true when event is in cleanup', async () => {
			eventManager.setProcessing('msg1', 'cleanup');

			const result = await checkProcessingStates('msg1', eventManager);

			expect(result).toBe(true);
		});

		it('should return false when event has no processing states', async () => {
			const result = await checkProcessingStates('msg1', eventManager);

			expect(result).toBe(false);
		});

		it('should reply to interaction when provided and processing', async () => {
			eventManager.setProcessing('msg1', 'starting');
			const interaction = {
				replied: false,
				deferred: false,
				reply: vi.fn().mockResolvedValue(undefined),
			} as unknown as ButtonInteraction;

			await checkProcessingStates('msg1', eventManager, interaction);

			expect(interaction.reply).toHaveBeenCalled();
		});
	});

	describe('getEmoteForRank', () => {
		it('should return empty string for non-Excalibur guild', () => {
			const result = getEmoteForRank('differentGuildId', '1');

			expect(result).toBe('');
		});

		it('should return empty string when guildId is null', () => {
			const result = getEmoteForRank(null, '1');

			expect(result).toBe('');
		});

		it('should return empty string when guildId is undefined', () => {
			const result = getEmoteForRank(undefined, '1');

			expect(result).toBe('');
		});

		it('should return default emote when rankId is null', () => {
			const result = getEmoteForRank(EXCALIBUR_GUILD_ID, null);

			expect(result).toBe('⚫ ');
		});

		it('should return default emote when rankId is invalid', () => {
			const result = getEmoteForRank(EXCALIBUR_GUILD_ID, 'invalidRank');

			expect(result).toBe('⚫ ');
		});

		it('should return correct emote for rank 1 (Grandmaster)', () => {
			const result = getEmoteForRank(EXCALIBUR_GUILD_ID, '1');

			expect(result).toBe(
				`<:${EXCALIBUR_RANKS['1'].emoteName}:${EXCALIBUR_RANKS['1'].emoteId}> `,
			);
			expect(result).toContain('Ex8s1_grandmaster');
		});

		it('should return correct emote for rank 2 (Legend)', () => {
			const result = getEmoteForRank(EXCALIBUR_GUILD_ID, '2');

			expect(result).toBe(
				`<:${EXCALIBUR_RANKS['2'].emoteName}:${EXCALIBUR_RANKS['2'].emoteId}> `,
			);
			expect(result).toContain('Ex8s2_legend');
		});

		it('should return correct emote for rank 3 (Ascendant)', () => {
			const result = getEmoteForRank(EXCALIBUR_GUILD_ID, '3');

			expect(result).toBe(
				`<:${EXCALIBUR_RANKS['3'].emoteName}:${EXCALIBUR_RANKS['3'].emoteId}> `,
			);
			expect(result).toContain('Ex8s3_ascendant');
		});

		it('should return correct emote for rank 4 (Elite)', () => {
			const result = getEmoteForRank(EXCALIBUR_GUILD_ID, '4');

			expect(result).toBe(
				`<:${EXCALIBUR_RANKS['4'].emoteName}:${EXCALIBUR_RANKS['4'].emoteId}> `,
			);
			expect(result).toContain('Ex8s4_elite');
		});

		it('should return correct emote for rank 5 (Knight)', () => {
			const result = getEmoteForRank(EXCALIBUR_GUILD_ID, '5');

			expect(result).toBe(
				`<:${EXCALIBUR_RANKS['5'].emoteName}:${EXCALIBUR_RANKS['5'].emoteId}> `,
			);
			expect(result).toContain('Ex8s5_knight');
		});

		it('should return correct emote for rank 6 (Squire)', () => {
			const result = getEmoteForRank(EXCALIBUR_GUILD_ID, '6');

			expect(result).toBe(
				`<:${EXCALIBUR_RANKS['6'].emoteName}:${EXCALIBUR_RANKS['6'].emoteId}> `,
			);
			expect(result).toContain('Ex8s6_novice');
		});

		it('should include trailing space in emote string', () => {
			const result = getEmoteForRank(EXCALIBUR_GUILD_ID, '1');

			expect(result).toMatch(/ $/);
		});

		it('should include trailing space in default emote', () => {
			const result = getEmoteForRank(EXCALIBUR_GUILD_ID, null);

			expect(result).toBe('⚫ ');
			expect(result).toMatch(/ $/);
		});
	});
});
