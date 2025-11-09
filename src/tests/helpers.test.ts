import { faker } from '@faker-js/faker';
import {
	ApplicationCommandPermissionType,
	PermissionFlagsBits,
} from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EXCALIBUR_GUILD_ID, EXCALIBUR_RANKS } from '../constants.js';
import {
	checkCommandPermissions,
	clearPermissionsCache,
	getExcaliburRankOfUser,
	getPingsForServer,
	isUserAdmin,
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

	describe('checkCommandPermissions', () => {
		beforeEach(() => {
			vi.useFakeTimers();
			clearPermissionsCache();
		});

		it('should return false when no permissions are configured', async () => {
			const guild = {
				commands: {
					permissions: {
						fetch: vi.fn().mockResolvedValue(new Map()),
					},
				},
			} as never;

			const result = await checkCommandPermissions(guild, 'channel-123');
			expect(result).toBe(false);
		});

		it('should return true when channel is explicitly allowed', async () => {
			const channelId = faker.string.uuid();
			const permissions = [
				{
					id: channelId,
					type: ApplicationCommandPermissionType.Channel,
					permission: true,
				},
			];
			const permissionsMap = new Map([['command-123', permissions]]);

			const guild = {
				commands: {
					permissions: {
						fetch: vi.fn().mockResolvedValue(permissionsMap),
					},
				},
			} as never;

			const result = await checkCommandPermissions(guild, channelId);
			expect(result).toBe(true);
		});

		it('should return false when channel is not in allowed list', async () => {
			const channelId = faker.string.uuid();
			const differentChannelId = faker.string.uuid();
			const permissions = [
				{
					id: differentChannelId,
					type: ApplicationCommandPermissionType.Channel,
					permission: true,
				},
			];
			const permissionsMap = new Map([['command-123', permissions]]);

			const guild = {
				commands: {
					permissions: {
						fetch: vi.fn().mockResolvedValue(permissionsMap),
					},
				},
			} as never;

			const result = await checkCommandPermissions(guild, channelId);
			expect(result).toBe(false);
		});

		it('should return false when no channel permissions are configured', async () => {
			const permissions = [
				{
					id: faker.string.uuid(),
					type: ApplicationCommandPermissionType.Role,
					permission: true,
				},
			];
			const permissionsMap = new Map([['command-123', permissions]]);

			const guild = {
				commands: {
					permissions: {
						fetch: vi.fn().mockResolvedValue(permissionsMap),
					},
				},
			} as never;

			const result = await checkCommandPermissions(guild, faker.string.uuid());
			expect(result).toBe(false);
		});

		it('should return false when permission check errors', async () => {
			const consoleErrorSpy = vi
				.spyOn(console, 'error')
				.mockImplementation(() => {});

			const guild = {
				commands: {
					permissions: {
						fetch: vi.fn().mockRejectedValue(new Error('API Error')),
					},
				},
			} as never;

			const result = await checkCommandPermissions(guild, 'channel-123');
			expect(result).toBe(false);
			expect(consoleErrorSpy).toHaveBeenCalledWith(
				'Error checking command permissions:',
				expect.any(Error),
			);

			consoleErrorSpy.mockRestore();
		});

		it('should handle multiple channel permissions correctly', async () => {
			const channelId1 = faker.string.uuid();
			const channelId2 = faker.string.uuid();
			const permissions = [
				{
					id: channelId1,
					type: ApplicationCommandPermissionType.Channel,
					permission: true,
				},
				{
					id: channelId2,
					type: ApplicationCommandPermissionType.Channel,
					permission: true,
				},
			];
			const permissionsMap = new Map([['command-123', permissions]]);

			const guild = {
				commands: {
					permissions: {
						fetch: vi.fn().mockResolvedValue(permissionsMap),
					},
				},
			} as never;

			const result1 = await checkCommandPermissions(guild, channelId1);
			const result2 = await checkCommandPermissions(guild, channelId2);

			expect(result1).toBe(true);
			expect(result2).toBe(true);
		});

		it('should cache permission results for 1 minute', async () => {
			const guildId = faker.string.uuid();
			const channelId = faker.string.uuid();
			const permissions = [
				{
					id: channelId,
					type: ApplicationCommandPermissionType.Channel,
					permission: true,
				},
			];
			const permissionsMap = new Map([['command-123', permissions]]);
			const fetchSpy = vi.fn().mockResolvedValue(permissionsMap);

			const guild = {
				id: guildId,
				commands: {
					permissions: {
						fetch: fetchSpy,
					},
				},
			} as never;

			// First call should fetch
			const result1 = await checkCommandPermissions(guild, channelId);
			expect(result1).toBe(true);
			expect(fetchSpy).toHaveBeenCalledTimes(1);

			// Second call within 1 minute should use cache
			const result2 = await checkCommandPermissions(guild, channelId);
			expect(result2).toBe(true);
			expect(fetchSpy).toHaveBeenCalledTimes(1); // Still only called once

			// Advance time by 1 minute
			vi.advanceTimersByTime(60 * 5 * 1000);

			// Third call after cache expiry should fetch again
			const result3 = await checkCommandPermissions(guild, channelId);
			expect(result3).toBe(true);
			expect(fetchSpy).toHaveBeenCalledTimes(2);

			vi.useRealTimers();
		});

		it('should maintain separate cache entries for different guild-channel combinations', async () => {
			const guildId1 = faker.string.uuid();
			const guildId2 = faker.string.uuid();
			const channelId1 = faker.string.uuid();
			const channelId2 = faker.string.uuid();

			const permissions1 = [
				{
					id: channelId1,
					type: ApplicationCommandPermissionType.Channel,
					permission: true,
				},
			];
			const permissions2 = [
				{
					id: channelId2,
					type: ApplicationCommandPermissionType.Channel,
					permission: true,
				},
			];

			const fetchSpy1 = vi
				.fn()
				.mockResolvedValue(new Map([['command-123', permissions1]]));
			const fetchSpy2 = vi
				.fn()
				.mockResolvedValue(new Map([['command-123', permissions2]]));

			const guild1 = {
				id: guildId1,
				commands: {
					permissions: {
						fetch: fetchSpy1,
					},
				},
			} as never;

			const guild2 = {
				id: guildId2,
				commands: {
					permissions: {
						fetch: fetchSpy2,
					},
				},
			} as never;

			// Call for different guild-channel combinations
			await checkCommandPermissions(guild1, channelId1);
			await checkCommandPermissions(guild2, channelId2);
			await checkCommandPermissions(guild1, channelId2);

			// Each unique combination should trigger a fetch
			expect(fetchSpy1).toHaveBeenCalledTimes(2); // guild1-channel1 and guild1-channel2
			expect(fetchSpy2).toHaveBeenCalledTimes(1); // guild2-channel2

			// Second calls should use cache
			await checkCommandPermissions(guild1, channelId1);
			await checkCommandPermissions(guild2, channelId2);

			expect(fetchSpy1).toHaveBeenCalledTimes(2); // Still 2
			expect(fetchSpy2).toHaveBeenCalledTimes(1); // Still 1

			vi.useRealTimers();
		});
	});
});
