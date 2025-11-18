import { recordError } from '../telemetry/metrics.js';

export enum ErrorSeverity {
	LOW = 'LOW',
	MEDIUM = 'MEDIUM',
	HIGH = 'HIGH',
}

export interface ErrorContext {
	reason: string;
	severity: ErrorSeverity;
	error: unknown;
	metadata?: Record<string, unknown>;
	skipMetrics?: boolean;
}

export function handleError(context: ErrorContext) {
	const { reason, severity, error, metadata } = context;
	const emoji = getSeverityEmoji(severity);
	const timestamp = new Date().toISOString();
	const formattedError = formatError(error);

	const logParts = [`\n${emoji} [${severity}] ${reason}`, `Time: ${timestamp}`];

	if (metadata && Object.keys(metadata).length > 0) {
		logParts.push(`Metadata: ${JSON.stringify(metadata, null, 2)}`);
	}

	logParts.push(`Error: ${formattedError}`);
	logParts.push('─'.repeat(80));

	console.error(logParts.join('\n'));

	if (!context.skipMetrics) {
		recordError(reason, severity);
	}
}

function formatError(error: unknown) {
	if (error instanceof Error) {
		const parts = [error.message];

		if (error.stack) {
			const stackLines = error.stack.split('\n').slice(1, 3);
			if (stackLines.length > 0) {
				parts.push(`  at ${stackLines.join('\n  at ')}`);
			}
		}

		if (error.name && error.name !== 'Error') {
			parts.unshift(`[${error.name}]`);
		}

		return parts.join('\n');
	}

	if (typeof error === 'string') return error;

	if (error && typeof error === 'object') {
		try {
			return JSON.stringify(error, null, 2);
		} catch {
			return String(error);
		}
	}

	return String(error);
}

function getSeverityEmoji(severity: ErrorSeverity) {
	switch (severity) {
		case ErrorSeverity.HIGH:
			return '🔴';
		case ErrorSeverity.MEDIUM:
			return '🟡';
		case ErrorSeverity.LOW:
			return '🟢';
	}
}
