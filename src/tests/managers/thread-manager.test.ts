import type { EmbedBuilder, TextChannel, ThreadChannel } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ThreadManager } from '../../managers/thread-manager.js';

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

describe('ThreadManager', () => {
	let threadManager: ThreadManager;

	beforeEach(() => {
		threadManager = new ThreadManager();
		vi.clearAllMocks();
	});

	describe('createEventThread', () => {
		it('should create a private thread with correct parameters', async () => {
			const createSpy = vi.fn().mockResolvedValue({ id: 'thread-123' });
			const channel = {
				id: 'channel-123',
				threads: {
					create: createSpy,
				},
			} as unknown as TextChannel;

			const result = await threadManager.createEventThread(channel, 'ABC12');

			expect(result).toEqual({ id: 'thread-123' });
			expect(createSpy).toHaveBeenCalledWith(
				expect.objectContaining({
					name: expect.stringContaining('ABC12'),
					invitable: false,
				}),
			);
		});

		it('should return null on error', async () => {
			const channel = {
				id: 'channel-123',
				threads: {
					create: vi.fn().mockRejectedValue(new Error('Failed')),
				},
			} as unknown as TextChannel;

			const result = await threadManager.createEventThread(channel, 'ABC12');

			expect(result).toBeNull();
		});
	});

	describe('fetchThread', () => {
		it('should fetch and return existing thread', async () => {
			const thread = { id: 'thread-123' };
			const fetchSpy = vi.fn().mockResolvedValue(thread);
			const channel = {
				id: 'channel-123',
				threads: {
					fetch: fetchSpy,
				},
			} as unknown as TextChannel;

			const result = await threadManager.fetchThread(channel, 'thread-123');

			expect(result).toEqual(thread);
			expect(fetchSpy).toHaveBeenCalledWith('thread-123');
		});

		it('should return null when thread not found', async () => {
			const channel = {
				id: 'channel-123',
				threads: {
					fetch: vi.fn().mockResolvedValue(null),
				},
			} as unknown as TextChannel;

			const result = await threadManager.fetchThread(channel, 'thread-123');

			expect(result).toBeNull();
		});

		it('should return null on error', async () => {
			const channel = {
				id: 'channel-123',
				threads: {
					fetch: vi.fn().mockRejectedValue(new Error('Network error')),
				},
			} as unknown as TextChannel;

			const result = await threadManager.fetchThread(channel, 'thread-123');

			expect(result).toBeNull();
		});
	});

	describe('sendAndPinEmbed', () => {
		it('should send embed to thread', async () => {
			const sendSpy = vi.fn().mockResolvedValue({ id: 'msg-123' });
			const thread = {
				id: 'thread-123',
				send: sendSpy,
			} as unknown as ThreadChannel;

			const embed = { data: { title: 'Test' } } as EmbedBuilder;

			const result = await threadManager.sendAndPinEmbed(thread, embed);

			expect(result).toBe(true);
			expect(sendSpy).toHaveBeenCalledWith({ embeds: [embed] });
		});

		it('should return false on error', async () => {
			const thread = {
				id: 'thread-123',
				send: vi.fn().mockRejectedValue(new Error('Failed')),
			} as unknown as ThreadChannel;

			const embed = { data: { title: 'Test' } } as EmbedBuilder;

			const result = await threadManager.sendAndPinEmbed(thread, embed);

			expect(result).toBe(false);
		});
	});

	describe('sendMessage', () => {
		it('should send text message to thread', async () => {
			const sendSpy = vi.fn().mockResolvedValue({ id: 'msg-123' });
			const thread = {
				id: 'thread-123',
				send: sendSpy,
			} as unknown as ThreadChannel;

			const result = await threadManager.sendMessage(thread, 'Hello');

			expect(result).toBe(true);
			expect(sendSpy).toHaveBeenCalledWith({ content: 'Hello' });
		});

		it('should return false on error', async () => {
			const thread = {
				id: 'thread-123',
				send: vi.fn().mockRejectedValue(new Error('Failed')),
			} as unknown as ThreadChannel;

			const result = await threadManager.sendMessage(thread, 'Hello');

			expect(result).toBe(false);
		});
	});

	describe('addMember', () => {
		it('should add user to thread', async () => {
			const addSpy = vi.fn().mockResolvedValue(undefined);
			const thread = {
				id: 'thread-123',
				members: {
					add: addSpy,
				},
			} as unknown as ThreadChannel;

			const result = await threadManager.addMember(thread, 'user-123');

			expect(result).toBe(true);
			expect(addSpy).toHaveBeenCalledWith('user-123');
		});

		it('should return false on error', async () => {
			const thread = {
				id: 'thread-123',
				members: {
					add: vi.fn().mockRejectedValue(new Error('Failed')),
				},
			} as unknown as ThreadChannel;

			const result = await threadManager.addMember(thread, 'user-123');

			expect(result).toBe(false);
		});
	});

	describe('removeMember', () => {
		it('should remove user from thread', async () => {
			const removeSpy = vi.fn().mockResolvedValue(undefined);
			const thread = {
				id: 'thread-123',
				members: {
					remove: removeSpy,
				},
			} as unknown as ThreadChannel;

			const result = await threadManager.removeMember(thread, 'user-123');

			expect(result).toBe(true);
			expect(removeSpy).toHaveBeenCalledWith('user-123');
		});

		it('should return false on error', async () => {
			const thread = {
				id: 'thread-123',
				members: {
					remove: vi.fn().mockRejectedValue(new Error('Failed')),
				},
			} as unknown as ThreadChannel;

			const result = await threadManager.removeMember(thread, 'user-123');

			expect(result).toBe(false);
		});
	});

	describe('addMembers', () => {
		it('should add multiple users to thread', async () => {
			const addMemberSpy = vi
				.spyOn(threadManager, 'addMember')
				.mockResolvedValue(true);
			const thread = {} as ThreadChannel;

			await threadManager.addMembers(thread, ['user1', 'user2', 'user3']);

			expect(addMemberSpy).toHaveBeenCalledTimes(3);
			expect(addMemberSpy).toHaveBeenCalledWith(thread, 'user1');
			expect(addMemberSpy).toHaveBeenCalledWith(thread, 'user2');
			expect(addMemberSpy).toHaveBeenCalledWith(thread, 'user3');
		});

		it('should handle failures gracefully', async () => {
			vi.spyOn(threadManager, 'addMember')
				.mockResolvedValueOnce(true)
				.mockRejectedValueOnce(new Error('Failed'))
				.mockResolvedValueOnce(true);

			const thread = {} as ThreadChannel;

			await expect(
				threadManager.addMembers(thread, ['user1', 'user2', 'user3']),
			).resolves.not.toThrow();
		});
	});

	describe('lockAndArchive', () => {
		it('should lock and archive thread', async () => {
			const setLockedSpy = vi.fn().mockResolvedValue(undefined);
			const setArchivedSpy = vi.fn().mockResolvedValue(undefined);
			const thread = {
				id: 'thread-123',
				setLocked: setLockedSpy,
				setArchived: setArchivedSpy,
			} as unknown as ThreadChannel;

			const result = await threadManager.lockAndArchive(thread);

			expect(result).toBe(true);
			expect(setLockedSpy).toHaveBeenCalledWith(true);
			expect(setArchivedSpy).toHaveBeenCalledWith(true);
		});

		it('should return false on error', async () => {
			const thread = {
				id: 'thread-123',
				setLocked: vi.fn().mockRejectedValue(new Error('Failed')),
				setArchived: vi.fn().mockResolvedValue(undefined),
			} as unknown as ThreadChannel;

			const result = await threadManager.lockAndArchive(thread);

			expect(result).toBe(false);
		});
	});
});
