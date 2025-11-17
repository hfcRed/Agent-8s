import { faker } from '@faker-js/faker';
import {
	ChannelType,
	type Client,
	type Guild,
	OverwriteType,
	PermissionFlagsBits,
	type TextChannel,
} from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VoiceChannelManager } from '../managers/voice-channel-manager.js';

vi.mock('../utils/retry.js', async () => {
	const actual =
		await vi.importActual<typeof import('../utils/retry.js')>(
			'../utils/retry.js',
		);
	return {
		...actual,
		MEDIUM_RETRY_OPTIONS: actual.TEST_RETRY_OPTIONS,
		LOW_RETRY_OPTIONS: actual.TEST_RETRY_OPTIONS,
	};
});

describe('VoiceChannelManager', () => {
	let voiceChannelManager: VoiceChannelManager;

	beforeEach(() => {
		voiceChannelManager = new VoiceChannelManager();
	});

	describe('createEventVoiceChannels', () => {
		it('should create three voice channels with correct names', async () => {
			const shortId = faker.string.alphanumeric(5);
			const participantIds = [
				faker.string.uuid(),
				faker.string.uuid(),
				faker.string.uuid(),
			];
			const everyoneRoleId = faker.string.uuid();
			const botUserId = faker.string.uuid();

			const mockChannels = [
				{ id: faker.string.uuid() },
				{ id: faker.string.uuid() },
				{ id: faker.string.uuid() },
			];

			const guild = {
				channels: {
					create: vi
						.fn()
						.mockResolvedValueOnce(mockChannels[0])
						.mockResolvedValueOnce(mockChannels[1])
						.mockResolvedValueOnce(mockChannels[2]),
				},
				roles: {
					everyone: {
						id: everyoneRoleId,
					},
				},
			} as unknown as Guild;

			const parentChannel = {
				parent: faker.string.uuid(),
			} as unknown as TextChannel;

			const appClient = {
				user: {
					id: botUserId,
				},
			} as unknown as Client;

			const result = await voiceChannelManager.createEventVoiceChannels(
				guild,
				parentChannel,
				participantIds,
				shortId,
				appClient,
			);

			expect(result).toHaveLength(3);
			expect(result).toEqual([
				mockChannels[0].id,
				mockChannels[1].id,
				mockChannels[2].id,
			]);

			// Verify first channel was created with correct parameters
			const firstCall = (guild.channels.create as ReturnType<typeof vi.fn>).mock
				.calls[0][0];
			expect(firstCall.name).toBe(`👥 Group - ${shortId}`);
			expect(firstCall.type).toBe(ChannelType.GuildVoice);
		});

		it('should set correct permissions for everyone role', async () => {
			const shortId = faker.string.alphanumeric(5);
			const participantIds = [faker.string.uuid()];
			const everyoneRoleId = faker.string.uuid();
			const botUserId = faker.string.uuid();

			const guild = {
				channels: {
					create: vi.fn().mockResolvedValue({ id: faker.string.uuid() }),
				},
				roles: {
					everyone: {
						id: everyoneRoleId,
					},
				},
			} as unknown as Guild;

			const parentChannel = {
				parent: faker.string.uuid(),
			} as unknown as TextChannel;

			const appClient = {
				user: {
					id: botUserId,
				},
			} as unknown as Client;

			await voiceChannelManager.createEventVoiceChannels(
				guild,
				parentChannel,
				participantIds,
				shortId,
				appClient,
			);

			const firstCall = (guild.channels.create as ReturnType<typeof vi.fn>).mock
				.calls[0][0];
			const everyoneOverwrite = firstCall.permissionOverwrites.find(
				(p: { id: string }) => p.id === everyoneRoleId,
			);

			expect(everyoneOverwrite).toBeDefined();
			expect(everyoneOverwrite.deny).toContain(PermissionFlagsBits.Connect);
			expect(everyoneOverwrite.deny).toContain(PermissionFlagsBits.ViewChannel);
			expect(everyoneOverwrite.type).toBe(OverwriteType.Role);
		});

		it('should set correct permissions for bot', async () => {
			const shortId = faker.string.alphanumeric(5);
			const participantIds = [faker.string.uuid()];
			const everyoneRoleId = faker.string.uuid();
			const botUserId = faker.string.uuid();

			const guild = {
				channels: {
					create: vi.fn().mockResolvedValue({ id: faker.string.uuid() }),
				},
				roles: {
					everyone: {
						id: everyoneRoleId,
					},
				},
			} as unknown as Guild;

			const parentChannel = {
				parent: faker.string.uuid(),
			} as unknown as TextChannel;

			const appClient = {
				user: {
					id: botUserId,
				},
			} as unknown as Client;

			await voiceChannelManager.createEventVoiceChannels(
				guild,
				parentChannel,
				participantIds,
				shortId,
				appClient,
			);

			const firstCall = (guild.channels.create as ReturnType<typeof vi.fn>).mock
				.calls[0][0];
			const botOverwrite = firstCall.permissionOverwrites.find(
				(p: { id: string }) => p.id === botUserId,
			);

			expect(botOverwrite).toBeDefined();
			expect(botOverwrite.allow).toContain(PermissionFlagsBits.Connect);
			expect(botOverwrite.allow).toContain(PermissionFlagsBits.ViewChannel);
			expect(botOverwrite.allow).toContain(PermissionFlagsBits.ManageChannels);
			expect(botOverwrite.type).toBe(OverwriteType.Member);
		});

		it('should set correct permissions for participants', async () => {
			const shortId = faker.string.alphanumeric(5);
			const participantIds = [faker.string.uuid(), faker.string.uuid()];
			const everyoneRoleId = faker.string.uuid();
			const botUserId = faker.string.uuid();

			const guild = {
				channels: {
					create: vi.fn().mockResolvedValue({ id: faker.string.uuid() }),
				},
				roles: {
					everyone: {
						id: everyoneRoleId,
					},
				},
			} as unknown as Guild;

			const parentChannel = {
				parent: faker.string.uuid(),
			} as unknown as TextChannel;

			const appClient = {
				user: {
					id: botUserId,
				},
			} as unknown as Client;

			await voiceChannelManager.createEventVoiceChannels(
				guild,
				parentChannel,
				participantIds,
				shortId,
				appClient,
			);

			const firstCall = (guild.channels.create as ReturnType<typeof vi.fn>).mock
				.calls[0][0];

			for (const participantId of participantIds) {
				const participantOverwrite = firstCall.permissionOverwrites.find(
					(p: { id: string }) => p.id === participantId,
				);

				expect(participantOverwrite).toBeDefined();
				expect(participantOverwrite.allow).toContain(
					PermissionFlagsBits.Connect,
				);
				expect(participantOverwrite.allow).toContain(
					PermissionFlagsBits.ViewChannel,
				);
				expect(participantOverwrite.allow).toContain(PermissionFlagsBits.Speak);
				expect(participantOverwrite.type).toBe(OverwriteType.Member);
			}
		});

		it('should continue creating channels even if one fails', async () => {
			const shortId = faker.string.alphanumeric(5);
			const participantIds = [faker.string.uuid()];
			const everyoneRoleId = faker.string.uuid();
			const botUserId = faker.string.uuid();

			const mockChannels = [
				{ id: faker.string.uuid() },
				{ id: faker.string.uuid() },
			];

			const guild = {
				channels: {
					create: vi
						.fn()
						.mockResolvedValueOnce(mockChannels[0])
						.mockRejectedValue(new Error('Creation failed'))
						.mockResolvedValueOnce(mockChannels[1]),
				},
				roles: {
					everyone: {
						id: everyoneRoleId,
					},
				},
			} as unknown as Guild;

			const parentChannel = {
				parent: faker.string.uuid(),
			} as unknown as TextChannel;

			const appClient = {
				user: {
					id: botUserId,
				},
			} as unknown as Client;

			const consoleSpy = vi
				.spyOn(console, 'error')
				.mockImplementation(() => {});

			const result = await voiceChannelManager.createEventVoiceChannels(
				guild,
				parentChannel,
				participantIds,
				shortId,
				appClient,
			);

			expect(result).toHaveLength(2);
			// With TEST_RETRY_OPTIONS (2 retries), errors will be logged multiple times
			expect(consoleSpy).toHaveBeenCalled();

			consoleSpy.mockRestore();
		});
	});

	describe('grantAccess', () => {
		it('should grant access to a voice channel', async () => {
			const channelId = faker.string.uuid();
			const userId = faker.string.uuid();

			const mockChannel = {
				isVoiceBased: vi.fn().mockReturnValue(true),
				permissionOverwrites: {
					edit: vi.fn().mockResolvedValue(undefined),
				},
			};

			const appClient = {
				channels: {
					fetch: vi.fn().mockResolvedValue(mockChannel),
				},
			} as unknown as Client;

			const result = await voiceChannelManager.grantAccess(
				appClient,
				channelId,
				userId,
			);

			expect(result).toBe(true);
			expect(mockChannel.permissionOverwrites.edit).toHaveBeenCalledWith(
				userId,
				{
					Connect: true,
					ViewChannel: true,
					Speak: true,
				},
			);
		});

		it('should return false when channel is not voice-based', async () => {
			const channelId = faker.string.uuid();
			const userId = faker.string.uuid();

			const mockChannel = {
				isVoiceBased: vi.fn().mockReturnValue(false),
			};

			const appClient = {
				channels: {
					fetch: vi.fn().mockResolvedValue(mockChannel),
				},
			} as never;

			const result = await voiceChannelManager.grantAccess(
				appClient,
				channelId,
				userId,
			);

			expect(result).toBe(false);
		});

		it('should return false when channel fetch fails', async () => {
			const channelId = faker.string.uuid();
			const userId = faker.string.uuid();

			const appClient = {
				channels: {
					fetch: vi.fn().mockRejectedValue(new Error('Fetch failed')),
				},
			} as unknown as Client;

			const consoleSpy = vi
				.spyOn(console, 'error')
				.mockImplementation(() => {});

			const result = await voiceChannelManager.grantAccess(
				appClient,
				channelId,
				userId,
			);

			expect(result).toBe(false);
			expect(consoleSpy).toHaveBeenCalled();
			const errorOutput = consoleSpy.mock.calls[
				consoleSpy.mock.calls.length - 1
			][0] as string;
			expect(errorOutput).toContain(
				'[LOW] Failed to grant voice channel access',
			);

			consoleSpy.mockRestore();
		});
	});

	describe('revokeAccess', () => {
		it('should revoke access from a voice channel', async () => {
			const channelId = faker.string.uuid();
			const userId = faker.string.uuid();

			const mockChannel = {
				isVoiceBased: vi.fn().mockReturnValue(true),
				permissionOverwrites: {
					edit: vi.fn().mockResolvedValue(undefined),
				},
			};

			const appClient = {
				channels: {
					fetch: vi.fn().mockResolvedValue(mockChannel),
				},
			} as unknown as Client;

			const result = await voiceChannelManager.revokeAccess(
				appClient,
				channelId,
				userId,
			);

			expect(result).toBe(true);
			expect(mockChannel.permissionOverwrites.edit).toHaveBeenCalledWith(
				userId,
				{
					Connect: false,
					ViewChannel: false,
					Speak: false,
				},
			);
		});

		it('should return false when channel is not voice-based', async () => {
			const channelId = faker.string.uuid();
			const userId = faker.string.uuid();

			const mockChannel = {
				isVoiceBased: vi.fn().mockReturnValue(false),
			};

			const appClient = {
				channels: {
					fetch: vi.fn().mockResolvedValue(mockChannel),
				},
			} as unknown as Client;

			const result = await voiceChannelManager.revokeAccess(
				appClient,
				channelId,
				userId,
			);

			expect(result).toBe(false);
		});

		it('should return false when permission edit fails', async () => {
			const channelId = faker.string.uuid();
			const userId = faker.string.uuid();

			const mockChannel = {
				isVoiceBased: vi.fn().mockReturnValue(true),
				permissionOverwrites: {
					edit: vi.fn().mockRejectedValue(new Error('Edit failed')),
				},
			};

			const appClient = {
				channels: {
					fetch: vi.fn().mockResolvedValue(mockChannel),
				},
			} as unknown as Client;

			const consoleSpy = vi
				.spyOn(console, 'error')
				.mockImplementation(() => {});

			const result = await voiceChannelManager.revokeAccess(
				appClient,
				channelId,
				userId,
			);

			expect(result).toBe(false);
			expect(consoleSpy).toHaveBeenCalled();
			const errorOutput = consoleSpy.mock.calls[
				consoleSpy.mock.calls.length - 1
			][0] as string;
			expect(errorOutput).toContain(
				'[LOW] Failed to revoke voice channel access',
			);

			consoleSpy.mockRestore();
		});
	});

	describe('grantAccessToChannels', () => {
		it('should grant access to multiple channels', async () => {
			const channelIds = [
				faker.string.uuid(),
				faker.string.uuid(),
				faker.string.uuid(),
			];
			const userId = faker.string.uuid();

			const mockChannel = {
				isVoiceBased: vi.fn().mockReturnValue(true),
				permissionOverwrites: {
					edit: vi.fn().mockResolvedValue(undefined),
				},
			};

			const appClient = {
				channels: {
					fetch: vi.fn().mockResolvedValue(mockChannel),
				},
			} as unknown as Client;

			await voiceChannelManager.grantAccessToChannels(
				appClient,
				channelIds,
				userId,
			);

			expect(appClient.channels.fetch).toHaveBeenCalledTimes(3);
			for (const channelId of channelIds) {
				expect(appClient.channels.fetch).toHaveBeenCalledWith(channelId);
			}
		});
	});

	describe('revokeAccessFromChannels', () => {
		it('should revoke access from multiple channels', async () => {
			const channelIds = [faker.string.uuid(), faker.string.uuid()];
			const userId = faker.string.uuid();

			const mockChannel = {
				isVoiceBased: vi.fn().mockReturnValue(true),
				permissionOverwrites: {
					edit: vi.fn().mockResolvedValue(undefined),
				},
			};

			const appClient = {
				channels: {
					fetch: vi.fn().mockResolvedValue(mockChannel),
				},
			} as unknown as Client;

			await voiceChannelManager.revokeAccessFromChannels(
				appClient,
				channelIds,
				userId,
			);

			expect(appClient.channels.fetch).toHaveBeenCalledTimes(2);
		});
	});

	describe('deleteChannel', () => {
		it('should delete a voice channel', async () => {
			const channelId = faker.string.uuid();

			const mockChannel = {
				isVoiceBased: vi.fn().mockReturnValue(true),
				delete: vi.fn().mockResolvedValue(undefined),
			};

			const appClient = {
				channels: {
					fetch: vi.fn().mockResolvedValue(mockChannel),
				},
			} as unknown as Client;

			const result = await voiceChannelManager.deleteChannel(
				appClient,
				channelId,
			);

			expect(result).toBe(true);
			expect(mockChannel.delete).toHaveBeenCalled();
		});

		it('should return false when channel is not voice-based', async () => {
			const channelId = faker.string.uuid();

			const mockChannel = {
				isVoiceBased: vi.fn().mockReturnValue(false),
			};

			const appClient = {
				channels: {
					fetch: vi.fn().mockResolvedValue(mockChannel),
				},
			} as unknown as Client;

			const result = await voiceChannelManager.deleteChannel(
				appClient,
				channelId,
			);

			expect(result).toBe(false);
		});

		it('should return false when deletion fails', async () => {
			const channelId = faker.string.uuid();

			const mockChannel = {
				isVoiceBased: vi.fn().mockReturnValue(true),
				delete: vi.fn().mockRejectedValue(new Error('Delete failed')),
			};

			const appClient = {
				channels: {
					fetch: vi.fn().mockResolvedValue(mockChannel),
				},
			} as unknown as Client;

			const consoleSpy = vi
				.spyOn(console, 'error')
				.mockImplementation(() => {});

			const result = await voiceChannelManager.deleteChannel(
				appClient,
				channelId,
			);

			expect(result).toBe(false);
			expect(consoleSpy).toHaveBeenCalled();
			const errorOutput = consoleSpy.mock.calls[
				consoleSpy.mock.calls.length - 1
			][0] as string;
			expect(errorOutput).toContain('[LOW] Failed to delete voice channel');

			consoleSpy.mockRestore();
		});
	});

	describe('deleteChannels', () => {
		it('should delete multiple channels', async () => {
			const channelIds = [
				faker.string.uuid(),
				faker.string.uuid(),
				faker.string.uuid(),
			];

			const mockChannel = {
				isVoiceBased: vi.fn().mockReturnValue(true),
				delete: vi.fn().mockResolvedValue(undefined),
			};

			const appClient = {
				channels: {
					fetch: vi.fn().mockResolvedValue(mockChannel),
				},
			} as unknown as Client;

			await voiceChannelManager.deleteChannels(appClient, channelIds);

			expect(appClient.channels.fetch).toHaveBeenCalledTimes(3);
			expect(mockChannel.delete).toHaveBeenCalledTimes(3);
		});

		it('should continue deleting even if one fails', async () => {
			const channelIds = [faker.string.uuid(), faker.string.uuid()];

			const mockChannel1 = {
				isVoiceBased: vi.fn().mockReturnValue(true),
				delete: vi.fn().mockRejectedValue(new Error('Delete failed')),
			};

			const mockChannel2 = {
				isVoiceBased: vi.fn().mockReturnValue(true),
				delete: vi.fn().mockResolvedValue(undefined),
			};

			const appClient = {
				channels: {
					fetch: vi
						.fn()
						.mockResolvedValue(mockChannel1)
						.mockResolvedValueOnce(mockChannel2),
				},
			} as unknown as Client;

			const consoleSpy = vi
				.spyOn(console, 'error')
				.mockImplementation(() => {});

			await voiceChannelManager.deleteChannels(appClient, channelIds);

			// With TEST_RETRY_OPTIONS (2 retries), the first channel will be fetched 3 times (1 initial + 2 retries)
			// The second channel will be fetched once, total = 4
			expect(appClient.channels.fetch).toHaveBeenCalledTimes(4);
			// Should have retry attempt errors + final error
			expect(consoleSpy).toHaveBeenCalled();

			consoleSpy.mockRestore();
		});
	});
});
