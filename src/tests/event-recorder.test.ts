import { faker } from '@faker-js/faker';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { EventRecorder } from '../telemetry/event-recorder.js';
import type { TelemetryEventData } from '../types.js';

vi.mock('../utils/retry.js', async () => {
	const actual =
		await vi.importActual<typeof import('../utils/retry.js')>(
			'../utils/retry.js',
		);
	return {
		...actual,
		DATABASE_RETRY_OPTIONS: actual.TEST_RETRY_OPTIONS,
	};
});

// Mock pg module
vi.mock('pg', () => {
	const MockedPool = vi.fn(function (this: never) {
		return {
			query: vi.fn().mockResolvedValue({ rows: [] }),
			end: vi.fn().mockResolvedValue(undefined),
		};
	});
	return {
		Pool: MockedPool,
	};
});

// Import the mocked Pool after mock is setup
const { Pool: MockedPool } = await vi.importMock<{ Pool: Mock }>('pg');

describe('EventRecorder', () => {
	let eventRecorder: EventRecorder;
	let connectionString: string;

	beforeEach(() => {
		connectionString = `postgresql://${faker.internet.username()}:${faker.internet.password()}@localhost:5432/${faker.database.type()}`;
		vi.clearAllMocks();
	});

	describe('constructor', () => {
		it('should use default schema and table when no options provided', () => {
			eventRecorder = new EventRecorder(connectionString);
			expect(eventRecorder).toBeDefined();
		});

		it('should accept custom schema and table options', () => {
			const options = {
				schema: 'custom_schema',
				table: 'custom_table',
			};
			eventRecorder = new EventRecorder(connectionString, options);
			expect(eventRecorder).toBeDefined();
		});

		it('should fall back to defaults for invalid identifiers', () => {
			const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

			const options = {
				schema: 'invalid-schema!',
				table: '123invalid',
			};
			eventRecorder = new EventRecorder(connectionString, options);
			expect(eventRecorder).toBeDefined();
			expect(consoleSpy).toHaveBeenCalledTimes(2);

			consoleSpy.mockRestore();
		});

		it('should accept valid custom identifiers', () => {
			const options = {
				schema: 'valid_schema123',
				table: 'ValidTable_456',
			};
			eventRecorder = new EventRecorder(connectionString, options);
			expect(eventRecorder).toBeDefined();
		});
	});

	describe('initialize', () => {
		it('should initialize schema and table', async () => {
			eventRecorder = new EventRecorder(connectionString);
			await expect(eventRecorder.initialize()).resolves.not.toThrow();
		});

		it('should handle initialization errors gracefully', async () => {
			const localQuery = vi
				.fn()
				.mockRejectedValue(new Error('Connection failed'));
			const localEnd = vi.fn().mockResolvedValue(undefined);

			MockedPool.mockImplementationOnce(function (this: never) {
				return {
					query: localQuery,
					end: localEnd,
				};
			});

			const consoleSpy = vi
				.spyOn(console, 'error')
				.mockImplementation(() => {});

			eventRecorder = new EventRecorder(connectionString);
			await eventRecorder.initialize();

			expect(consoleSpy).toHaveBeenCalled();
			const errorOutput = consoleSpy.mock.calls[
				consoleSpy.mock.calls.length - 1
			][0] as string;
			expect(errorOutput).toContain(
				'[MEDIUM] Failed to initialize event recorder schema',
			);

			consoleSpy.mockRestore();
		});
	});

	describe('record', () => {
		it('should record a telemetry event with all data', async () => {
			const localQuery = vi.fn().mockResolvedValue({ rows: [] });
			const localEnd = vi.fn().mockResolvedValue(undefined);

			MockedPool.mockImplementationOnce(function (this: never) {
				return {
					query: localQuery,
					end: localEnd,
				};
			});

			eventRecorder = new EventRecorder(connectionString);

			const eventData: TelemetryEventData = {
				matchId: faker.string.uuid(),
				guildId: faker.string.uuid(),
				channelId: faker.string.uuid(),
				eventId: faker.string.uuid(),
				timeToStart: faker.number.int({ min: 60, max: 600 }),
				userId: faker.string.uuid(),
				participants: [
					{ userId: faker.string.uuid(), role: 'Tank', rank: '3' },
					{ userId: faker.string.uuid(), role: 'DPS', rank: '2' },
				],
			};

			await eventRecorder.record('event.started', eventData);

			expect(localQuery).toHaveBeenCalled();
			const insertCall = localQuery.mock.calls.find((call) =>
				call[0].includes('INSERT INTO'),
			);
			expect(insertCall).toBeDefined();
			expect(insertCall?.[1]).toContain(eventData.matchId);
			expect(insertCall?.[1]).toContain(eventData.guildId);
		});

		it('should record event without optional fields', async () => {
			const localQuery = vi.fn().mockResolvedValue({ rows: [] });
			const localEnd = vi.fn().mockResolvedValue(undefined);

			MockedPool.mockImplementationOnce(function (this: never) {
				return {
					query: localQuery,
					end: localEnd,
				};
			});

			eventRecorder = new EventRecorder(connectionString);

			const eventData: TelemetryEventData = {
				matchId: faker.string.uuid(),
				guildId: faker.string.uuid(),
				channelId: faker.string.uuid(),
				eventId: faker.string.uuid(),
				userId: faker.string.uuid(),
				participants: [],
			};

			await eventRecorder.record('event.cancelled', eventData);

			expect(localQuery).toHaveBeenCalled();
		});

		it('should handle recording errors gracefully', async () => {
			const localQuery = vi.fn().mockRejectedValue(new Error('Query failed'));
			const localEnd = vi.fn().mockResolvedValue(undefined);

			MockedPool.mockImplementationOnce(function (this: never) {
				return {
					query: localQuery,
					end: localEnd,
				};
			});

			const consoleSpy = vi
				.spyOn(console, 'error')
				.mockImplementation(() => {});

			eventRecorder = new EventRecorder(connectionString);

			const eventData: TelemetryEventData = {
				matchId: faker.string.uuid(),
				guildId: faker.string.uuid(),
				channelId: faker.string.uuid(),
				eventId: faker.string.uuid(),
				userId: faker.string.uuid(),
				participants: [],
			};

			await eventRecorder.record('test-event', eventData);

			expect(consoleSpy).toHaveBeenCalled();
			const errorOutput = consoleSpy.mock.calls[
				consoleSpy.mock.calls.length - 1
			][0] as string;
			expect(errorOutput).toContain(
				'[LOW] Failed to record telemetry event to database',
			);

			consoleSpy.mockRestore();
		});

		it('should properly serialize participants as JSON', async () => {
			const localQuery = vi.fn().mockResolvedValue({ rows: [] });
			const localEnd = vi.fn().mockResolvedValue(undefined);

			MockedPool.mockImplementationOnce(function (this: never) {
				return {
					query: localQuery,
					end: localEnd,
				};
			});

			eventRecorder = new EventRecorder(connectionString);

			const participants = [
				{ userId: faker.string.uuid(), role: 'Tank', rank: '1' },
				{ userId: faker.string.uuid(), role: 'Healer', rank: '2' },
				{ userId: faker.string.uuid(), role: 'DPS', rank: null },
			];

			const eventData: TelemetryEventData = {
				matchId: faker.string.uuid(),
				guildId: faker.string.uuid(),
				channelId: faker.string.uuid(),
				eventId: faker.string.uuid(),
				userId: faker.string.uuid(),
				participants,
			};

			await eventRecorder.record('event.test', eventData);

			const insertCall = localQuery.mock.calls.find((call) =>
				call[0].includes('INSERT INTO'),
			);
			const participantsParam = insertCall?.[1][7];
			expect(participantsParam).toBe(JSON.stringify(participants));
		});
	});

	describe('dispose', () => {
		it('should close the database connection', async () => {
			const localQuery = vi.fn().mockResolvedValue({ rows: [] });
			const localEnd = vi.fn().mockResolvedValue(undefined);

			MockedPool.mockImplementationOnce(function (this: never) {
				return {
					query: localQuery,
					end: localEnd,
				};
			});

			eventRecorder = new EventRecorder(connectionString);
			await eventRecorder.dispose();

			expect(localEnd).toHaveBeenCalled();
		});
	});

	describe('identifier validation', () => {
		it('should accept identifiers starting with underscore', () => {
			const options = {
				schema: '_private_schema',
				table: '_events',
			};
			eventRecorder = new EventRecorder(connectionString, options);
			expect(eventRecorder).toBeDefined();
		});

		it('should reject identifiers starting with numbers', () => {
			const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

			const options = {
				schema: '9schema',
				table: '0table',
			};
			eventRecorder = new EventRecorder(connectionString, options);

			expect(consoleSpy).toHaveBeenCalledTimes(2);
			expect(consoleSpy).toHaveBeenCalledWith(
				expect.stringContaining('Invalid identifier'),
			);

			consoleSpy.mockRestore();
		});

		it('should reject identifiers with special characters', () => {
			const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

			const options = {
				schema: 'schema-name',
				table: 'table.name',
			};
			eventRecorder = new EventRecorder(connectionString, options);

			expect(consoleSpy).toHaveBeenCalledTimes(2);

			consoleSpy.mockRestore();
		});

		it('should handle empty string identifiers', () => {
			const options = {
				schema: '',
				table: '   ',
			};
			eventRecorder = new EventRecorder(connectionString, options);
			expect(eventRecorder).toBeDefined();
		});

		it('should handle null/undefined identifiers', () => {
			const options = {
				schema: undefined,
				table: undefined,
			};
			eventRecorder = new EventRecorder(connectionString, options);
			expect(eventRecorder).toBeDefined();
		});
	});
});
