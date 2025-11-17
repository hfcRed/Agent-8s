import { DiscordAPIError, HTTPError } from 'discord.js';
import pRetry, { AbortError, type Options as RetryOptions } from 'p-retry';
import { ErrorSeverity, handleError } from './error-handler.js';

const NON_RETRYABLE_DISCORD_CODES = new Set([
	10003, // Unknown Channel
	10004, // Unknown Guild
	10008, // Unknown Message
	10013, // Unknown User
	10014, // Unknown Emoji
	10015, // Unknown Webhook
	10062, // Unknown Interaction
	50001, // Missing Access
	50013, // Missing Permissions
	50035, // Invalid Form Body
	50055, // Invalid Guild
]);

const NON_RETRYABLE_HTTP_CODES = new Set([
	400, // Bad Request
	401, // Unauthorized
	403, // Forbidden
	404, // Not Found
	405, // Method Not Allowed
	409, // Conflict
	410, // Gone
	422, // Unprocessable Entity
]);

function shouldRetryError(error: unknown) {
	if (error instanceof DiscordAPIError) {
		if (error.code === 429) {
			return false;
		}

		if (
			typeof error.code === 'number' &&
			NON_RETRYABLE_DISCORD_CODES.has(error.code)
		) {
			return false;
		}
	}

	if (error instanceof HTTPError) {
		if (NON_RETRYABLE_HTTP_CODES.has(error.status)) {
			return false;
		}
	}

	if (
		error &&
		typeof error === 'object' &&
		'status' in error &&
		typeof error.status === 'number'
	) {
		if (NON_RETRYABLE_HTTP_CODES.has(error.status)) {
			return false;
		}
	}

	return true;
}

function abortRetry(error: unknown) {
	throw new AbortError(
		error instanceof Error ? error : new Error(String(error)),
	);
}

export const LOW_RETRY_OPTIONS: RetryOptions = {
	retries: 2,
	factor: 2,
	minTimeout: 500,
	maxTimeout: 5000,
	randomize: true,
	onFailedAttempt: (error) => {
		if (!shouldRetryError(error)) {
			abortRetry(error);
		}

		handleError({
			reason: `Retry attempt ${error.attemptNumber} failed`,
			severity: ErrorSeverity.LOW,
			error: error,
			metadata: {
				attemptsLeft: error.retriesLeft,
				attemptNumber: error.attemptNumber,
			},
		});
	},
};

export const MEDIUM_RETRY_OPTIONS: RetryOptions = {
	retries: 3,
	factor: 2,
	minTimeout: 1000,
	maxTimeout: 10000,
	randomize: true,
	onFailedAttempt: (error) => {
		if (!shouldRetryError(error)) {
			abortRetry(error);
		}

		handleError({
			reason: `Retry attempt ${error.attemptNumber} failed`,
			severity: ErrorSeverity.MEDIUM,
			error: error,
			metadata: {
				attemptsLeft: error.retriesLeft,
				attemptNumber: error.attemptNumber,
			},
		});
	},
};

export const HIGH_RETRY_OPTIONS: RetryOptions = {
	retries: 5,
	factor: 2,
	minTimeout: 2000,
	maxTimeout: 30000,
	randomize: true,
	onFailedAttempt: (error) => {
		if (!shouldRetryError(error)) {
			abortRetry(error);
		}

		handleError({
			reason: `Critical operation retry attempt ${error.attemptNumber} failed`,
			severity: ErrorSeverity.HIGH,
			error: error,
			metadata: {
				attemptsLeft: error.retriesLeft,
				attemptNumber: error.attemptNumber,
			},
		});
	},
};

export const DATABASE_RETRY_OPTIONS: RetryOptions = {
	retries: 4,
	factor: 2,
	minTimeout: 1500,
	maxTimeout: 15000,
	randomize: true,
	onFailedAttempt: (error) => {
		if (!shouldRetryError(error)) {
			abortRetry(error);
		}

		handleError({
			reason: `Database retry attempt ${error.attemptNumber} failed`,
			severity: ErrorSeverity.LOW,
			error: error,
			metadata: {
				attemptsLeft: error.retriesLeft,
				attemptNumber: error.attemptNumber,
			},
		});
	},
};

export const TEST_RETRY_OPTIONS: RetryOptions = {
	retries: 2,
	factor: 1,
	minTimeout: 1,
	maxTimeout: 1,
	randomize: false,
	onFailedAttempt: (error) => {
		if (!shouldRetryError(error)) {
			abortRetry(error);
		}

		handleError({
			reason: `Retry attempt ${error.attemptNumber} failed`,
			severity: ErrorSeverity.LOW,
			error: error,
			metadata: {
				attemptsLeft: error.retriesLeft,
				attemptNumber: error.attemptNumber,
			},
		});
	},
};

export async function withRetry<T>(
	operation: () => Promise<T>,
	options: RetryOptions = MEDIUM_RETRY_OPTIONS,
) {
	return pRetry(operation, options);
}

export async function withRetryOrNull<T>(
	operation: () => Promise<T>,
	options: RetryOptions = MEDIUM_RETRY_OPTIONS,
) {
	try {
		return await pRetry(operation, options);
	} catch {
		return null;
	}
}

export async function withRetryBoolean(
	operation: () => Promise<void>,
	options: RetryOptions = MEDIUM_RETRY_OPTIONS,
) {
	try {
		await pRetry(operation, options);
		return true;
	} catch {
		return false;
	}
}
