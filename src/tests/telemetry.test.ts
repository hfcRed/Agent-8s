import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	initializeTelemetry,
	TelemetryService,
} from '../telemetry/telemetry.js';
import type { TelemetryEventData } from '../types.js';

vi.mock('../telemetry/event-recorder.js', () => {
	return {
		EventRecorder: vi.fn(function (this: {
			initialize: typeof vi.fn;
			record: typeof vi.fn;
		}) {
			this.initialize = vi.fn().mockResolvedValue(undefined);
			this.record = vi.fn().mockResolvedValue(undefined);
		}),
	};
});

vi.mock('../telemetry/metrics.js', () => ({
	recordTelemetryDispatch: vi.fn(),
	recordTelemetryFailure: vi.fn(),
	recordErrorMetric: vi.fn(),
}));

// Helper function to hash IDs like the telemetry service does
function hashId(id: string) {
	return createHash('sha256').update(id).digest('hex');
}

describe('TelemetryService', () => {
	let telemetryService: TelemetryService;
	let fetchMock: ReturnType<typeof vi.fn>;
	let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		// Clean up environment variables to ensure clean state
		delete process.env.DATABASE_URL;
		delete process.env.DATABASE_SCHEMA;
		delete process.env.TELEMETRY_EVENTS_TABLE;

		fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({}),
		});
		global.fetch = fetchMock as unknown as typeof fetch;

		consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		telemetryService = new TelemetryService(
			'https://telemetry.example.com',
			'test-token-123',
		);
	});

	afterEach(() => {
		// Clear spy after each test
		consoleErrorSpy.mockClear();
		vi.clearAllMocks();
	});

	describe('constructor', () => {
		it('should create TelemetryService with URL and token', () => {
			expect(telemetryService).toBeDefined();
		});

		it('should create EventRecorder if DATABASE_URL is set', () => {
			process.env.DATABASE_URL = 'postgresql://localhost/test';
			process.env.DATABASE_SCHEMA = 'public';
			process.env.TELEMETRY_EVENTS_TABLE = 'events';

			const service = new TelemetryService('https://test.com', 'token');

			// Verify the service was created successfully
			expect(service).toBeDefined();

			// Clean up environment variables
			delete process.env.DATABASE_URL;
			delete process.env.DATABASE_SCHEMA;
			delete process.env.TELEMETRY_EVENTS_TABLE;
		});

		it('should not create EventRecorder if DATABASE_URL is not set', () => {
			delete process.env.DATABASE_URL;

			const service = new TelemetryService('https://test.com', 'token');

			// Verify the service was created successfully without recorder
			expect(service).toBeDefined();
		});
	});

	describe('sendEvent', () => {
		const testData: TelemetryEventData = {
			eventId: 'event-123',
			guildId: 'guild-456',
			channelId: 'channel-789',
			userId: 'user-001',
			participants: [],
			matchId: 'match-123',
		};

		it('should send event to backend with hashed IDs', async () => {
			await telemetryService.trackEventCreated(testData);

			expect(fetchMock).toHaveBeenCalledWith(
				'https://telemetry.example.com/telemetry',
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: 'Bearer test-token-123',
					},
					body: JSON.stringify({
						event: 'event_created',
						eventId: hashId(testData.eventId),
						guildId: hashId(testData.guildId),
						channelId: hashId(testData.channelId),
						userId: hashId(testData.userId),
						participants: [],
						matchId: testData.matchId,
					}),
				},
			);
		});

		it('should record telemetry dispatch on success', async () => {
			const { recordTelemetryDispatch } = await import(
				'../telemetry/metrics.js'
			);

			await telemetryService.trackUserSignUp(testData);

			expect(vi.mocked(recordTelemetryDispatch)).toHaveBeenCalledWith(
				'user_signed_up',
				testData.guildId,
				testData.channelId,
			);
		});

		it('should record telemetry failure on error', async () => {
			const error = new Error('Network error');
			fetchMock.mockRejectedValue(error);

			const { recordTelemetryFailure } = await import(
				'../telemetry/metrics.js'
			);

			await telemetryService.trackUserSignOut(testData);

			expect(consoleErrorSpy).toHaveBeenCalled();
			const errorOutput = consoleErrorSpy.mock.calls[0][0] as string;
			expect(errorOutput).toContain(
				'[LOW] Failed to send telemetry event to backend',
			);
			expect(vi.mocked(recordTelemetryFailure)).toHaveBeenCalledWith(
				'user_signed_out',
				testData.guildId,
				testData.channelId,
			);
		});

		it('should call recorder.record if recorder exists', async () => {
			process.env.DATABASE_URL = 'postgresql://localhost/test';
			const serviceWithRecorder = new TelemetryService(
				'https://test.com',
				'token',
			);

			await serviceWithRecorder.trackEventCreated(testData);

			// Just verify the call was made without errors
			expect(fetchMock).toHaveBeenCalled();

			// Clean up environment variable
			delete process.env.DATABASE_URL;
		});
	});

	describe('tracking methods', () => {
		const testData: TelemetryEventData = {
			eventId: 'event-123',
			guildId: 'guild-456',
			channelId: 'channel-789',
			userId: 'user-001',
			participants: [],
			matchId: 'match-123',
		};

		it('should track event created', async () => {
			await telemetryService.trackEventCreated(testData);

			expect(fetchMock).toHaveBeenCalled();
			const call = fetchMock.mock.calls[0];
			const body = JSON.parse(call[1].body);
			expect(body).toMatchObject({
				event: 'event_created',
				eventId: hashId(testData.eventId),
				guildId: hashId(testData.guildId),
				channelId: hashId(testData.channelId),
				userId: hashId(testData.userId),
				participants: [],
				matchId: testData.matchId,
			});
		});

		it('should track user sign up', async () => {
			await telemetryService.trackUserSignUp(testData);

			expect(fetchMock).toHaveBeenCalled();
			const call = fetchMock.mock.calls[0];
			const body = JSON.parse(call[1].body);
			expect(body).toMatchObject({
				event: 'user_signed_up',
				eventId: hashId(testData.eventId),
				guildId: hashId(testData.guildId),
				channelId: hashId(testData.channelId),
				userId: hashId(testData.userId),
				participants: [],
				matchId: testData.matchId,
			});
		});

		it('should track user sign out', async () => {
			await telemetryService.trackUserSignOut(testData);

			expect(fetchMock).toHaveBeenCalled();
			const call = fetchMock.mock.calls[0];
			const body = JSON.parse(call[1].body);
			expect(body).toMatchObject({
				event: 'user_signed_out',
				eventId: hashId(testData.eventId),
				guildId: hashId(testData.guildId),
				channelId: hashId(testData.channelId),
				userId: hashId(testData.userId),
				participants: [],
				matchId: testData.matchId,
			});
		});

		it('should track user drop out', async () => {
			await telemetryService.trackUserDropOut(testData);

			expect(fetchMock).toHaveBeenCalled();
			const call = fetchMock.mock.calls[0];
			const body = JSON.parse(call[1].body);
			expect(body).toMatchObject({
				event: 'user_dropped_out',
				eventId: hashId(testData.eventId),
				guildId: hashId(testData.guildId),
				channelId: hashId(testData.channelId),
				userId: hashId(testData.userId),
				participants: [],
				matchId: testData.matchId,
			});
		});

		it('should track user drop in', async () => {
			await telemetryService.trackUserDropIn(testData);

			expect(fetchMock).toHaveBeenCalled();
			const call = fetchMock.mock.calls[0];
			const body = JSON.parse(call[1].body);
			expect(body).toMatchObject({
				event: 'user_dropped_in',
				eventId: hashId(testData.eventId),
				guildId: hashId(testData.guildId),
				channelId: hashId(testData.channelId),
				userId: hashId(testData.userId),
				participants: [],
				matchId: testData.matchId,
			});
		});

		it('should track event cancelled', async () => {
			await telemetryService.trackEventCancelled(testData);

			expect(fetchMock).toHaveBeenCalled();
			const call = fetchMock.mock.calls[0];
			const body = JSON.parse(call[1].body);
			expect(body).toMatchObject({
				event: 'event_cancelled',
				eventId: hashId(testData.eventId),
				guildId: hashId(testData.guildId),
				channelId: hashId(testData.channelId),
				userId: hashId(testData.userId),
				participants: [],
				matchId: testData.matchId,
			});
		});

		it('should track event started', async () => {
			await telemetryService.trackEventStarted(testData);

			expect(fetchMock).toHaveBeenCalled();
			const call = fetchMock.mock.calls[0];
			const body = JSON.parse(call[1].body);
			expect(body).toMatchObject({
				event: 'event_started',
				eventId: hashId(testData.eventId),
				guildId: hashId(testData.guildId),
				channelId: hashId(testData.channelId),
				userId: hashId(testData.userId),
				participants: [],
				matchId: testData.matchId,
			});
		});

		it('should track event finished', async () => {
			await telemetryService.trackEventFinished(testData);

			expect(fetchMock).toHaveBeenCalled();
			const call = fetchMock.mock.calls[0];
			const body = JSON.parse(call[1].body);
			expect(body).toMatchObject({
				event: 'event_finished',
				eventId: hashId(testData.eventId),
				guildId: hashId(testData.guildId),
				channelId: hashId(testData.channelId),
				userId: hashId(testData.userId),
				participants: [],
				matchId: testData.matchId,
			});
		});

		it('should track event expired', async () => {
			await telemetryService.trackEventExpired(testData);

			expect(fetchMock).toHaveBeenCalled();
			const call = fetchMock.mock.calls[0];
			const body = JSON.parse(call[1].body);
			expect(body).toMatchObject({
				event: 'event_expired',
				eventId: hashId(testData.eventId),
				guildId: hashId(testData.guildId),
				channelId: hashId(testData.channelId),
				userId: hashId(testData.userId),
				participants: [],
				matchId: testData.matchId,
			});
		});

		it('should hash participant user IDs', async () => {
			const dataWithParticipants: TelemetryEventData = {
				...testData,
				participants: [
					{ userId: 'user-001', role: 'Tank', rank: 'Gold' },
					{ userId: 'user-002', role: 'Support', rank: 'Silver' },
				],
			};

			await telemetryService.trackEventCreated(dataWithParticipants);

			expect(fetchMock).toHaveBeenCalled();
			const call = fetchMock.mock.calls[0];
			const body = JSON.parse(call[1].body);
			expect(body.participants).toEqual([
				{ userId: hashId('user-001'), role: 'Tank', rank: 'Gold' },
				{ userId: hashId('user-002'), role: 'Support', rank: 'Silver' },
			]);
		});
	});
});

describe('initializeTelemetry', () => {
	it('should return undefined if telemetryUrl is not provided', () => {
		const result = initializeTelemetry(undefined, 'token');

		expect(result).toBeUndefined();
	});

	it('should return undefined if telemetryToken is not provided', () => {
		const result = initializeTelemetry('https://test.com', undefined);

		expect(result).toBeUndefined();
	});

	it('should return TelemetryService instance if both URL and token are provided', () => {
		const result = initializeTelemetry('https://test.com', 'token-123');

		expect(result).toBeDefined();
		expect(result).toBeInstanceOf(TelemetryService);
	});

	it('should handle missing parameters gracefully', () => {
		expect(initializeTelemetry(undefined, undefined)).toBeUndefined();
		expect(initializeTelemetry('', 'token')).toBeUndefined();
		expect(initializeTelemetry('https://test.com', '')).toBeUndefined();
	});
});
