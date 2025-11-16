import {
	ChannelType,
	type EmbedBuilder,
	type TextChannel,
	type ThreadChannel,
} from 'discord.js';
import { ErrorSeverity, handleError } from '../utils/error-handler.js';

/**
 * Manages Discord thread operations for events.
 * Provides an interface for creating, managing, and interacting with threads.
 */
export class ThreadManager {
	async createEventThread(channel: TextChannel, shortId: string) {
		try {
			const thread = await channel.threads.create({
				name: `8s Event - ${shortId}`,
				autoArchiveDuration: 60,
				type: ChannelType.PrivateThread,
				invitable: false,
			});
			return thread;
		} catch (error) {
			handleError({
				reason: 'Failed to create event thread',
				severity: ErrorSeverity.MEDIUM,
				error,
				metadata: { channelId: channel.id, shortId },
			});
			return null;
		}
	}

	async fetchThread(channel: TextChannel, threadId: string) {
		try {
			const thread = await channel.threads.fetch(threadId);
			return thread || null;
		} catch (error) {
			handleError({
				reason: 'Failed to fetch thread',
				severity: ErrorSeverity.LOW,
				error,
				metadata: { threadId, channelId: channel.id },
			});
			return null;
		}
	}

	async sendAndPinEmbed(thread: ThreadChannel, embed: EmbedBuilder) {
		try {
			await thread.send({ embeds: [embed] });
			// Pinning requires the Manage Messages permission, which may not be granted.
			// Wait until Discord has updated their permissions system for pinning to be separate.
			// Make sure to update test if this is enabled.
			// await message.pin();
			return true;
		} catch (error) {
			handleError({
				reason: 'Failed to send message to thread',
				severity: ErrorSeverity.LOW,
				error,
				metadata: { threadId: thread.id },
			});
			return false;
		}
	}

	async sendMessage(thread: ThreadChannel, content: string) {
		try {
			await thread.send({ content });
			return true;
		} catch (error) {
			handleError({
				reason: 'Failed to send text message to thread',
				severity: ErrorSeverity.LOW,
				error,
				metadata: { threadId: thread.id },
			});
			return false;
		}
	}

	async addMember(thread: ThreadChannel, userId: string) {
		try {
			await thread.members.add(userId);
			return true;
		} catch (error) {
			handleError({
				reason: 'Failed to add user to thread',
				severity: ErrorSeverity.LOW,
				error,
				metadata: { userId, threadId: thread.id },
			});
			return false;
		}
	}

	async removeMember(thread: ThreadChannel, userId: string) {
		try {
			await thread.members.remove(userId);
			return true;
		} catch (error) {
			handleError({
				reason: 'Failed to remove user from thread',
				severity: ErrorSeverity.LOW,
				error,
				metadata: { userId, threadId: thread.id },
			});
			return false;
		}
	}

	async addMembers(thread: ThreadChannel, userIds: string[]) {
		await Promise.allSettled(
			userIds.map((userId) => this.addMember(thread, userId)),
		);
	}

	async lockAndArchive(thread: ThreadChannel) {
		try {
			await thread.setLocked(true);
			await thread.setArchived(true);
			return true;
		} catch (error) {
			handleError({
				reason: 'Failed to lock and archive thread',
				severity: ErrorSeverity.LOW,
				error,
				metadata: { threadId: thread.id },
			});
			return false;
		}
	}
}
