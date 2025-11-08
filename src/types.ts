export type ParticipantData = {
	userId: string;
	role: string;
	rank: string | null;
};

export type ParticipantMap = Map<string, ParticipantData>;

export interface EventTimer {
	startTime: number;
	duration?: number;
	hasStarted: boolean;
}

export type EventOperation =
	| 'starting'
	| 'finishing'
	| 'cancelling'
	| 'cleanup';

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
