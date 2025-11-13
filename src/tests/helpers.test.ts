import { faker } from '@faker-js/faker';
import { PermissionFlagsBits } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import { EXCALIBUR_GUILD_ID, EXCALIBUR_RANKS } from '../constants.js';
import {
	botHasPermission,
	getExcaliburRankOfUser,
	getPingsForServer,
	isUserAdmin,
	safeReplyToInteraction,
} from '../utils/helpers.js';

describe('helpers', () => {
	describe('isUserAdmin', () => {
		it('should return true when member has Administrator permission', () => {
			const member = {
				permissions: {
					has: vi.fn((perm) => perm === PermissionFlagsBits.Administrator),
				},
			} as never;

			expect(isUserAdmin(member)).toBe(true);
		});

		it('should return true when member has ManageGuild permission', () => {
			const member = {
				permissions: {
					has: vi.fn((perm) => perm === PermissionFlagsBits.ManageMessages),
				},
			} as never;

			expect(isUserAdmin(member)).toBe(true);
		});

		it('should return false when member has no admin permissions', () => {
			const member = {
				permissions: {
					has: vi.fn().mockReturnValue(false),
				},
			} as never;

			expect(isUserAdmin(member)).toBe(false);
		});
	});

	describe('getPingsForServer', () => {
		it('should return competitive role pings when casual is false', () => {
			const roleId = faker.string.uuid();
			const mockCollection = {
				size: 1,
				map: vi.fn((callback) =>
					[{ id: roleId, name: 'Comp 8s' }].map(callback),
				),
			};
			const interaction = {
				guild: {
					roles: {
						cache: {
							filter: vi.fn().mockReturnValue(mockCollection),
						},
					},
				},
			} as never;

			const result = getPingsForServer(interaction, false);
			expect(result).toBe(`||<@&${roleId}>||`);
		});

		it('should return casual role pings when casual is true', () => {
			const roleId = faker.string.uuid();
			const mockCollection = {
				size: 1,
				map: vi.fn((callback) =>
					[{ id: roleId, name: 'Casual 8s' }].map(callback),
				),
			};
			const interaction = {
				guild: {
					roles: {
						cache: {
							filter: vi.fn().mockReturnValue(mockCollection),
						},
					},
				},
			} as never;

			const result = getPingsForServer(interaction, true);
			expect(result).toBe(`||<@&${roleId}>||`);
		});

		it('should return null when no matching roles found', () => {
			const mockCollection = {
				size: 0,
				map: vi.fn(),
			};
			const interaction = {
				guild: {
					roles: {
						cache: {
							filter: vi.fn().mockReturnValue(mockCollection),
						},
					},
				},
			} as never;

			const result = getPingsForServer(interaction, false);
			expect(result).toBeNull();
		});

		it('should return null when guild is not available', () => {
			const interaction = {
				guild: null,
			} as never;

			const result = getPingsForServer(interaction, false);
			expect(result).toBeNull();
		});

		it('should handle multiple role pings', () => {
			const roleId1 = faker.string.uuid();
			const roleId2 = faker.string.uuid();
			const mockCollection = {
				size: 2,
				map: vi.fn((callback) =>
					[
						{ id: roleId1, name: 'Comp 8s' },
						{ id: roleId2, name: 'Comp 8s' },
					].map(callback),
				),
			};
			const interaction = {
				guild: {
					roles: {
						cache: {
							filter: vi.fn().mockReturnValue(mockCollection),
						},
					},
				},
			} as never;

			const result = getPingsForServer(interaction, false);
			expect(result).toContain(`||<@&${roleId1}>||`);
			expect(result).toContain(`||<@&${roleId2}>||`);
		});
	});

	describe('getExcaliburRankOfUser', () => {
		it('should return null when guild is not Excalibur', () => {
			const interaction = {
				guild: {
					id: faker.string.uuid(),
				},
				member: {
					roles: new Map(),
				},
			} as never;

			expect(getExcaliburRankOfUser(interaction)).toBeNull();
		});

		it('should return null when member roles are not available', () => {
			const interaction = {
				guild: {
					id: EXCALIBUR_GUILD_ID,
				},
				member: {
					roles: undefined,
				},
			} as never;

			expect(getExcaliburRankOfUser(interaction)).toBeNull();
		});

		it('should return null when member roles is an array', () => {
			const interaction = {
				guild: {
					id: EXCALIBUR_GUILD_ID,
				},
				member: {
					roles: [],
				},
			} as never;

			expect(getExcaliburRankOfUser(interaction)).toBeNull();
		});

		it('should return rank when user has matching role by ID', () => {
			const interaction = {
				guild: {
					id: EXCALIBUR_GUILD_ID,
				},
				member: {
					roles: {
						valueOf: vi.fn().mockReturnValue([
							[
								'1',
								{
									id: EXCALIBUR_RANKS['2'].id,
									name: 'T1 Legend',
								},
							],
						]),
					},
				},
			} as never;

			expect(getExcaliburRankOfUser(interaction)).toBe('2');
		});

		it('should return rank when user has matching role by name', () => {
			const interaction = {
				guild: {
					id: EXCALIBUR_GUILD_ID,
				},
				member: {
					roles: {
						valueOf: vi.fn().mockReturnValue([
							[
								faker.string.uuid(),
								{
									id: faker.string.uuid(),
									name: EXCALIBUR_RANKS['4'].name,
								},
							],
						]),
					},
				},
			} as never;

			expect(getExcaliburRankOfUser(interaction)).toBe('4');
		});

		it('should return null when user has no matching Excalibur rank', () => {
			const interaction = {
				guild: {
					id: EXCALIBUR_GUILD_ID,
				},
				member: {
					roles: {
						valueOf: vi.fn().mockReturnValue([
							[
								faker.string.uuid(),
								{
									id: faker.string.uuid(),
									name: 'Some Other Role',
								},
							],
						]),
					},
				},
			} as never;

			expect(getExcaliburRankOfUser(interaction)).toBeNull();
		});
	});

	describe('botHasPermission', () => {
		it('should return true when bot has the specified permission', () => {
			const client = {
				user: {
					id: faker.string.uuid(),
				},
			} as never;

			const channel = {
				isTextBased: vi.fn().mockReturnValue(true),
				isDMBased: vi.fn().mockReturnValue(false),
				permissionsFor: vi.fn().mockReturnValue({
					has: vi.fn().mockReturnValue(true),
				}),
			} as never;

			const result = botHasPermission(
				PermissionFlagsBits.SendMessages,
				client,
				channel,
			);
			expect(result).toBe(true);
		});

		it('should return false when bot does not have the specified permission', () => {
			const client = {
				user: {
					id: faker.string.uuid(),
				},
			} as never;

			const channel = {
				isTextBased: vi.fn().mockReturnValue(true),
				isDMBased: vi.fn().mockReturnValue(false),
				permissionsFor: vi.fn().mockReturnValue({
					has: vi.fn().mockReturnValue(false),
				}),
			} as never;

			const result = botHasPermission(
				PermissionFlagsBits.SendMessages,
				client,
				channel,
			);
			expect(result).toBe(false);
		});

		it('should return false when client user is not available', () => {
			const client = {
				user: null,
			} as never;

			const channel = {
				isTextBased: vi.fn().mockReturnValue(true),
				isDMBased: vi.fn().mockReturnValue(false),
			} as never;

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
					id: faker.string.uuid(),
				},
			} as never;

			const result = botHasPermission(
				PermissionFlagsBits.SendMessages,
				client,
				null,
			);
			expect(result).toBe(false);
		});

		it('should return false when channel is not text-based', () => {
			const client = {
				user: {
					id: faker.string.uuid(),
				},
			} as never;

			const channel = {
				isTextBased: vi.fn().mockReturnValue(false),
				isDMBased: vi.fn().mockReturnValue(false),
			} as never;

			const result = botHasPermission(
				PermissionFlagsBits.SendMessages,
				client,
				channel,
			);
			expect(result).toBe(false);
		});

		it('should return false when channel is DM-based', () => {
			const client = {
				user: {
					id: faker.string.uuid(),
				},
			} as never;

			const channel = {
				isTextBased: vi.fn().mockReturnValue(true),
				isDMBased: vi.fn().mockReturnValue(true),
			} as never;

			const result = botHasPermission(
				PermissionFlagsBits.SendMessages,
				client,
				channel,
			);
			expect(result).toBe(false);
		});

		it('should return false when permissionsFor returns null', () => {
			const client = {
				user: {
					id: faker.string.uuid(),
				},
			} as never;

			const channel = {
				isTextBased: vi.fn().mockReturnValue(true),
				isDMBased: vi.fn().mockReturnValue(false),
				permissionsFor: vi.fn().mockReturnValue(null),
			} as never;

			const result = botHasPermission(
				PermissionFlagsBits.SendMessages,
				client,
				channel,
			);
			expect(result).toBe(false);
		});

		it('should work with different permission types', () => {
			const client = {
				user: {
					id: faker.string.uuid(),
				},
			} as never;

			const channel = {
				isTextBased: vi.fn().mockReturnValue(true),
				isDMBased: vi.fn().mockReturnValue(false),
				permissionsFor: vi.fn().mockReturnValue({
					has: vi.fn().mockReturnValue(true),
				}),
			} as never;

			const resultManageMessages = botHasPermission(
				PermissionFlagsBits.ManageMessages,
				client,
				channel,
			);
			const resultAdministrator = botHasPermission(
				PermissionFlagsBits.Administrator,
				client,
				channel,
			);

			expect(resultManageMessages).toBe(true);
			expect(resultAdministrator).toBe(true);
		});
	});

	describe('safeReplyToInteraction', () => {
		it('should call reply when interaction is not replied or deferred', async () => {
			const interaction = {
				replied: false,
				deferred: false,
				reply: vi.fn().mockResolvedValue(undefined),
				followUp: vi.fn(),
			} as unknown as Parameters<typeof safeReplyToInteraction>[0];

			const content = 'Test message';

			await safeReplyToInteraction(interaction, content);
			expect(interaction.reply).toHaveBeenCalledWith({
				content,
				flags: ['Ephemeral'],
			});
			expect(interaction.followUp).not.toHaveBeenCalled();
		});

		it('should call followUp when interaction is already replied', async () => {
			const interaction = {
				replied: true,
				deferred: false,
				reply: vi.fn(),
				followUp: vi.fn().mockResolvedValue(undefined),
			} as unknown as Parameters<typeof safeReplyToInteraction>[0];

			const content = 'Test message';

			await safeReplyToInteraction(interaction, content);
			expect(interaction.followUp).toHaveBeenCalledWith({
				content,
				flags: ['Ephemeral'],
			});
			expect(interaction.reply).not.toHaveBeenCalled();
		});

		it('should call followUp when interaction is already deferred', async () => {
			const interaction = {
				replied: false,
				deferred: true,
				reply: vi.fn(),
				followUp: vi.fn().mockResolvedValue(undefined),
			} as unknown as Parameters<typeof safeReplyToInteraction>[0];

			const content = 'Test message';

			await safeReplyToInteraction(interaction, content);
			expect(interaction.followUp).toHaveBeenCalledWith({
				content,
				flags: ['Ephemeral'],
			});
			expect(interaction.reply).not.toHaveBeenCalled();
		});

		it('should handle errors gracefully when reply fails', async () => {
			const interaction = {
				replied: false,
				deferred: false,
				reply: vi.fn().mockRejectedValue(new Error('Reply failed')),
				followUp: vi.fn(),
			} as unknown as Parameters<typeof safeReplyToInteraction>[0];

			const content = 'Test message';

			const consoleSpy = vi
				.spyOn(console, 'error')
				.mockImplementation(() => {});

			await safeReplyToInteraction(interaction, content);
			expect(interaction.reply).toHaveBeenCalled();
			expect(consoleSpy).toHaveBeenCalled();
			const errorOutput = consoleSpy.mock.calls[0][0] as string;
			expect(errorOutput).toContain(
				'[LOW] Failed to send error message to user',
			);

			consoleSpy.mockRestore();
		});

		it('should handle errors gracefully when followUp fails', async () => {
			const interaction = {
				replied: true,
				deferred: false,
				reply: vi.fn(),
				followUp: vi.fn().mockRejectedValue(new Error('FollowUp failed')),
			} as unknown as Parameters<typeof safeReplyToInteraction>[0];

			const content = 'Test message';

			const consoleSpy = vi
				.spyOn(console, 'error')
				.mockImplementation(() => {});

			await safeReplyToInteraction(interaction, content);
			expect(interaction.followUp).toHaveBeenCalled();
			expect(consoleSpy).toHaveBeenCalled();
			const errorOutput = consoleSpy.mock.calls[0][0] as string;
			expect(errorOutput).toContain(
				'[LOW] Failed to send error message to user',
			);

			consoleSpy.mockRestore();
		});
	});
});
