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
