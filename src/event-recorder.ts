import { Pool } from 'pg';
import type { TelemetryContext, TelemetryEvent } from './types.js';

type ParticipantRecord = {
	userId?: string;
};

type EventRecorderOptions = {
	schema?: string | null;
	table?: string | null;
};

const DEFAULT_SCHEMA = 'public';
const DEFAULT_TABLE = 'telemetry_events';

export class EventRecorder {
	private pool: Pool;
	private initialized = false;
	private readonly schemaName: string;
	private readonly tableName: string;
	private readonly tableReference: string;

	constructor(connectionString: string, options: EventRecorderOptions = {}) {
		this.schemaName = this.resolveIdentifier(options.schema, DEFAULT_SCHEMA);
		this.tableName = this.resolveIdentifier(options.table, DEFAULT_TABLE);
		this.tableReference = `${this.quoteIdentifier(this.schemaName)}.${this.quoteIdentifier(this.tableName)}`;
		this.pool = new Pool({ connectionString });
	}

	async initialize() {
		try {
			await this.ensureSchema();
		} catch (error) {
			console.error('Failed to initialize event recorder', error);
		}
	}

	async record(event: TelemetryEvent, context?: TelemetryContext) {
		try {
			await this.ensureSchema();

			const actorUserId = this.extractActorUserId(event);
			const participantIds = this.extractParticipantIds(event);

			await this.pool.query(
				`INSERT INTO ${this.tableReference} (
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

		await this.pool.query(
			`CREATE SCHEMA IF NOT EXISTS ${this.quoteIdentifier(this.schemaName)}`,
		);

		await this.pool.query(`
			CREATE TABLE IF NOT EXISTS ${this.tableReference} (
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

		const participants = (data as Record<string, unknown>).participants as
			| ParticipantRecord[]
			| undefined;

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

	private resolveIdentifier(
		value: string | null | undefined,
		fallback: string,
	): string {
		if (!value) return fallback;

		const trimmed = value.trim();
		if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(trimmed)) {
			console.warn(
				`Invalid identifier "${value}" supplied to EventRecorder. Falling back to "${fallback}".`,
			);
			return fallback;
		}

		return trimmed;
	}

	private quoteIdentifier(identifier: string) {
		return `"${identifier.replace(/"/g, '""')}"`;
	}
}
