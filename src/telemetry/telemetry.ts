import dotenv from 'dotenv';
import type { TelemetryEventData } from '../types.js';
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
		dotenv.config();
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

		this.recorder
			?.initialize()
			.catch((error) =>
				console.error('Failed to prepare telemetry persistence', error),
			);
	}

	private async sendEvent(event: string, data: TelemetryEventData) {
		await this.recorder?.record(event, data);

		try {
			const headers = {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${this.apiKey}`,
			};

			await fetch(`${this.backendUrl}/telemetry`, {
				method: 'POST',
				headers,
				body: JSON.stringify({
					event,
					...data,
				}),
			});

			recordTelemetryDispatch(event, data.guildId, data.channelId);
		} catch (error) {
			console.error(error);
			recordTelemetryFailure(event, data.guildId, data.channelId);
		}
	}

	async trackEventCreated(data: TelemetryEventData) {
		await this.sendEvent('event_created', data);
	}

	async trackUserSignUp(data: TelemetryEventData) {
		await this.sendEvent('user_signed_up', data);
	}

	async trackUserSignOut(data: TelemetryEventData) {
		await this.sendEvent('user_signed_out', data);
	}

	async trackUserDropOut(data: TelemetryEventData) {
		await this.sendEvent('user_dropped_out', data);
	}

	async trackUserDropIn(data: TelemetryEventData) {
		await this.sendEvent('user_dropped_in', data);
	}

	async trackEventCancelled(data: TelemetryEventData) {
		await this.sendEvent('event_cancelled', data);
	}

	async trackEventStarted(data: TelemetryEventData) {
		await this.sendEvent('event_started', data);
	}

	async trackEventFinished(data: TelemetryEventData) {
		await this.sendEvent('event_finished', data);
	}

	async trackEventExpired(data: TelemetryEventData) {
		await this.sendEvent('event_expired', data);
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
