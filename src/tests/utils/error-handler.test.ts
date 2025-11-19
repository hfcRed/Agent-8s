import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorSeverity, handleError } from '../../utils/error-handler.js';

vi.mock('../../telemetry/metrics.js', () => ({
	recordError: vi.fn(),
}));

describe('error-handler', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.spyOn(console, 'error').mockImplementation(() => {});
	});

	describe('handleError', () => {
		it('should log error with correct severity', () => {
			const consoleErrorSpy = vi.spyOn(console, 'error');

			handleError({
				reason: 'Test error',
				severity: ErrorSeverity.MEDIUM,
				error: new Error('Something went wrong'),
			});

			expect(consoleErrorSpy).toHaveBeenCalled();
			const logOutput = consoleErrorSpy.mock.calls[0][0];
			expect(logOutput).toContain('[MEDIUM]');
			expect(logOutput).toContain('Test error');
		});

		it('should format Error objects with message and stack', () => {
			const consoleErrorSpy = vi.spyOn(console, 'error');
			const error = new Error('Test message');

			handleError({
				reason: 'Error occurred',
				severity: ErrorSeverity.HIGH,
				error,
			});

			const logOutput = consoleErrorSpy.mock.calls[0][0];
			expect(logOutput).toContain('Test message');
		});

		it('should format string errors', () => {
			const consoleErrorSpy = vi.spyOn(console, 'error');

			handleError({
				reason: 'String error',
				severity: ErrorSeverity.LOW,
				error: 'Simple error string',
			});

			const logOutput = consoleErrorSpy.mock.calls[0][0];
			expect(logOutput).toContain('Simple error string');
		});

		it('should format object errors as JSON', () => {
			const consoleErrorSpy = vi.spyOn(console, 'error');
			const errorObj = { code: 404, message: 'Not found' };

			handleError({
				reason: 'Object error',
				severity: ErrorSeverity.MEDIUM,
				error: errorObj,
			});

			const logOutput = consoleErrorSpy.mock.calls[0][0];
			expect(logOutput).toContain('"code"');
			expect(logOutput).toContain('404');
		});

		it('should include metadata in logs', () => {
			const consoleErrorSpy = vi.spyOn(console, 'error');

			handleError({
				reason: 'Error with metadata',
				severity: ErrorSeverity.LOW,
				error: new Error('Test'),
				metadata: { userId: '123', action: 'test' },
			});

			const logOutput = consoleErrorSpy.mock.calls[0][0];
			expect(logOutput).toContain('Metadata');
			expect(logOutput).toContain('userId');
			expect(logOutput).toContain('123');
		});

		it('should not include metadata when empty', () => {
			const consoleErrorSpy = vi.spyOn(console, 'error');

			handleError({
				reason: 'Error without metadata',
				severity: ErrorSeverity.LOW,
				error: new Error('Test'),
				metadata: {},
			});

			const logOutput = consoleErrorSpy.mock.calls[0][0];
			expect(logOutput).not.toContain('Metadata');
		});

		it('should use correct emoji for LOW severity', () => {
			const consoleErrorSpy = vi.spyOn(console, 'error');

			handleError({
				reason: 'Low severity',
				severity: ErrorSeverity.LOW,
				error: new Error('Test'),
			});

			const logOutput = consoleErrorSpy.mock.calls[0][0];
			expect(logOutput).toContain('🟢');
		});

		it('should use correct emoji for MEDIUM severity', () => {
			const consoleErrorSpy = vi.spyOn(console, 'error');

			handleError({
				reason: 'Medium severity',
				severity: ErrorSeverity.MEDIUM,
				error: new Error('Test'),
			});

			const logOutput = consoleErrorSpy.mock.calls[0][0];
			expect(logOutput).toContain('🟡');
		});

		it('should use correct emoji for HIGH severity', () => {
			const consoleErrorSpy = vi.spyOn(console, 'error');

			handleError({
				reason: 'High severity',
				severity: ErrorSeverity.HIGH,
				error: new Error('Test'),
			});

			const logOutput = consoleErrorSpy.mock.calls[0][0];
			expect(logOutput).toContain('🔴');
		});

		it('should record metrics by default', async () => {
			const { recordError } = await import('../../telemetry/metrics.js');

			handleError({
				reason: 'Test metric recording',
				severity: ErrorSeverity.MEDIUM,
				error: new Error('Test'),
			});

			expect(recordError).toHaveBeenCalledWith(
				'Test metric recording',
				ErrorSeverity.MEDIUM,
			);
		});

		it('should skip metrics when skipMetrics is true', async () => {
			const { recordError } = await import('../../telemetry/metrics.js');
			vi.mocked(recordError).mockClear();

			handleError({
				reason: 'Skip metrics',
				severity: ErrorSeverity.LOW,
				error: new Error('Test'),
				skipMetrics: true,
			});

			expect(recordError).not.toHaveBeenCalled();
		});

		it('should handle errors with custom Error subclasses', () => {
			const consoleErrorSpy = vi.spyOn(console, 'error');

			class CustomError extends Error {
				constructor(message: string) {
					super(message);
					this.name = 'CustomError';
				}
			}

			handleError({
				reason: 'Custom error',
				severity: ErrorSeverity.HIGH,
				error: new CustomError('Custom error message'),
			});

			const logOutput = consoleErrorSpy.mock.calls[0][0];
			expect(logOutput).toContain('[CustomError]');
			expect(logOutput).toContain('Custom error message');
		});

		it('should handle circular reference in object errors', () => {
			const consoleErrorSpy = vi.spyOn(console, 'error');
			const circular: { self?: unknown } = {};
			circular.self = circular;

			handleError({
				reason: 'Circular object',
				severity: ErrorSeverity.LOW,
				error: circular,
			});

			expect(consoleErrorSpy).toHaveBeenCalled();
			const logOutput = consoleErrorSpy.mock.calls[0][0];
			expect(logOutput).toContain('[object Object]');
		});

		it('should include timestamp in logs', () => {
			const consoleErrorSpy = vi.spyOn(console, 'error');

			handleError({
				reason: 'Timestamp test',
				severity: ErrorSeverity.LOW,
				error: new Error('Test'),
			});

			const logOutput = consoleErrorSpy.mock.calls[0][0];
			expect(logOutput).toContain('Time:');
		});
	});
});
