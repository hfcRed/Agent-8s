import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	recordError,
	recordInteraction,
	recordTelemetryDispatch,
	recordTelemetryFailure,
	stopMetricsServer,
} from '../../telemetry/metrics.js';
import { ErrorSeverity } from '../../utils/error-handler.js';

describe('metrics', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterAll(async () => {
		await stopMetricsServer();
	});

	describe('recordInteraction', () => {
		it('should record interaction without throwing', () => {
			expect(() => recordInteraction('button')).not.toThrow();
			expect(() => recordInteraction('command')).not.toThrow();
			expect(() => recordInteraction('menu')).not.toThrow();
		});

		it('should accept different interaction types', () => {
			expect(() => {
				recordInteraction('chatInput');
				recordInteraction('button');
				recordInteraction('selectMenu');
				recordInteraction('modal');
			}).not.toThrow();
		});
	});

	describe('recordError', () => {
		it('should record error with reason and severity', () => {
			expect(() => recordError('Test error', ErrorSeverity.LOW)).not.toThrow();
			expect(() =>
				recordError('Critical error', ErrorSeverity.HIGH),
			).not.toThrow();
		});

		it('should accept all severity levels', () => {
			expect(() => {
				recordError('Low severity', ErrorSeverity.LOW);
				recordError('Medium severity', ErrorSeverity.MEDIUM);
				recordError('High severity', ErrorSeverity.HIGH);
			}).not.toThrow();
		});

		it('should handle special characters in reason', () => {
			expect(() =>
				recordError('Error: "quoted" text', ErrorSeverity.LOW),
			).not.toThrow();
			expect(() =>
				recordError('Error\nwith\nnewlines', ErrorSeverity.MEDIUM),
			).not.toThrow();
		});
	});

	describe('recordTelemetryDispatch', () => {
		it('should record successful telemetry dispatch', () => {
			expect(() =>
				recordTelemetryDispatch('eventStarted', 'guild-123', 'channel-456'),
			).not.toThrow();
		});

		it('should handle different event names', () => {
			expect(() => {
				recordTelemetryDispatch('eventStarted', 'guild-1', 'channel-1');
				recordTelemetryDispatch('eventFinished', 'guild-2', 'channel-2');
				recordTelemetryDispatch('participantAdded', 'guild-3', 'channel-3');
			}).not.toThrow();
		});
	});

	describe('recordTelemetryFailure', () => {
		it('should record failed telemetry dispatch', () => {
			expect(() =>
				recordTelemetryFailure('eventStarted', 'guild-123', 'channel-456'),
			).not.toThrow();
		});

		it('should handle different failure scenarios', () => {
			expect(() => {
				recordTelemetryFailure('eventStarted', 'guild-1', 'channel-1');
				recordTelemetryFailure('eventCancelled', 'guild-2', 'channel-2');
			}).not.toThrow();
		});
	});

	describe('stopMetricsServer', () => {
		it('should stop server without throwing', async () => {
			await expect(stopMetricsServer()).resolves.not.toThrow();
		});

		it('should be idempotent', async () => {
			await stopMetricsServer();
			await expect(stopMetricsServer()).resolves.not.toThrow();
		});
	});

	describe('metrics integration', () => {
		it('should allow recording multiple metrics in sequence', () => {
			expect(() => {
				recordInteraction('button');
				recordError('Test error', ErrorSeverity.LOW);
				recordTelemetryDispatch('eventStarted', 'guild-1', 'channel-1');
				recordInteraction('command');
				recordTelemetryFailure('eventFailed', 'guild-2', 'channel-2');
			}).not.toThrow();
		});

		it('should handle rapid metric recording', () => {
			expect(() => {
				for (let i = 0; i < 100; i++) {
					recordInteraction('button');
					recordError(`Error ${i}`, ErrorSeverity.LOW);
				}
			}).not.toThrow();
		});
	});
});
