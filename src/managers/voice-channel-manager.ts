import {
	ChannelType,
	type Client,
	type Guild,
	OverwriteType,
	PermissionFlagsBits,
	type TextChannel,
} from 'discord.js';
import { VOICE_CHANNEL_NAME, VOICE_CHANNEL_NAMES } from '../constants.js';
import { ErrorSeverity, handleError } from '../utils/error-handler.js';
import {
	LOW_RETRY_OPTIONS,
	MEDIUM_RETRY_OPTIONS,
	withRetry,
} from '../utils/retry.js';

/**
 * Manages Discord voice channel operations for events.
 * Provides an interface for creating, managing permissions, and cleaning up voice channels.
 */
export class VoiceChannelManager {
	async createEventVoiceChannels(
		guild: Guild,
		parentChannel: TextChannel,
		participantIds: string[],
		shortId: string,
		appClient: Client,
	) {
		const voiceChannels: string[] = [];

		for (let i = 0; i < VOICE_CHANNEL_NAMES.length; i++) {
			try {
				const voiceChannel = await withRetry(
					() =>
						guild.channels.create({
							name: VOICE_CHANNEL_NAME(VOICE_CHANNEL_NAMES[i], shortId),
							type: ChannelType.GuildVoice,
							parent: parentChannel.parent,
							permissionOverwrites: [
								{
									id: guild.roles.everyone.id,
									deny: [
										PermissionFlagsBits.Connect,
										PermissionFlagsBits.ViewChannel,
									],
									type: OverwriteType.Role,
								},
								{
									id: appClient.user?.id || '',
									allow: [
										PermissionFlagsBits.Connect,
										PermissionFlagsBits.ViewChannel,
										PermissionFlagsBits.ManageChannels,
									],
									type: OverwriteType.Member,
								},
								...participantIds.map((userId) => ({
									id: userId,
									allow: [
										PermissionFlagsBits.Connect,
										PermissionFlagsBits.ViewChannel,
										PermissionFlagsBits.Speak,
									],
									type: OverwriteType.Member,
								})),
							],
						}),
					MEDIUM_RETRY_OPTIONS,
				);
				voiceChannels.push(voiceChannel.id);
			} catch (error) {
				handleError({
					reason: 'Failed to create event voice channel',
					severity: ErrorSeverity.MEDIUM,
					error,
					metadata: {
						channelName: VOICE_CHANNEL_NAMES[i],
						guildId: guild.id,
						shortId,
					},
				});
			}
		}

		return voiceChannels;
	}

	async grantAccess(appClient: Client, channelId: string, userId: string) {
		try {
			const voiceChannel = await withRetry(
				() => appClient.channels.fetch(channelId),
				MEDIUM_RETRY_OPTIONS,
			);

			if (voiceChannel?.isVoiceBased()) {
				await withRetry(
					() =>
						voiceChannel.permissionOverwrites.edit(userId, {
							Connect: true,
							ViewChannel: true,
							Speak: true,
						}),
					MEDIUM_RETRY_OPTIONS,
				);
				return true;
			}
			return false;
		} catch (error) {
			handleError({
				reason: 'Failed to grant voice channel access',
				severity: ErrorSeverity.LOW,
				error,
				metadata: { userId, channelId },
			});
			return false;
		}
	}

	async revokeAccess(appClient: Client, channelId: string, userId: string) {
		try {
			const voiceChannel = await withRetry(
				() => appClient.channels.fetch(channelId),
				MEDIUM_RETRY_OPTIONS,
			);

			if (voiceChannel?.isVoiceBased()) {
				await withRetry(
					() =>
						voiceChannel.permissionOverwrites.edit(userId, {
							Connect: false,
							ViewChannel: false,
							Speak: false,
						}),
					MEDIUM_RETRY_OPTIONS,
				);
				return true;
			}
			return false;
		} catch (error) {
			handleError({
				reason: 'Failed to revoke voice channel access',
				severity: ErrorSeverity.LOW,
				error,
				metadata: { userId, channelId },
			});
			return false;
		}
	}

	async grantAccessToChannels(
		appClient: Client,
		channelIds: string[],
		userId: string,
	) {
		await Promise.allSettled(
			channelIds.map((channelId) =>
				this.grantAccess(appClient, channelId, userId),
			),
		);
	}

	async revokeAccessFromChannels(
		appClient: Client,
		channelIds: string[],
		userId: string,
		guild: Guild,
	) {
		await Promise.allSettled(
			channelIds.map((channelId) =>
				this.revokeAccess(appClient, channelId, userId),
			),
		);

		await this.disconnectUser(userId, guild);
	}

	async disconnectUser(userId: string, guild: Guild) {
		try {
			const member = await withRetry(
				() => guild.members.fetch(userId),
				MEDIUM_RETRY_OPTIONS,
			);

			if (member.voice.channelId) {
				await withRetry(() => member.voice.disconnect(), MEDIUM_RETRY_OPTIONS);
			}
		} catch (error) {
			handleError({
				reason: 'Failed to disconnect user from voice channel',
				severity: ErrorSeverity.LOW,
				error,
				metadata: { userId },
			});
		}
	}

	async deleteChannel(appClient: Client, channelId: string) {
		try {
			await withRetry(async () => {
				const channel = await appClient.channels.fetch(channelId);
				if (channel?.isVoiceBased()) {
					await channel.delete();
				} else {
					throw new Error('Channel not found or not voice-based');
				}
			}, LOW_RETRY_OPTIONS);
			return true;
		} catch (error) {
			handleError({
				reason: 'Failed to delete voice channel',
				severity: ErrorSeverity.LOW,
				error,
				metadata: { channelId },
			});
			return false;
		}
	}

	async deleteChannels(appClient: Client, channelIds: string[]) {
		await Promise.allSettled(
			channelIds.map((channelId) => this.deleteChannel(appClient, channelId)),
		);
	}
}
