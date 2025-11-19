import { DiscordAPIError, HTTPError } from 'discord.js';
import { AbortError } from 'p-retry';
import { describe, expect, it, vi } from 'vitest';
import { DISCORD_API_ERROR_CODES, HTTP_STATUS_CODES } from '../../constants.js';
import {
	DATABASE_RETRY_OPTIONS,
	HIGH_RETRY_OPTIONS,
	LOW_RETRY_OPTIONS,
	MEDIUM_RETRY_OPTIONS,
	withRetry,
	withRetryOrNull,
} from '../../utils/retry.js';

describe('retry utilities', () => {
	describe('withRetry', () => {
		it('should successfully execute operation on first attempt', async () => {
			const operation = vi.fn().mockResolvedValue('success');

			const result = await withRetry(operation, LOW_RETRY_OPTIONS);

			expect(result).toBe('success');
			expect(operation).toHaveBeenCalledTimes(1);
		});

		it('should retry on transient failures and eventually succeed', async () => {
			const operation = vi
				.fn()
				.mockRejectedValueOnce(new Error('Temporary failure'))
				.mockResolvedValue('success');

			const result = await withRetry(operation, LOW_RETRY_OPTIONS);

			expect(result).toBe('success');
			expect(operation).toHaveBeenCalledTimes(2);
		});

		it('should throw after max retries exceeded', async () => {
			const operation = vi.fn().mockRejectedValue(new Error('Always fails'));

			await expect(withRetry(operation, LOW_RETRY_OPTIONS)).rejects.toThrow();
			expect(operation).toHaveBeenCalledTimes(3);
		});

		it('should not retry on non-retryable Discord API errors', async () => {
			const error = new DiscordAPIError(
				{ message: 'Unknown Channel', code: 10003 },
				DISCORD_API_ERROR_CODES.UNKNOWN_CHANNEL,
				404,
				'GET',
				'',
				{},
			);
			const operation = vi.fn().mockRejectedValue(error);

			await expect(withRetry(operation, LOW_RETRY_OPTIONS)).rejects.toThrow(
				AbortError,
			);
			expect(operation).toHaveBeenCalledTimes(1);
		});

		it('should not retry on missing permissions', async () => {
			const error = new DiscordAPIError(
				{ message: 'Missing Permissions', code: 50013 },
				DISCORD_API_ERROR_CODES.MISSING_PERMISSIONS,
				403,
				'POST',
				'',
				{},
			);
			const operation = vi.fn().mockRejectedValue(error);

			await expect(withRetry(operation, LOW_RETRY_OPTIONS)).rejects.toThrow(
				AbortError,
			);
			expect(operation).toHaveBeenCalledTimes(1);
		});

		it('should not retry on rate limit errors', async () => {
			const error = new DiscordAPIError(
				{ message: 'Rate Limited', code: 0 },
				HTTP_STATUS_CODES.RATE_LIMIT,
				429,
				'GET',
				'',
				{},
			);
			const operation = vi.fn().mockRejectedValue(error);

			await expect(withRetry(operation, LOW_RETRY_OPTIONS)).rejects.toThrow(
				AbortError,
			);
			expect(operation).toHaveBeenCalledTimes(1);
		});

		it('should not retry on HTTP 404 errors', async () => {
			const error = new HTTPError(HTTP_STATUS_CODES.NOT_FOUND, '', 'GET', '', {
				body: undefined,
				files: undefined,
			});
			const operation = vi.fn().mockRejectedValue(error);

			await expect(withRetry(operation, LOW_RETRY_OPTIONS)).rejects.toThrow(
				AbortError,
			);
			expect(operation).toHaveBeenCalledTimes(1);
		});

		it('should not retry on HTTP 403 forbidden errors', async () => {
			const error = new HTTPError(HTTP_STATUS_CODES.FORBIDDEN, '', 'GET', '', {
				body: undefined,
				files: undefined,
			});
			const operation = vi.fn().mockRejectedValue(error);

			await expect(withRetry(operation, LOW_RETRY_OPTIONS)).rejects.toThrow(
				AbortError,
			);
			expect(operation).toHaveBeenCalledTimes(1);
		});

		it('should retry on HTTP 500 errors', async () => {
			const error = new HTTPError(500, '', 'GET', '', {
				body: undefined,
				files: undefined,
			});
			const operation = vi
				.fn()
				.mockRejectedValueOnce(error)
				.mockResolvedValue('recovered');

			const result = await withRetry(operation, LOW_RETRY_OPTIONS);

			expect(result).toBe('recovered');
			expect(operation).toHaveBeenCalledTimes(2);
		});

		it(
			'should use different retry counts for different configurations',
			{ timeout: 25000 },
			async () => {
				const failOperation = vi.fn().mockRejectedValue(new Error('Fail'));

				await expect(
					withRetry(failOperation, LOW_RETRY_OPTIONS),
				).rejects.toThrow();
				const lowAttempts = failOperation.mock.calls.length;

				failOperation.mockClear();
				await expect(
					withRetry(failOperation, MEDIUM_RETRY_OPTIONS),
				).rejects.toThrow();
				const mediumAttempts = failOperation.mock.calls.length;

				expect(mediumAttempts).toBeGreaterThan(lowAttempts);
			},
		);
	});

	describe('withRetryOrNull', () => {
		it('should return result on success', async () => {
			const operation = vi.fn().mockResolvedValue('success');

			const result = await withRetryOrNull(operation, LOW_RETRY_OPTIONS);

			expect(result).toBe('success');
			expect(operation).toHaveBeenCalledTimes(1);
		});

		it('should return null on failure instead of throwing', async () => {
			const operation = vi.fn().mockRejectedValue(new Error('Fail'));

			const result = await withRetryOrNull(operation, LOW_RETRY_OPTIONS);

			expect(result).toBeNull();
		});

		it('should retry before returning null', async () => {
			const operation = vi.fn().mockRejectedValue(new Error('Fail'));

			await withRetryOrNull(operation, LOW_RETRY_OPTIONS);

			expect(operation).toHaveBeenCalledTimes(3);
		});

		it('should return null immediately on non-retryable errors', async () => {
			const error = new DiscordAPIError(
				{ message: 'Unknown Message', code: 10008 },
				DISCORD_API_ERROR_CODES.UNKNOWN_MESSAGE,
				404,
				'GET',
				'',
				{},
			);
			const operation = vi.fn().mockRejectedValue(error);

			const result = await withRetryOrNull(operation, LOW_RETRY_OPTIONS);

			expect(result).toBeNull();
			expect(operation).toHaveBeenCalledTimes(1);
		});
	});

	describe('retry configurations', () => {
		it('should have valid LOW retry configuration', () => {
			expect(LOW_RETRY_OPTIONS.retries).toBeDefined();
			expect(LOW_RETRY_OPTIONS.randomize).toBe(true);
			expect(LOW_RETRY_OPTIONS.onFailedAttempt).toBeDefined();
		});

		it('should have valid MEDIUM retry configuration', () => {
			expect(MEDIUM_RETRY_OPTIONS.retries).toBeDefined();
			expect(MEDIUM_RETRY_OPTIONS.randomize).toBe(true);
			expect(MEDIUM_RETRY_OPTIONS.onFailedAttempt).toBeDefined();
		});

		it('should have valid HIGH retry configuration', () => {
			expect(HIGH_RETRY_OPTIONS.retries).toBeDefined();
			expect(HIGH_RETRY_OPTIONS.randomize).toBe(true);
			expect(HIGH_RETRY_OPTIONS.onFailedAttempt).toBeDefined();
		});

		it('should have valid DATABASE retry configuration', () => {
			expect(DATABASE_RETRY_OPTIONS.retries).toBeDefined();
			expect(DATABASE_RETRY_OPTIONS.randomize).toBe(true);
			expect(DATABASE_RETRY_OPTIONS.onFailedAttempt).toBeDefined();
		});
	});
});
