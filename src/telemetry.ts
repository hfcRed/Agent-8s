import type { EventRecorder } from './event-recorder.js';
import { recordTelemetryDispatch, recordTelemetryFailure } from './metrics.js';
import type {
	ParticipantData,
	TelemetryContext,
	TelemetryEvent,
} from './types';

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

	private async sendEvent(event: TelemetryEvent, context?: TelemetryContext) {
		await this.recorder?.record(event, context);

		if (!this.backendUrl || !this.apiKey) return;

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

			recordTelemetryDispatch(event.event, event.guildId, context?.channelId);
		} catch (error) {
			console.error(error);
			recordTelemetryFailure(event.event, event.guildId, context?.channelId);
		}
	}

	async trackEventCreated(
		guildId: string,
		eventId: string,
		userId: string,
		timeToStart?: number,
		channelId?: string,
		matchId?: string,
	) {
		await this.sendEvent(
			{
				event: 'event_created',
				guildId,
				eventId,
				timestamp: Date.now(),
				data: { userId, timeToStart },
			},
			{ channelId, matchId },
		);
	}

	async trackUserSignUp(
		guildId: string,
		eventId: string,
		userId: string,
		participants: ParticipantData[],
		channelId?: string,
		matchId?: string,
	) {
		await this.sendEvent(
			{
				event: 'user_signed_up',
				guildId,
				eventId,
				timestamp: Date.now(),
				data: { userId, participants },
			},
			{ channelId, matchId },
		);
	}

	async trackUserSignOut(
		guildId: string,
		eventId: string,
		userId: string,
		participants: ParticipantData[],
		channelId?: string,
		matchId?: string,
	) {
		await this.sendEvent(
			{
				event: 'user_signed_out',
				guildId,
				eventId,
				timestamp: Date.now(),
				data: { userId, participants },
			},
			{ channelId, matchId },
		);
	}

	async trackEventCancelled(
		guildId: string,
		eventId: string,
		participants: ParticipantData[],
		channelId?: string,
		matchId?: string,
	) {
		await this.sendEvent(
			{
				event: 'event_cancelled',
				guildId,
				eventId,
				timestamp: Date.now(),
				data: { participants },
			},
			{ channelId, matchId },
		);
	}

	async trackEventStarted(
		guildId: string,
		eventId: string,
		participants: ParticipantData[],
		channelId?: string,
		matchId?: string,
	) {
		await this.sendEvent(
			{
				event: 'event_started',
				guildId,
				eventId,
				timestamp: Date.now(),
				data: { participants },
			},
			{ channelId, matchId },
		);
	}

	async trackEventFinished(
		guildId: string,
		eventId: string,
		participants: ParticipantData[],
		channelId?: string,
		matchId?: string,
	) {
		await this.sendEvent(
			{
				event: 'event_finished',
				guildId,
				eventId,
				timestamp: Date.now(),
				data: { participants },
			},
			{ channelId, matchId },
		);
	}

	async trackEventExpired(
		guildId: string,
		eventId: string,
		participants: ParticipantData[],
		channelId?: string,
		matchId?: string,
	) {
		await this.sendEvent(
			{
				event: 'event_expired',
				guildId,
				eventId,
				timestamp: Date.now(),
				data: { participants },
			},
			{ channelId, matchId },
		);
	}
}
