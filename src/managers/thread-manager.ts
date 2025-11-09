import {
	ChannelType,
	type EmbedBuilder,
	type TextChannel,
	type ThreadChannel,
} from 'discord.js';

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
			});
			return thread;
		} catch (error) {
			console.error('Failed to create thread:', error);
			return null;
		}
	}

	async fetchThread(channel: TextChannel, threadId: string) {
		try {
			const thread = await channel.threads.fetch(threadId);
			return thread || null;
		} catch (error) {
			console.error(`Failed to fetch thread ${threadId}:`, error);
			return null;
		}
	}

	async sendAndPinEmbed(thread: ThreadChannel, embed: EmbedBuilder) {
		try {
			await thread.send({ embeds: [embed] });
			// Pinning requires the Manage Messages permission, which may not be granted.
			// Wait until Discord has updated their permissions system for pinning to be separate.
			// await message.pin();
			return true;
		} catch (error) {
			console.error('Failed to send and pin message to thread:', error);
			return false;
		}
	}

	async sendMessage(thread: ThreadChannel, content: string) {
		try {
			await thread.send({ content });
			return true;
		} catch (error) {
			console.error('Failed to send message to thread:', error);
			return false;
		}
	}

	async addMember(thread: ThreadChannel, userId: string) {
		try {
			await thread.members.add(userId);
			return true;
		} catch (error) {
			console.error(`Failed to add user ${userId} to thread:`, error);
			return false;
		}
	}

	async removeMember(thread: ThreadChannel, userId: string) {
		try {
			await thread.members.remove(userId);
			return true;
		} catch (error) {
			console.error(`Failed to remove user ${userId} from thread:`, error);
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
			console.error('Failed to lock and archive thread:', error);
			return false;
		}
	}
}
