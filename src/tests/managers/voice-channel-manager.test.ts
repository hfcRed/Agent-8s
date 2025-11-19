import type { Client, Guild, TextChannel } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VoiceChannelManager } from '../../managers/voice-channel-manager.js';

vi.mock('../../utils/retry.js', () => ({
	withRetry: vi.fn((fn) => fn()),
	MEDIUM_RETRY_OPTIONS: {},
	LOW_RETRY_OPTIONS: {},
}));

vi.mock('../../utils/error-handler.js', () => ({
	handleError: vi.fn(),
	ErrorSeverity: {
		LOW: 'LOW',
		MEDIUM: 'MEDIUM',
		HIGH: 'HIGH',
	},
}));

describe('VoiceChannelManager', () => {
	let voiceChannelManager: VoiceChannelManager;

	beforeEach(() => {
		voiceChannelManager = new VoiceChannelManager();
		vi.clearAllMocks();
	});

	describe('createEventVoiceChannels', () => {
		it('should create multiple voice channels', async () => {
			const createSpy = vi
				.fn()
				.mockResolvedValueOnce({ id: 'voice-1' })
				.mockResolvedValueOnce({ id: 'voice-2' })
				.mockResolvedValueOnce({ id: 'voice-3' });

			const guild = {
				id: 'guild-123',
				channels: {
					create: createSpy,
				},
				roles: {
					everyone: {
						id: 'everyone-role',
					},
				},
			} as unknown as Guild;

			const parentChannel = {
				parent: { id: 'parent-123' },
			} as unknown as TextChannel;

			const client = {
				user: {
					id: 'bot-123',
				},
			} as unknown as Client;

			const result = await voiceChannelManager.createEventVoiceChannels(
				guild,
				parentChannel,
				['user1', 'user2'],
				'ABC12',
				client,
			);

			expect(result).toEqual(['voice-1', 'voice-2', 'voice-3']);
			expect(createSpy).toHaveBeenCalledTimes(3);
		});

		it('should continue creating channels if one fails', async () => {
			const createSpy = vi
				.fn()
				.mockResolvedValueOnce({ id: 'voice-1' })
				.mockRejectedValueOnce(new Error('Failed'))
				.mockResolvedValueOnce({ id: 'voice-3' });

			const guild = {
				id: 'guild-123',
				channels: {
					create: createSpy,
				},
				roles: {
					everyone: {
						id: 'everyone-role',
					},
				},
			} as unknown as Guild;

			const parentChannel = {
				parent: { id: 'parent-123' },
			} as unknown as TextChannel;

			const client = {
				user: {
					id: 'bot-123',
				},
			} as unknown as Client;

			const result = await voiceChannelManager.createEventVoiceChannels(
				guild,
				parentChannel,
				['user1'],
				'ABC12',
				client,
			);

			expect(result.length).toBe(2);
			expect(result).toContain('voice-1');
			expect(result).toContain('voice-3');
		});

		it('should set permissions for participants', async () => {
			const createSpy = vi.fn().mockResolvedValue({ id: 'voice-1' });

			const guild = {
				id: 'guild-123',
				channels: {
					create: createSpy,
				},
				roles: {
					everyone: {
						id: 'everyone-role',
					},
				},
			} as unknown as Guild;

			const parentChannel = {
				parent: { id: 'parent-123' },
			} as unknown as TextChannel;

			const client = {
				user: {
					id: 'bot-123',
				},
			} as unknown as Client;

			await voiceChannelManager.createEventVoiceChannels(
				guild,
				parentChannel,
				['user1', 'user2', 'user3'],
				'ABC12',
				client,
			);

			const callArgs = createSpy.mock.calls[0][0];
			expect(callArgs.permissionOverwrites.length).toBeGreaterThanOrEqual(5);
		});
	});

	describe('grantAccess', () => {
		it('should grant access to voice channel', async () => {
			const editSpy = vi.fn().mockResolvedValue(undefined);
			const fetchSpy = vi.fn().mockResolvedValue({
				isVoiceBased: () => true,
				permissionOverwrites: {
					edit: editSpy,
				},
			});

			const client = {
				channels: {
					fetch: fetchSpy,
				},
			} as unknown as Client;

			const result = await voiceChannelManager.grantAccess(
				client,
				'channel-123',
				'user-123',
			);

			expect(result).toBe(true);
			expect(editSpy).toHaveBeenCalledWith('user-123', {
				Connect: true,
				ViewChannel: true,
				Speak: true,
			});
		});

		it('should return false when channel is not voice-based', async () => {
			const fetchSpy = vi.fn().mockResolvedValue({
				isVoiceBased: () => false,
			});

			const client = {
				channels: {
					fetch: fetchSpy,
				},
			} as unknown as Client;

			const result = await voiceChannelManager.grantAccess(
				client,
				'channel-123',
				'user-123',
			);

			expect(result).toBe(false);
		});

		it('should return false on error', async () => {
			const fetchSpy = vi.fn().mockRejectedValue(new Error('Network error'));

			const client = {
				channels: {
					fetch: fetchSpy,
				},
			} as unknown as Client;

			const result = await voiceChannelManager.grantAccess(
				client,
				'channel-123',
				'user-123',
			);

			expect(result).toBe(false);
		});
	});

	describe('revokeAccess', () => {
		it('should revoke access from voice channel', async () => {
			const editSpy = vi.fn().mockResolvedValue(undefined);
			const fetchSpy = vi.fn().mockResolvedValue({
				isVoiceBased: () => true,
				permissionOverwrites: {
					edit: editSpy,
				},
			});

			const client = {
				channels: {
					fetch: fetchSpy,
				},
			} as unknown as Client;

			const result = await voiceChannelManager.revokeAccess(
				client,
				'channel-123',
				'user-123',
			);

			expect(result).toBe(true);
			expect(editSpy).toHaveBeenCalledWith('user-123', {
				Connect: false,
				ViewChannel: false,
				Speak: false,
			});
		});

		it('should return false on error', async () => {
			const fetchSpy = vi.fn().mockRejectedValue(new Error('Failed'));

			const client = {
				channels: {
					fetch: fetchSpy,
				},
			} as unknown as Client;

			const result = await voiceChannelManager.revokeAccess(
				client,
				'channel-123',
				'user-123',
			);

			expect(result).toBe(false);
		});
	});

	describe('grantAccessToChannels', () => {
		it('should grant access to multiple channels', async () => {
			const grantSpy = vi
				.spyOn(voiceChannelManager, 'grantAccess')
				.mockResolvedValue(true);

			const client = {} as Client;

			await voiceChannelManager.grantAccessToChannels(
				client,
				['ch1', 'ch2', 'ch3'],
				'user-123',
			);

			expect(grantSpy).toHaveBeenCalledTimes(3);
		});
	});

	describe('revokeAccessFromChannels', () => {
		it('should revoke access from multiple channels', async () => {
			const revokeSpy = vi
				.spyOn(voiceChannelManager, 'revokeAccess')
				.mockResolvedValue(true);
			const disconnectSpy = vi
				.spyOn(voiceChannelManager, 'disconnectUser')
				.mockResolvedValue(undefined);

			const client = {} as Client;
			const guild = {} as Guild;

			await voiceChannelManager.revokeAccessFromChannels(
				client,
				['ch1', 'ch2'],
				'user-123',
				guild,
			);

			expect(revokeSpy).toHaveBeenCalledTimes(2);
			expect(disconnectSpy).toHaveBeenCalledWith('user-123', guild);
		});
	});

	describe('disconnectUser', () => {
		it('should disconnect user from voice channel', async () => {
			const disconnectSpy = vi.fn().mockResolvedValue(undefined);
			const fetchSpy = vi.fn().mockResolvedValue({
				voice: {
					channelId: 'voice-123',
					disconnect: disconnectSpy,
				},
			});

			const guild = {
				members: {
					fetch: fetchSpy,
				},
			} as unknown as Guild;

			await voiceChannelManager.disconnectUser('user-123', guild);

			expect(disconnectSpy).toHaveBeenCalled();
		});

		it('should not attempt disconnect if user not in voice', async () => {
			const fetchSpy = vi.fn().mockResolvedValue({
				voice: {
					channelId: null,
				},
			});

			const guild = {
				members: {
					fetch: fetchSpy,
				},
			} as unknown as Guild;

			await expect(
				voiceChannelManager.disconnectUser('user-123', guild),
			).resolves.not.toThrow();
		});
	});

	describe('deleteChannel', () => {
		it('should delete voice channel', async () => {
			const deleteSpy = vi.fn().mockResolvedValue(undefined);
			const fetchSpy = vi.fn().mockResolvedValue({
				isVoiceBased: () => true,
				delete: deleteSpy,
			});

			const client = {
				channels: {
					fetch: fetchSpy,
				},
			} as unknown as Client;

			const result = await voiceChannelManager.deleteChannel(
				client,
				'channel-123',
			);

			expect(result).toBe(true);
			expect(deleteSpy).toHaveBeenCalled();
		});

		it('should return false when channel is not voice-based', async () => {
			const fetchSpy = vi.fn().mockResolvedValue({
				isVoiceBased: () => false,
			});

			const client = {
				channels: {
					fetch: fetchSpy,
				},
			} as unknown as Client;

			const result = await voiceChannelManager.deleteChannel(
				client,
				'channel-123',
			);

			expect(result).toBe(false);
		});
	});

	describe('deleteChannels', () => {
		it('should delete multiple channels', async () => {
			const deleteSpy = vi
				.spyOn(voiceChannelManager, 'deleteChannel')
				.mockResolvedValue(true);

			const client = {} as Client;

			await voiceChannelManager.deleteChannels(client, ['ch1', 'ch2', 'ch3']);

			expect(deleteSpy).toHaveBeenCalledTimes(3);
		});
	});
});
