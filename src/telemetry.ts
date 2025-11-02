import type { ParticipantData, TelemetryEvent } from './types';

export class TelemetryService {
	private backendUrl: string;
	private apiKey: string;

	constructor(backendUrl: string, apiKey: string) {
		this.backendUrl = backendUrl;
		this.apiKey = apiKey;
	}

	async sendEvent(event: TelemetryEvent) {
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
		} catch (error) {
			console.error(error);
		}
	}

	async trackEventCreated(
		guildId: string,
		eventId: string,
		userId: string,
		timeToStart?: number,
	) {
		await this.sendEvent({
			event: 'event_created',
			guildId,
			eventId,
			timestamp: Date.now(),
			data: { userId, timeToStart },
		});
	}

	async trackUserSignUp(
		guildId: string,
		eventId: string,
		userId: string,
		participants: ParticipantData[],
	) {
		await this.sendEvent({
			event: 'user_signed_up',
			guildId,
			eventId,
			timestamp: Date.now(),
			data: { userId, participants },
		});
	}

	async trackUserSignOut(
		guildId: string,
		eventId: string,
		userId: string,
		participants: ParticipantData[],
	) {
		await this.sendEvent({
			event: 'user_signed_out',
			guildId,
			eventId,
			timestamp: Date.now(),
			data: { userId, participants },
		});
	}

	async trackEventCancelled(
		guildId: string,
		eventId: string,
		participants: ParticipantData[],
	) {
		await this.sendEvent({
			event: 'event_cancelled',
			guildId,
			eventId,
			timestamp: Date.now(),
			data: { participants },
		});
	}

	async trackEventStarted(
		guildId: string,
		eventId: string,
		participants: ParticipantData[],
	) {
		await this.sendEvent({
			event: 'event_started',
			guildId,
			eventId,
			timestamp: Date.now(),
			data: { participants },
		});
	}

	async trackEventFinished(
		guildId: string,
		eventId: string,
		participants: ParticipantData[],
	) {
		await this.sendEvent({
			event: 'event_finished',
			guildId,
			eventId,
			timestamp: Date.now(),
			data: { participants },
		});
	}

	async trackEventExpired(
		guildId: string,
		eventId: string,
		participants: ParticipantData[],
	) {
		await this.sendEvent({
			event: 'event_expired',
			guildId,
			eventId,
			timestamp: Date.now(),
			data: { participants },
		});
	}
}
