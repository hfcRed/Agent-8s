export type ParticipantData = {
	userId: string;
	role: string | null;
};

export type ParticipantMap = Map<string, ParticipantData>;

export interface EventTimer {
	startTime: number;
	duration: number;
	hasStarted: boolean;
}

export interface TelemetryEvent {
	event: string;
	guildId: string;
	eventId: string;
	timestamp: number;
	data: Record<string, unknown>;
}

export interface TelemetryContext {
	channelId?: string;
	matchId?: string;
}
