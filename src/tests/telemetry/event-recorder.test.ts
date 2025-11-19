import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventRecorder } from '../../telemetry/event-recorder.js';
import type { TelemetryEventData } from '../../telemetry/telemetry.js';

const { mockQuery, mockEnd } = vi.hoisted(() => {
	const mockQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
	const mockEnd = vi.fn().mockResolvedValue(undefined);
	return { mockQuery, mockEnd };
});

vi.mock('pg', () => {
	class MockPool {
		query = mockQuery;
		end = mockEnd;
	}

	return {
		Pool: MockPool,
	};
});

vi.mock('../../utils/retry.js', () => ({
	withRetry: vi.fn((fn) => fn()),
	DATABASE_RETRY_OPTIONS: {},
}));

vi.mock('../../utils/error-handler.js', () => ({
	handleError: vi.fn(),
	ErrorSeverity: {
		LOW: 'LOW',
		MEDIUM: 'MEDIUM',
		HIGH: 'HIGH',
	},
}));

describe('EventRecorder', () => {
	let eventRecorder: EventRecorder;

	beforeEach(() => {
		vi.clearAllMocks();
		mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
		mockEnd.mockResolvedValue(undefined);
		eventRecorder = new EventRecorder('postgresql://localhost:5432/test');
	});

	describe('initialization', () => {
		it('should create EventRecorder with connection string', () => {
			expect(eventRecorder).toBeDefined();
		});

		it('should accept custom schema and table options', () => {
			const customRecorder = new EventRecorder(
				'postgresql://localhost:5432/test',
				{
					schema: 'custom_schema',
					table: 'custom_table',
				},
			);

			expect(customRecorder).toBeDefined();
		});

		it('should initialize schema on first use', async () => {
			await eventRecorder.initialize();

			expect(mockQuery).toHaveBeenCalled();
			expect(mockQuery.mock.calls.length).toBeGreaterThanOrEqual(2);
		});

		it('should handle initialization errors gracefully', async () => {
			mockQuery.mockRejectedValueOnce(new Error('DB Connection failed'));

			await expect(eventRecorder.initialize()).resolves.not.toThrow();
		});
	});

	describe('record', () => {
		it('should record event data to database', async () => {
			const eventData: TelemetryEventData = {
				matchId: 'ABCDE-12345',
				guildId: 'guild-123',
				channelId: 'channel-456',
				eventId: 'event-789',
				userId: 'user-999',
				participants: [
					{ userId: 'user1', role: 'Slayer', rank: null },
					{ userId: 'user2', role: 'Support', rank: null },
				],
			};

			await eventRecorder.record('event_started', eventData);

			expect(mockQuery).toHaveBeenCalled();
			const insertCall = mockQuery.mock.calls.find(
				(call) =>
					typeof call[0] === 'string' && call[0].includes('INSERT INTO'),
			);
			expect(insertCall).toBeDefined();
			if (insertCall) {
				expect(insertCall[0]).toContain('INSERT INTO');
				expect(insertCall[1]).toContain(eventData.matchId);
				expect(insertCall[1]).toContain(eventData.guildId);
			}
		});

		it('should handle optional fields', async () => {
			const eventData: TelemetryEventData = {
				matchId: 'ABCDE-12345',
				guildId: 'guild-123',
				channelId: 'channel-456',
				eventId: 'event-789',
				userId: 'user-999',
				participants: [],
				timeToStart: 300,
			};

			await eventRecorder.record('event_started', eventData);

			expect(mockQuery).toHaveBeenCalled();
		});

		it('should not throw on recording errors', async () => {
			mockQuery.mockRejectedValue(new Error('DB write failed'));

			const eventData: TelemetryEventData = {
				matchId: 'MATCH-123',
				guildId: 'guild-123',
				channelId: 'channel-456',
				eventId: 'event-789',
				userId: 'user-999',
				participants: [],
			};

			await expect(
				eventRecorder.record('event_failed', eventData),
			).resolves.not.toThrow();
		});

		it('should initialize schema before first record', async () => {
			const eventData: TelemetryEventData = {
				matchId: 'MATCH-123',
				guildId: 'guild-123',
				channelId: 'channel-456',
				eventId: 'event-789',
				userId: 'user-999',
				participants: [],
			};

			await eventRecorder.record('event_started', eventData);

			expect(mockQuery.mock.calls.length).toBeGreaterThanOrEqual(3);
		});

		it('should serialize participants as JSON', async () => {
			const participants = [
				{ userId: 'user1', role: 'Slayer', rank: '1' },
				{ userId: 'user2', role: 'Support', rank: '2' },
			];

			const eventData: TelemetryEventData = {
				matchId: 'MATCH-123',
				guildId: 'guild-123',
				channelId: 'channel-456',
				eventId: 'event-789',
				userId: 'user-999',
				participants,
			};

			await eventRecorder.record('event_started', eventData);

			const callArgs = mockQuery.mock.calls.find(
				(call) => typeof call[0] === 'string' && call[0].includes('INSERT'),
			);
			expect(callArgs).toBeDefined();
			if (callArgs) {
				const jsonArg = callArgs[1][8];
				expect(typeof jsonArg).toBe('string');
				expect(JSON.parse(jsonArg)).toEqual(participants);
			}
		});
	});

	describe('dispose', () => {
		it('should close database connection', async () => {
			await eventRecorder.dispose();

			expect(mockEnd).toHaveBeenCalled();
		});

		it('should be safe to call multiple times', async () => {
			await eventRecorder.dispose();
			await eventRecorder.dispose();

			expect(mockEnd).toHaveBeenCalledTimes(2);
		});
	});

	describe('identifier validation', () => {
		it('should use valid schema names', () => {
			const recorder = new EventRecorder('postgresql://localhost:5432/test', {
				schema: 'valid_schema_name',
			});

			expect(recorder).toBeDefined();
		});

		it('should use valid table names', () => {
			const recorder = new EventRecorder('postgresql://localhost:5432/test', {
				table: 'valid_table_name',
			});

			expect(recorder).toBeDefined();
		});

		it('should fallback to default for invalid identifiers', () => {
			const recorder = new EventRecorder('postgresql://localhost:5432/test', {
				schema: 'invalid-schema!',
			});

			expect(recorder).toBeDefined();
		});
	});

	describe('SQL injection protection', () => {
		it('should quote identifiers properly', async () => {
			const recorder = new EventRecorder('postgresql://localhost:5432/test', {
				schema: 'my_schema',
				table: 'my_table',
			});

			await recorder.initialize();

			const createTableCall = mockQuery.mock.calls.find(
				(call) =>
					typeof call[0] === 'string' && call[0].includes('CREATE TABLE'),
			);
			expect(createTableCall).toBeDefined();
			if (createTableCall) {
				expect(createTableCall[0]).toContain('"my_schema"');
				expect(createTableCall[0]).toContain('"my_table"');
			}
		});

		it('should use parameterized queries for data', async () => {
			const maliciousData: TelemetryEventData = {
				matchId: "'; DROP TABLE events; --",
				guildId: 'guild-123',
				channelId: 'channel-456',
				eventId: 'event-789',
				userId: 'user-999',
				participants: [],
			};

			await eventRecorder.record('event_started', maliciousData);

			const insertCall = mockQuery.mock.calls.find(
				(call) => typeof call[0] === 'string' && call[0].includes('INSERT'),
			);
			expect(insertCall).toBeDefined();
			if (insertCall) {
				expect(insertCall[0]).toContain('$1');
				expect(insertCall[1]).toContain(maliciousData.matchId);
			}
		});
	});
});
