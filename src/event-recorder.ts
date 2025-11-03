import { Pool } from 'pg';
import type { TelemetryContext, TelemetryEvent } from './types.js';

type ParticipantRecord = {
	userId?: string;
};

export class EventRecorder {
	private pool: Pool;
	private initialized = false;

	constructor(connectionString: string) {
		this.pool = new Pool({ connectionString });
	}

	async record(event: TelemetryEvent, context?: TelemetryContext) {
		try {
			await this.ensureSchema();

			const actorUserId = this.extractActorUserId(event);
			const participantIds = this.extractParticipantIds(event);

			await this.pool.query(
				`INSERT INTO telemetry_events (
					match_uuid,
					event_type,
					guild_id,
					channel_id,
					event_message_id,
					actor_user_id,
					participant_ids,
					payload,
					occurred_at
				) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, to_timestamp($9 / 1000.0))`,
				[
					context?.matchId || null,
					event.event,
					event.guildId,
					context?.channelId || null,
					event.eventId,
					actorUserId,
					participantIds ? JSON.stringify(participantIds) : null,
					JSON.stringify(event.data),
					event.timestamp,
				],
			);
		} catch (error) {
			console.error('Failed to record telemetry event', error);
		}
	}

	async dispose() {
		await this.pool.end();
	}

	private async ensureSchema() {
		if (this.initialized) return;

		await this.pool.query(`
			CREATE TABLE IF NOT EXISTS telemetry_events (
				id BIGSERIAL PRIMARY KEY,
				match_uuid UUID,
				event_type TEXT NOT NULL,
				guild_id TEXT,
				channel_id TEXT,
				event_message_id TEXT,
				actor_user_id TEXT,
				participant_ids JSONB,
				payload JSONB NOT NULL,
				occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
			);
		`);

		this.initialized = true;
	}

	private extractActorUserId(event: TelemetryEvent) {
		const { data } = event;
		if (!data) return null;

		const potentialUserId = (data as Record<string, unknown>).userId;
		return typeof potentialUserId === 'string' ? potentialUserId : null;
	}

	private extractParticipantIds(event: TelemetryEvent) {
		const { data } = event;
		if (!data) return null;

		const participants = (data as Record<string, unknown>)
			.participants as ParticipantRecord[] | undefined;

		if (!Array.isArray(participants)) return null;

		const ids = participants
			.map((participant) =>
				participant && typeof participant.userId === 'string'
					? participant.userId
					: null,
			)
			.filter((id): id is string => id !== null);

		return ids.length > 0 ? ids : null;
	}
}
