import { Pool } from 'pg';
import { DEFAULT_SCHEMA, DEFAULT_TABLE } from '../constants.js';
import { ErrorSeverity, handleError } from '../utils/error-handler.js';
import { DATABASE_RETRY_OPTIONS, withRetry } from '../utils/retry.js';
import type { TelemetryEventData } from './telemetry.js';

interface EventRecorderOptions {
	schema?: string;
	table?: string;
}

/**
 * Class for persisting telemetry events to a PostgreSQL database.
 */
export class EventRecorder {
	private readonly schemaName: string;
	private readonly tableName: string;
	private readonly tableReference: string;
	private pool: Pool;
	private initialized = false;

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
			handleError({
				reason: 'Failed to initialize event recorder schema',
				severity: ErrorSeverity.MEDIUM,
				error,
				metadata: {
					schema: this.schemaName,
					table: this.tableName,
				},
			});
		}
	}

	async record(event: string, data: TelemetryEventData) {
		try {
			await this.ensureSchema();

			await withRetry(
				() =>
					this.pool.query(
						`INSERT INTO ${this.tableReference} (
						match_uuid,
						event_type,
						guild_id,
						channel_id,
						event_message_id,
						event_time_to_start,
						actor_user_id,
						target_user_id,
						participants,
						occurred_at
					) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, to_timestamp($10 / 1000.0))`,
						[
							data.matchId,
							event,
							data.guildId,
							data.channelId,
							data.eventId,
							data.timeToStart || null,
							data.userId,
							data.targetUserId || null,
							JSON.stringify(data.participants),
							Date.now(),
						],
					),
				DATABASE_RETRY_OPTIONS,
			);
		} catch (error) {
			handleError({
				reason: 'Failed to record telemetry event to database',
				severity: ErrorSeverity.LOW,
				error,
				metadata: {
					eventType: event,
					matchId: data.matchId,
					guildId: data.guildId,
				},
			});
		}
	}

	async dispose() {
		await this.pool.end();
	}

	private async ensureSchema() {
		if (this.initialized) return;

		await withRetry(
			() =>
				this.pool.query(
					`CREATE SCHEMA IF NOT EXISTS ${this.quoteIdentifier(this.schemaName)}`,
				),
			DATABASE_RETRY_OPTIONS,
		);

		await withRetry(
			() =>
				this.pool.query(`
				CREATE TABLE IF NOT EXISTS ${this.tableReference} (
					id BIGSERIAL PRIMARY KEY,
					match_uuid UUID,
					event_type TEXT NOT NULL,
					guild_id TEXT,
					channel_id TEXT,
					event_message_id TEXT,
					event_time_to_start INTEGER,
					actor_user_id TEXT,
					target_user_id TEXT,
					participants JSONB,
					occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
				);
			`),
			DATABASE_RETRY_OPTIONS,
		);

		this.initialized = true;
	}

	private resolveIdentifier(
		value: string | null | undefined,
		fallback: string,
	) {
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
