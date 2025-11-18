import { createHash } from 'node:crypto';
import dotenv from 'dotenv';
import type { TelemetryEventData } from '../types.js';
import { ErrorSeverity, handleError } from '../utils/error-handler.js';
import { EventRecorder } from './event-recorder.js';
import { recordTelemetryDispatch, recordTelemetryFailure } from './metrics.js';

/**
 * Class for forwarding events to a telemetry backend.
 */
export class TelemetryService {
	private backendUrl: string;
	private apiKey: string;
	private recorder?: EventRecorder;

	constructor(telemetryUrl: string, telemetryToken: string) {
		dotenv.config({ quiet: true });
		const databaseUrl = process.env.DATABASE_URL;
		const databaseSchema = process.env.DATABASE_SCHEMA;
		const telemetryEventsTable = process.env.TELEMETRY_EVENTS_TABLE;

		this.backendUrl = telemetryUrl;
		this.apiKey = telemetryToken;

		this.recorder = databaseUrl
			? new EventRecorder(databaseUrl, {
					schema: databaseSchema,
					table: telemetryEventsTable,
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
		};

		try {
			await this.recorder?.record(event, hashedData);

			const headers = {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${this.apiKey}`,
			};

			await fetch(`${this.backendUrl}/telemetry`, {
				method: 'POST',
				headers,
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

	async dispose() {
		await this.recorder?.dispose();
	}
}

export function initializeTelemetry(
	telemetryUrl: string | undefined,
	telemetryToken: string | undefined,
) {
	if (!telemetryUrl || !telemetryToken) {
		return undefined;
	}

	return new TelemetryService(telemetryUrl, telemetryToken);
}
