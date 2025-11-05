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
