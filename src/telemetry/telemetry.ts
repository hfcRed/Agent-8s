import { createHash } from 'node:crypto';
import dotenv from 'dotenv';
import type { ParticipantData } from '../event/event-manager.js';
import { ErrorSeverity, handleError } from '../utils/error-handler.js';
import { EventRecorder } from './event-recorder.js';
import { recordTelemetryDispatch, recordTelemetryFailure } from './metrics.js';

export interface TelemetryEventData {
	guildId: string;
	eventId: string;
	userId: string;
	participants: ParticipantData[];
	channelId: string;
	matchId: string;
	timeToStart?: number;
	targetUserId?: string;
}

export interface TelemetryStatus {
	remoteEnabled: boolean;
	databaseEnabled: boolean;
}

interface TelemetryConfig {
	telemetryUrl?: string;
	telemetryToken?: string;
	databaseUrl?: string;
	databaseSchema?: string;
	telemetryEventsTable?: string;
}

dotenv.config({ quiet: true });

/**
 * Class for forwarding events to a telemetry backend.
 */
export class TelemetryService {
	private backendUrl?: string;
	private apiKey?: string;
	private recorder?: EventRecorder;
	private readonly remoteEnabled: boolean;

	constructor(config: TelemetryConfig) {
		this.backendUrl = config.telemetryUrl;
		this.apiKey = config.telemetryToken;
		this.remoteEnabled = Boolean(config.telemetryUrl && config.telemetryToken);

		this.recorder = config.databaseUrl
			? new EventRecorder(config.databaseUrl, {
					schema: config.databaseSchema,
					table: config.telemetryEventsTable,
				})
			: undefined;

		this.recorder?.initialize().catch((error) =>
			handleError({
				reason: 'Failed to initialize telemetry persistence',
				severity: ErrorSeverity.MEDIUM,
				error,
			}),
		);
	}

	private hashId(id: string) {
		return createHash('sha256').update(id).digest('hex');
	}

	private async sendEvent(event: string, data: TelemetryEventData) {
		const hashedData = {
			...data,
			guildId: this.hashId(data.guildId),
			eventId: this.hashId(data.eventId),
			userId: this.hashId(data.userId),
			channelId: this.hashId(data.channelId),
			participants: data.participants.map((p) => ({
				...p,
				userId: this.hashId(p.userId),
			})),
			...(data.targetUserId && {
			targetUserId: this.hashId(data.targetUserId),
		}),
	};

		try {
			await this.recorder?.record(event, hashedData);
		} catch (error) {
			handleError({
				reason: 'Failed to record telemetry event to database',
				severity: ErrorSeverity.LOW,
				error,
				metadata: { event, guildId: data.guildId, channelId: data.channelId },
			});
		}

		if (!this.remoteEnabled || !this.backendUrl || !this.apiKey) {
			return;
		}

		try {
			await fetch(`${this.backendUrl}/telemetry`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${this.apiKey}`,
				},
				body: JSON.stringify({
					event,
					...hashedData,
				}),
			});

			recordTelemetryDispatch(event, data.guildId, data.channelId);
		} catch (error) {
			handleError({
				reason: 'Failed to send telemetry event to backend',
				severity: ErrorSeverity.LOW,
				error,
				metadata: { event, guildId: data.guildId, channelId: data.channelId },
			});

			recordTelemetryFailure(event, data.guildId, data.channelId);
		}
	}

	async trackEventCreated(data: TelemetryEventData) {
		await this.sendEvent('event_created', data);
	}

	async trackEventCancelled(data: TelemetryEventData) {
		await this.sendEvent('event_cancelled', data);
	}

	async trackUserSignUp(data: TelemetryEventData) {
		await this.sendEvent('user_signed_up', data);
	}

	async trackUserSignOut(data: TelemetryEventData) {
		await this.sendEvent('user_signed_out', data);
	}

	async trackEventStarted(data: TelemetryEventData) {
		await this.sendEvent('event_started', data);
	}

	async trackUserDropIn(data: TelemetryEventData) {
		await this.sendEvent('user_dropped_in', data);
	}

	async trackUserDropOut(data: TelemetryEventData) {
		await this.sendEvent('user_dropped_out', data);
	}

	async trackEventFinished(data: TelemetryEventData) {
		await this.sendEvent('event_finished', data);
	}

	async trackEventExpired(data: TelemetryEventData) {
		await this.sendEvent('event_expired', data);
	}

	async trackUserKicked(data: TelemetryEventData) {
		await this.sendEvent('user_kicked', data);
	}

	async trackEventRepinged(data: TelemetryEventData) {
		await this.sendEvent('event_repinged', data);
	}

	async trackUserJoinedQueue(data: TelemetryEventData) {
		await this.sendEvent('user_joined_queue', data);
	}

	async trackUserLeftQueue(data: TelemetryEventData) {
		await this.sendEvent('user_left_queue', data);
	}

	async trackUserPromotedFromQueue(data: TelemetryEventData) {
		await this.sendEvent('user_promoted_from_queue', data);
	}

	async dispose() {
		await this.recorder?.dispose();
	}

	getStatus(): TelemetryStatus {
		return {
			remoteEnabled: this.remoteEnabled,
			databaseEnabled: Boolean(this.recorder),
		};
	}
}

export function initializeTelemetry(
	telemetryUrl: string | undefined,
	telemetryToken: string | undefined,
) {
	const databaseUrl = process.env.DATABASE_URL;
	const databaseSchema = process.env.DATABASE_SCHEMA;
	const telemetryEventsTable = process.env.TELEMETRY_EVENTS_TABLE;

	const hasRemote = Boolean(telemetryUrl && telemetryToken);
	const hasDatabase = Boolean(databaseUrl);

	if (!hasRemote && !hasDatabase) {
		return undefined;
	}

	return new TelemetryService({
		telemetryUrl: telemetryUrl || undefined,
		telemetryToken: telemetryToken || undefined,
		databaseUrl: databaseUrl || undefined,
		databaseSchema: databaseSchema || undefined,
		telemetryEventsTable: telemetryEventsTable || undefined,
	});
}
