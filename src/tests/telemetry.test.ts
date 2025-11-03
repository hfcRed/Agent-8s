import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import type { EventRecorder } from '../event-recorder.js';
import type { TelemetryContext, TelemetryEvent } from '../types.js';

process.env.METRICS_PORT = '0';

type MetricsModule = typeof import('../metrics.js');

let metricsModule: MetricsModule;
let dispatchMock: ReturnType<typeof mock.fn>;
let failureMock: ReturnType<typeof mock.fn>;
let originalFetch: typeof globalThis.fetch | undefined;

beforeEach(async () => {
	metricsModule = await import('../metrics.js');
	dispatchMock = mock.method(
		metricsModule,
		'recordTelemetryDispatch',
		() => {},
	);
	failureMock = mock.method(metricsModule, 'recordTelemetryFailure', () => {});
	originalFetch = globalThis.fetch;
});

afterEach(async () => {
	if (originalFetch) {
		globalThis.fetch = originalFetch;
	} else {
		Reflect.deleteProperty(globalThis, 'fetch');
	}
	if (metricsModule?.stopMetricsServer) {
		await metricsModule.stopMetricsServer();
	}
	mock.restoreAll();
});

test('trackEventCreated forwards events to recorder and backend', async () => {
	const { TelemetryService } = await import('../telemetry.js');
	const recordSpy = mock.fn(async () => {});
	const recorder = { record: recordSpy } as unknown as EventRecorder;

	const fetchSpy = mock.fn(async () => ({ ok: true }));
	globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;

	const service = new TelemetryService(
		'https://backend.example',
		'secret-token',
		recorder,
	);

	await service.trackEventCreated(
		'guild-1',
		'event-1',
		'user-1',
		10,
		'channel-1',
		'match-1',
	);

	assert.equal(recordSpy.mock.callCount(), 1);
	const recordCall = recordSpy.mock.calls[0];
	assert.ok(recordCall);
	const [eventArg, contextArg] = recordCall.arguments as unknown as [
		TelemetryEvent,
		TelemetryContext | undefined,
	];
	assert.equal(eventArg.event, 'event_created');
	assert.equal(eventArg.guildId, 'guild-1');
	assert.equal(eventArg.eventId, 'event-1');
	assert.deepEqual(eventArg.data, { userId: 'user-1', timeToStart: 10 });
	assert.deepEqual(contextArg, { channelId: 'channel-1', matchId: 'match-1' });

	assert.equal(fetchSpy.mock.callCount(), 1);
	const fetchCall = fetchSpy.mock.calls[0];
	assert.ok(fetchCall);
	const [url, init] = fetchCall.arguments as unknown as [
		string,
		{
			method?: string;
			headers?: Record<string, string>;
			body?: unknown;
		},
	];
	assert.equal(url, 'https://backend.example/telemetry');
	assert.equal(init?.method, 'POST');
	assert.deepEqual(init?.headers, {
		'Content-Type': 'application/json',
		Authorization: 'Bearer secret-token',
	});
	assert.ok(typeof init?.body === 'string');
	const parsedBody = JSON.parse(init?.body as string);
	assert.equal(parsedBody.event, 'event_created');
	assert.equal(parsedBody.guildId, 'guild-1');
	assert.equal(parsedBody.eventId, 'event-1');
	assert.equal(typeof parsedBody.timestamp, 'number');

	assert.equal(dispatchMock.mock.callCount(), 1);
	const dispatchCall = dispatchMock.mock.calls[0];
	assert.ok(dispatchCall);
	assert.deepEqual(dispatchCall.arguments, [
		'event_created',
		'guild-1',
		'channel-1',
	]);
	assert.equal(failureMock.mock.callCount(), 0);
});

test('records a telemetry failure when backend forwarding rejects', async () => {
	const { TelemetryService } = await import('../telemetry.js');
	const recordSpy = mock.fn(async () => {});
	const recorder = { record: recordSpy } as unknown as EventRecorder;

	const fetchSpy = mock.fn(async () => {
		throw new Error('network error');
	});
	globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;

	const service = new TelemetryService(
		'https://backend.example',
		'secret-token',
		recorder,
	);

	await service.trackEventCreated(
		'guild-2',
		'event-2',
		'user-2',
		undefined,
		'channel-2',
		'match-2',
	);

	assert.equal(recordSpy.mock.callCount(), 1);
	assert.equal(fetchSpy.mock.callCount(), 1);
	assert.equal(dispatchMock.mock.callCount(), 0);
	assert.equal(failureMock.mock.callCount(), 1);
	const failureCall = failureMock.mock.calls[0];
	assert.ok(failureCall);
	assert.deepEqual(failureCall.arguments, [
		'event_created',
		'guild-2',
		'channel-2',
	]);
});

test('omits network forwarding when backend credentials are missing', async () => {
	const { TelemetryService } = await import('../telemetry.js');
	const recordSpy = mock.fn(async () => {});
	const recorder = { record: recordSpy } as unknown as EventRecorder;

	const fetchSpy = mock.fn(async () => {
		throw new Error('should not reach fetch');
	});
	globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;

	const service = new TelemetryService(undefined, undefined, recorder);

	await service.trackEventCancelled(
		'guild-3',
		'event-3',
		[],
		'channel-3',
		'match-3',
	);

	assert.equal(recordSpy.mock.callCount(), 1);
	assert.equal(fetchSpy.mock.callCount(), 0);
	assert.equal(dispatchMock.mock.callCount(), 0);
	assert.equal(failureMock.mock.callCount(), 0);
});
