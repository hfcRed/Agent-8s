import { faker } from '@faker-js/faker';
import {
	ChannelType,
	type EmbedBuilder,
	type TextChannel,
	type ThreadChannel,
} from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ThreadManager } from '../managers/thread-manager.js';

describe('ThreadManager', () => {
	let threadManager: ThreadManager;

	beforeEach(() => {
		threadManager = new ThreadManager();
	});

	describe('createEventThread', () => {
		it('should create a thread with correct name and settings', async () => {
			const shortId = faker.string.alphanumeric(5);
			const mockThread = {
				id: faker.string.uuid(),
				name: `8s Event - ${shortId}`,
			};

			const channel = {
				threads: {
					create: vi.fn().mockResolvedValue(mockThread),
				},
			} as unknown as TextChannel;

			const result = await threadManager.createEventThread(channel, shortId);

			expect(result).toBe(mockThread);
			expect(channel.threads.create).toHaveBeenCalledWith({
				name: `8s Event - ${shortId}`,
				autoArchiveDuration: 60,
				type: ChannelType.PrivateThread,
				invitable: false,
			});
		});

		it('should return null when thread creation fails', async () => {
			const shortId = faker.string.alphanumeric(5);
			const channel = {
				threads: {
					create: vi.fn().mockRejectedValue(new Error('Creation failed')),
				},
			} as unknown as TextChannel;

			const consoleSpy = vi
				.spyOn(console, 'error')
				.mockImplementation(() => {});

			const result = await threadManager.createEventThread(channel, shortId);

			expect(result).toBeNull();
			expect(consoleSpy).toHaveBeenCalled();
			const errorOutput = consoleSpy.mock.calls[0][0] as string;
			expect(errorOutput).toContain('[MEDIUM] Failed to create event thread');

			consoleSpy.mockRestore();
		});
	});

	describe('fetchThread', () => {
		it('should fetch an existing thread', async () => {
			const threadId = faker.string.uuid();
			const mockThread = {
				id: threadId,
				name: faker.lorem.words(3),
			};

			const channel = {
				threads: {
					fetch: vi.fn().mockResolvedValue(mockThread),
				},
			} as unknown as TextChannel;

			const result = await threadManager.fetchThread(channel, threadId);

			expect(result).toBe(mockThread);
			expect(channel.threads.fetch).toHaveBeenCalledWith(threadId);
		});

		it('should return null when thread does not exist', async () => {
			const threadId = faker.string.uuid();
			const channel = {
				threads: {
					fetch: vi.fn().mockResolvedValue(null),
				},
			} as unknown as TextChannel;

			const result = await threadManager.fetchThread(channel, threadId);

			expect(result).toBeNull();
		});

		it('should return null when fetch fails', async () => {
			const threadId = faker.string.uuid();
			const channel = {
				threads: {
					fetch: vi.fn().mockRejectedValue(new Error('Fetch failed')),
				},
			} as unknown as TextChannel;

			const consoleSpy = vi
				.spyOn(console, 'error')
				.mockImplementation(() => {});

			const result = await threadManager.fetchThread(channel, threadId);

			expect(result).toBeNull();
			expect(consoleSpy).toHaveBeenCalled();
			const errorOutput = consoleSpy.mock.calls[0][0] as string;
			expect(errorOutput).toContain('[LOW] Failed to fetch thread');

			consoleSpy.mockRestore();
		});
	});

	describe('sendAndPinEmbed', () => {
		it('should send and pin an embed message', async () => {
			const mockMessage = {
				pin: vi.fn().mockResolvedValue(undefined),
			};

			const thread = {
				send: vi.fn().mockResolvedValue(mockMessage),
			} as unknown as ThreadChannel;

			const embed = {
				data: { title: faker.lorem.sentence() },
			} as unknown as EmbedBuilder;

			const result = await threadManager.sendAndPinEmbed(thread, embed);

			expect(result).toBe(true);
			expect(thread.send).toHaveBeenCalledWith({ embeds: [embed] });
			// expect(mockMessage.pin).toHaveBeenCalled();
		});

		it('should return false when sending fails', async () => {
			const thread = {
				send: vi.fn().mockRejectedValue(new Error('Send failed')),
			} as unknown as ThreadChannel;

			const embed = {
				data: { title: faker.lorem.sentence() },
			} as unknown as EmbedBuilder;

			const consoleSpy = vi
				.spyOn(console, 'error')
				.mockImplementation(() => {});

			const result = await threadManager.sendAndPinEmbed(thread, embed);

			expect(result).toBe(false);
			expect(consoleSpy).toHaveBeenCalled();
			const errorOutput = consoleSpy.mock.calls[0][0] as string;
			expect(errorOutput).toContain('[LOW] Failed to send message to thread');

			consoleSpy.mockRestore();
		});

		// it('should return false when pinning fails', async () => {
		// 	const mockMessage = {
		// 		pin: vi.fn().mockRejectedValue(new Error('Pin failed')),
		// 	};

		// 	const thread = {
		// 		send: vi.fn().mockResolvedValue(mockMessage),
		// 	} as unknown as ThreadChannel;

		// 	const embed = {
		// 		data: { title: faker.lorem.sentence() },
		// 	} as unknown as EmbedBuilder;

		// 	const consoleSpy = vi
		// 		.spyOn(console, 'error')
		// 		.mockImplementation(() => {});

		// 	const result = await threadManager.sendAndPinEmbed(thread, embed);

		// 	expect(result).toBe(false);
		// 	expect(consoleSpy).toHaveBeenCalledWith(
		// 		'Failed to send and pin message to thread:',
		// 		expect.any(Error),
		// 	);

		// 	consoleSpy.mockRestore();
		// });
	});

	describe('sendMessage', () => {
		it('should send a text message to thread', async () => {
			const content = faker.lorem.sentence();
			const thread = {
				send: vi.fn().mockResolvedValue({}),
			} as unknown as ThreadChannel;

			const result = await threadManager.sendMessage(thread, content);

			expect(result).toBe(true);
			expect(thread.send).toHaveBeenCalledWith({ content });
		});

		it('should return false when sending fails', async () => {
			const content = faker.lorem.sentence();
			const thread = {
				send: vi.fn().mockRejectedValue(new Error('Send failed')),
			} as unknown as ThreadChannel;

			const consoleSpy = vi
				.spyOn(console, 'error')
				.mockImplementation(() => {});

			const result = await threadManager.sendMessage(thread, content);

			expect(result).toBe(false);
			expect(consoleSpy).toHaveBeenCalled();
			const errorOutput = consoleSpy.mock.calls[
				consoleSpy.mock.calls.length - 1
			][0] as string;
			expect(errorOutput).toContain(
				'[LOW] Failed to send text message to thread',
			);

			consoleSpy.mockRestore();
		});
	});

	describe('addMember', () => {
		it('should add a member to the thread', async () => {
			const userId = faker.string.uuid();
			const thread = {
				members: {
					add: vi.fn().mockResolvedValue(undefined),
				},
			} as unknown as ThreadChannel;

			const result = await threadManager.addMember(thread, userId);

			expect(result).toBe(true);
			expect(thread.members.add).toHaveBeenCalledWith(userId);
		});

		it('should return false when adding member fails', async () => {
			const userId = faker.string.uuid();
			const thread = {
				members: {
					add: vi.fn().mockRejectedValue(new Error('Add failed')),
				},
			} as unknown as ThreadChannel;

			const consoleSpy = vi
				.spyOn(console, 'error')
				.mockImplementation(() => {});

			const result = await threadManager.addMember(thread, userId);

			expect(result).toBe(false);
			expect(consoleSpy).toHaveBeenCalled();
			const errorOutput = consoleSpy.mock.calls[
				consoleSpy.mock.calls.length - 1
			][0] as string;
			expect(errorOutput).toContain('[LOW] Failed to add user to thread');

			consoleSpy.mockRestore();
		});
	});

	describe('removeMember', () => {
		it('should remove a member from the thread', async () => {
			const userId = faker.string.uuid();
			const thread = {
				members: {
					remove: vi.fn().mockResolvedValue(undefined),
				},
			} as unknown as ThreadChannel;

			const result = await threadManager.removeMember(thread, userId);

			expect(result).toBe(true);
			expect(thread.members.remove).toHaveBeenCalledWith(userId);
		});

		it('should return false when removing member fails', async () => {
			const userId = faker.string.uuid();
			const thread = {
				members: {
					remove: vi.fn().mockRejectedValue(new Error('Remove failed')),
				},
			} as unknown as ThreadChannel;

			const consoleSpy = vi
				.spyOn(console, 'error')
				.mockImplementation(() => {});

			const result = await threadManager.removeMember(thread, userId);

			expect(result).toBe(false);
			expect(consoleSpy).toHaveBeenCalled();
			const errorOutput = consoleSpy.mock.calls[
				consoleSpy.mock.calls.length - 1
			][0] as string;
			expect(errorOutput).toContain('[LOW] Failed to remove user from thread');

			consoleSpy.mockRestore();
		});
	});

	describe('addMembers', () => {
		it('should add multiple members to the thread', async () => {
			const userIds = [
				faker.string.uuid(),
				faker.string.uuid(),
				faker.string.uuid(),
			];
			const thread = {
				members: {
					add: vi.fn().mockResolvedValue(undefined),
				},
			} as unknown as ThreadChannel;

			await threadManager.addMembers(thread, userIds);

			expect(thread.members.add).toHaveBeenCalledTimes(3);
			for (const userId of userIds) {
				expect(thread.members.add).toHaveBeenCalledWith(userId);
			}
		});

		it('should continue adding members even if one fails', async () => {
			const userIds = [
				faker.string.uuid(),
				faker.string.uuid(),
				faker.string.uuid(),
			];
			const thread = {
				members: {
					add: vi
						.fn()
						.mockResolvedValueOnce(undefined)
						.mockRejectedValueOnce(new Error('Add failed'))
						.mockResolvedValueOnce(undefined),
				},
			} as unknown as ThreadChannel;

			const consoleSpy = vi
				.spyOn(console, 'error')
				.mockImplementation(() => {});

			await threadManager.addMembers(thread, userIds);

			expect(thread.members.add).toHaveBeenCalledTimes(3);
			expect(consoleSpy).toHaveBeenCalledTimes(1);

			consoleSpy.mockRestore();
		});
	});

	describe('lockAndArchive', () => {
		it('should lock and archive the thread', async () => {
			const thread = {
				setLocked: vi.fn().mockResolvedValue(undefined),
				setArchived: vi.fn().mockResolvedValue(undefined),
			} as unknown as ThreadChannel;

			const result = await threadManager.lockAndArchive(thread);

			expect(result).toBe(true);
			expect(thread.setLocked).toHaveBeenCalledWith(true);
			expect(thread.setArchived).toHaveBeenCalledWith(true);
		});

		it('should return false when locking fails', async () => {
			const thread = {
				setLocked: vi.fn().mockRejectedValue(new Error('Lock failed')),
				setArchived: vi.fn().mockResolvedValue(undefined),
			} as unknown as ThreadChannel;

			const consoleSpy = vi
				.spyOn(console, 'error')
				.mockImplementation(() => {});

			const result = await threadManager.lockAndArchive(thread);

			expect(result).toBe(false);
			expect(consoleSpy).toHaveBeenCalled();
			const errorOutput = consoleSpy.mock.calls[
				consoleSpy.mock.calls.length - 1
			][0] as string;
			expect(errorOutput).toContain('[LOW] Failed to lock and archive thread');

			consoleSpy.mockRestore();
		});

		it('should return false when archiving fails', async () => {
			const thread = {
				setLocked: vi.fn().mockResolvedValue(undefined),
				setArchived: vi.fn().mockRejectedValue(new Error('Archive failed')),
			} as unknown as ThreadChannel;

			const consoleSpy = vi
				.spyOn(console, 'error')
				.mockImplementation(() => {});

			const result = await threadManager.lockAndArchive(thread);

			expect(result).toBe(false);
			expect(consoleSpy).toHaveBeenCalled();
			const errorOutput = consoleSpy.mock.calls[
				consoleSpy.mock.calls.length - 1
			][0] as string;
			expect(errorOutput).toContain('[LOW] Failed to lock and archive thread');

			consoleSpy.mockRestore();
		});
	});
});
