import type { ParticipantData, TelemetryContext, TelemetryEvent } from './types';
import {
	recordTelemetryDispatch,
	recordTelemetryFailure,
} from './metrics.js';

/**
 * Lightweight client for forwarding structured telemetry events to the backend.
 */
export class TelemetryService {
	private backendUrl: string;
	private apiKey: string;

	/**
	 * Creates a telemetry client using the provided backend base URL and API key.
	 */
	constructor(backendUrl: string, apiKey: string) {
		this.backendUrl = backendUrl;
		this.apiKey = apiKey;
	}

	private async sendEvent(
		event: TelemetryEvent,
		context?: TelemetryContext,
	) {
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

	/**
	 * Emits telemetry capturing when an event lobby is created.
	 */
	async trackEventCreated(
		guildId: string,
		eventId: string,
		userId: string,
		timeToStart?: number,
		channelId?: string,
	) {
		await this.sendEvent(
			{
				event: 'event_created',
				guildId,
				eventId,
				timestamp: Date.now(),
				data: { userId, timeToStart },
			},
			{ channelId },
		);
	}

	/**
	 * Records when a user signs up for an event and the resulting roster.
	 */
	async trackUserSignUp(
		guildId: string,
		eventId: string,
		userId: string,
		participants: ParticipantData[],
		channelId?: string,
	) {
		await this.sendEvent(
			{
				event: 'user_signed_up',
				guildId,
				eventId,
				timestamp: Date.now(),
				data: { userId, participants },
			},
			{ channelId },
		);
	}

	/**
	 * Records when a user withdraws from an event lobby and shares the new roster.
	 */
	async trackUserSignOut(
		guildId: string,
		eventId: string,
		userId: string,
		participants: ParticipantData[],
		channelId?: string,
	) {
		await this.sendEvent(
			{
				event: 'user_signed_out',
				guildId,
				eventId,
				timestamp: Date.now(),
				data: { userId, participants },
			},
			{ channelId },
		);
	}

	/**
	 * Records when an event is cancelled before it starts.
	 */
	async trackEventCancelled(
		guildId: string,
		eventId: string,
		participants: ParticipantData[],
		channelId?: string,
	) {
		await this.sendEvent(
			{
				event: 'event_cancelled',
				guildId,
				eventId,
				timestamp: Date.now(),
				data: { participants },
			},
			{ channelId },
		);
	}

	/**
	 * Records when an event transitions into an active state.
	 */
	async trackEventStarted(
		guildId: string,
		eventId: string,
		participants: ParticipantData[],
		channelId?: string,
	) {
		await this.sendEvent(
			{
				event: 'event_started',
				guildId,
				eventId,
				timestamp: Date.now(),
				data: { participants },
			},
			{ channelId },
		);
	}

	/**
	 * Records when an event is marked as complete.
	 */
	async trackEventFinished(
		guildId: string,
		eventId: string,
		participants: ParticipantData[],
		channelId?: string,
	) {
		await this.sendEvent(
			{
				event: 'event_finished',
				guildId,
				eventId,
				timestamp: Date.now(),
				data: { participants },
			},
			{ channelId },
		);
	}

	/**
	 * Records when an event expires without reaching completion.
	 */
	async trackEventExpired(
		guildId: string,
		eventId: string,
		participants: ParticipantData[],
		channelId?: string,
	) {
		await this.sendEvent(
			{
				event: 'event_expired',
				guildId,
				eventId,
				timestamp: Date.now(),
				data: { participants },
			},
			{ channelId },
		);
	}
}
