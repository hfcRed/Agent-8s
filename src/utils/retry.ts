import { DiscordAPIError, HTTPError } from 'discord.js';
import pRetry, { AbortError, type Options as RetryOptions } from 'p-retry';
import {
	DISCORD_API_ERROR_CODES,
	HTTP_STATUS_CODES,
	RETRY_CONFIG,
} from '../constants.js';
import { ErrorSeverity, handleError } from './error-handler.js';

const NON_RETRYABLE_DISCORD_CODES = new Set<number>([
	DISCORD_API_ERROR_CODES.UNKNOWN_CHANNEL,
	DISCORD_API_ERROR_CODES.UNKNOWN_GUILD,
	DISCORD_API_ERROR_CODES.UNKNOWN_MESSAGE,
	DISCORD_API_ERROR_CODES.UNKNOWN_USER,
	DISCORD_API_ERROR_CODES.UNKNOWN_EMOJI,
	DISCORD_API_ERROR_CODES.UNKNOWN_WEBHOOK,
	DISCORD_API_ERROR_CODES.UNKNOWN_INTERACTION,
	DISCORD_API_ERROR_CODES.MISSING_ACCESS,
	DISCORD_API_ERROR_CODES.MISSING_PERMISSIONS,
	DISCORD_API_ERROR_CODES.INVALID_FORM_BODY,
	DISCORD_API_ERROR_CODES.INVALID_GUILD,
]);

const NON_RETRYABLE_HTTP_CODES = new Set<number>([
	HTTP_STATUS_CODES.BAD_REQUEST,
	HTTP_STATUS_CODES.UNAUTHORIZED,
	HTTP_STATUS_CODES.FORBIDDEN,
	HTTP_STATUS_CODES.NOT_FOUND,
	HTTP_STATUS_CODES.METHOD_NOT_ALLOWED,
	HTTP_STATUS_CODES.CONFLICT,
	HTTP_STATUS_CODES.GONE,
	HTTP_STATUS_CODES.UNPROCESSABLE_ENTITY,
]);

function shouldRetryError(error: unknown) {
	if (error instanceof DiscordAPIError) {
		if (error.code === HTTP_STATUS_CODES.RATE_LIMIT) {
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
	...RETRY_CONFIG.LOW,
	randomize: true,
	onFailedAttempt: (error) => {
		if (!shouldRetryError(error.error)) {
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
	...RETRY_CONFIG.MEDIUM,
	randomize: true,
	onFailedAttempt: (error) => {
		if (!shouldRetryError(error.error)) {
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
	...RETRY_CONFIG.HIGH,
	randomize: true,
	onFailedAttempt: (error) => {
		if (!shouldRetryError(error.error)) {
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
	...RETRY_CONFIG.DATABASE,
	randomize: true,
	onFailedAttempt: (error) => {
		if (!shouldRetryError(error.error)) {
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
