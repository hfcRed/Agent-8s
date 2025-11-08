import {
	ChannelType,
	type Client,
	type Guild,
	OverwriteType,
	PermissionFlagsBits,
	type TextChannel,
} from 'discord.js';

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
		const voiceNames = ['👥 Group', '🔵 Team A', '🔴 Team B'];
		const voiceChannels: string[] = [];

		for (let i = 1; i <= 3; i++) {
			try {
				const voiceChannel = await guild.channels.create({
					name: `${voiceNames[i - 1]} - ${shortId}`,
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
				});

				voiceChannels.push(voiceChannel.id);
			} catch (error) {
				console.error(
					`Failed to create voice channel ${voiceNames[i - 1]}:`,
					error,
				);
			}
		}

		return voiceChannels;
	}

	async grantAccess(appClient: Client, channelId: string, userId: string) {
		try {
			const voiceChannel = await appClient.channels.fetch(channelId);
			if (voiceChannel?.isVoiceBased()) {
				await voiceChannel.permissionOverwrites.edit(userId, {
					Connect: true,
					ViewChannel: true,
					Speak: true,
				});
				return true;
			}
			return false;
		} catch (error) {
			console.error(
				`Failed to grant voice channel access for ${userId} in ${channelId}:`,
				error,
			);
			return false;
		}
	}

	async revokeAccess(appClient: Client, channelId: string, userId: string) {
		try {
			const voiceChannel = await appClient.channels.fetch(channelId);
			if (voiceChannel?.isVoiceBased()) {
				await voiceChannel.permissionOverwrites.edit(userId, {
					Connect: false,
					ViewChannel: false,
					Speak: false,
				});
				return true;
			}
			return false;
		} catch (error) {
			console.error(
				`Failed to revoke voice channel access for ${userId} in ${channelId}:`,
				error,
			);
			return false;
		}
	}

	async grantAccessToChannels(
		appClient: Client,
		channelIds: string[],
		userId: string,
	) {
		for (const channelId of channelIds) {
			await this.grantAccess(appClient, channelId, userId);
		}
	}

	async revokeAccessFromChannels(
		appClient: Client,
		channelIds: string[],
		userId: string,
	) {
		for (const channelId of channelIds) {
			await this.revokeAccess(appClient, channelId, userId);
		}
	}

	async deleteChannel(appClient: Client, channelId: string) {
		try {
			const channel = await appClient.channels.fetch(channelId);
			if (channel?.isVoiceBased()) {
				await channel.delete();
				return true;
			}
			return false;
		} catch (error) {
			console.error(`Failed to delete voice channel ${channelId}:`, error);
			return false;
		}
	}

	async deleteChannels(appClient: Client, channelIds: string[]) {
		for (const channelId of channelIds) {
			await this.deleteChannel(appClient, channelId);
		}
	}
}
