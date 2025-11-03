import type { ParticipantData } from '../types';

export interface TelemetryEventData {
	guildId: string;
	eventId: string;
	userId: string;
	participants: ParticipantData[];
	channelId: string;
	matchId: string;
	timeToStart?: number;
}

export interface EventRecorderOptions {
	schema?: string;
	table?: string;
}
