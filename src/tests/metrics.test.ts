import { faker } from '@faker-js/faker';
import { afterEach, describe, expect, it } from 'vitest';
import {
	recordTelemetryDispatch,
	recordTelemetryFailure,
	stopMetricsServer,
} from '../telemetry/metrics.js';

describe('metrics', () => {
	afterEach(async () => {
		// Clean up any running servers
		await stopMetricsServer();
	});

	describe('recordTelemetryDispatch', () => {
		it('should record telemetry dispatch with all parameters', () => {
			const eventName = faker.word.noun();
			const guildId = faker.string.uuid();
			const channelId = faker.string.uuid();

			// Should not throw
			expect(() => {
				recordTelemetryDispatch(eventName, guildId, channelId);
			}).not.toThrow();
		});

		it('should record telemetry dispatch without channel ID', () => {
			const eventName = faker.word.noun();
			const guildId = faker.string.uuid();

			// Should not throw and should use 'unknown' for channel
			expect(() => {
				recordTelemetryDispatch(eventName, guildId);
			}).not.toThrow();
		});

		it('should handle multiple recordings', () => {
			const eventName = faker.word.noun();
			const guildId = faker.string.uuid();

			expect(() => {
				recordTelemetryDispatch(eventName, guildId);
				recordTelemetryDispatch(eventName, guildId);
				recordTelemetryDispatch(eventName, guildId);
			}).not.toThrow();
		});
	});

	describe('recordTelemetryFailure', () => {
		it('should record telemetry failure with all parameters', () => {
			const eventName = faker.word.noun();
			const guildId = faker.string.uuid();
			const channelId = faker.string.uuid();

			// Should not throw
			expect(() => {
				recordTelemetryFailure(eventName, guildId, channelId);
			}).not.toThrow();
		});

		it('should record telemetry failure without channel ID', () => {
			const eventName = faker.word.noun();
			const guildId = faker.string.uuid();

			// Should not throw and should use 'unknown' for channel
			expect(() => {
				recordTelemetryFailure(eventName, guildId);
			}).not.toThrow();
		});

		it('should handle multiple failure recordings', () => {
			const eventName = faker.word.noun();
			const guildId = faker.string.uuid();

			expect(() => {
				recordTelemetryFailure(eventName, guildId);
				recordTelemetryFailure(eventName, guildId);
				recordTelemetryFailure(eventName, guildId);
			}).not.toThrow();
		});
	});

	describe('stopMetricsServer', () => {
		it('should stop the metrics server without error', async () => {
			await expect(stopMetricsServer()).resolves.not.toThrow();
		});

		it('should handle multiple stop calls', async () => {
			await stopMetricsServer();
			await expect(stopMetricsServer()).resolves.not.toThrow();
		});
	});

	describe('metrics integration', () => {
		it('should record both success and failure metrics', () => {
			const eventName = faker.word.noun();
			const guildId1 = faker.string.uuid();
			const guildId2 = faker.string.uuid();
			const channelId = faker.string.uuid();

			expect(() => {
				recordTelemetryDispatch(eventName, guildId1, channelId);
				recordTelemetryFailure(eventName, guildId2, channelId);
				recordTelemetryDispatch(eventName, guildId1);
				recordTelemetryFailure(eventName, guildId2);
			}).not.toThrow();
		});
	});
});
