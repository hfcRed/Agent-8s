import type { EventRecorder } from './event-recorder.js';
import { recordTelemetryDispatch, recordTelemetryFailure } from './metrics.js';
import type { TelemetryEventData } from './types';

/**
 * Class for forwarding events to a telemetry backend.
 */
export class TelemetryService {
	private backendUrl: string;
	private apiKey: string;
	private recorder?: EventRecorder;

	constructor(backendUrl: string, apiKey: string, recorder?: EventRecorder) {
		this.backendUrl = backendUrl;
		this.apiKey = apiKey;
		this.recorder = recorder;

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
				body: JSON.stringify(event),
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
