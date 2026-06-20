import dotenv from 'dotenv';

dotenv.config({ quiet: true });

export const DEV = process.env.NODE_ENV === 'development';
export const AUTHOR_ID = process.env.AUTHOR_ID;
export const DEFAULT_METRICS_PORT = 9464;
export const DEFAULT_SCHEMA = 'public';
export const DEFAULT_TELEMETRY_EVENTS_TABLE = 'telemetry_events';
export const DEFAULT_GUILD_CONFIG_TABLE = 'guild_config';

export const MAX_PARTICIPANTS = DEV ? 2 : 8;
export const MAX_SPECTATORS = 2;
export const MATCH_ID_LENGTH = 5;
export const MAX_EVENT_LIFETIME_HOURS = 8;

export const ROLE_KEYS = [
	'none',
	'slayer',
	'skirmisher',
	'support',
	'midline',
	'backline',
	'flex',
	'coolerFrontline',
	'coolerMidline',
	'coolerBackline',
] as const;

export type RoleKey = (typeof ROLE_KEYS)[number];
export const DEFAULT_ROLE_KEY: RoleKey = 'none';
export const VOICE_CHANNEL_KEYS = ['group', 'teamA', 'teamB'] as const;
export type VoiceChannelKey = (typeof VOICE_CHANNEL_KEYS)[number];

export const TIMINGS = {
	MINUTE_IN_MS: 60 * 1000,
	HOUR_IN_MS: 60 * 60 * 1000,
	DAY_IN_MS: 24 * 60 * 60 * 1000,
	PROCESSING_TIMEOUT_MS: 30000,
	SHUTDOWN_EVENT_CLEANUP_DELAY_MS: 2000,
	REPING_COOLDOWN_MS: 15 * 60 * 1000,
	MESSAGE_UPDATE_DEBOUNCE_MS: 300,
	GUILD_CONFIG_RETRY_MS: 30 * 1000,
} as const;

export const TIME_UNITS = {
	SECOND_IN_MS: 1000,
	MINUTE_IN_MS: 60000,
	HOUR_IN_MS: 3600000,
	DAY_IN_MS: 86400000,
} as const;

export const TIMESTAMP = {
	RELATIVE: (timestamp: number) => `<t:${Math.floor(timestamp / 1000)}:R>`,
	FULL: (timestamp: number) => `<t:${Math.floor(timestamp / 1000)}:F>`,
} as const;

export const COLORS = {
	OPEN: '#626CE9',
	STARTED: '#1cff5c',
	CANCELLED: '#ff1c1c',
	FINISHED: '#ff1c1c',
	STATUS: '#5865F2',
} as const;

export const PING_ROLE_NAMES = {
	casual: 'Casual 8s',
	competitive: 'Comp 8s',
} as const;

export const EXCALIBUR_GUILD_ID = '1428966578501849193';
export const EXCALIBUR_RANKS = {
	'1': {
		name: 'TX Grandmaster',
		id: '1429217994168598669',
		emoteName: 'Ex8s1_grandmaster',
		emoteId: '1429215523824078941',
	},
	'2': {
		name: 'T1 Legend',
		id: '1428998361188532264',
		emoteName: 'Ex8s2_legend',
		emoteId: '1428988098892529787',
	},
	'3': {
		name: 'T2 Ascendant',
		id: '1428997469303341166',
		emoteName: 'Ex8s3_ascendant',
		emoteId: '1428988084535427102',
	},
	'4': {
		name: 'T3 Elite',
		id: '1428997715106332815',
		emoteName: 'Ex8s4_elite',
		emoteId: '1428988071059259392',
	},
	'5': {
		name: 'T4 Knight',
		id: '1428998081126596618',
		emoteName: 'Ex8s5_knight',
		emoteId: '1428988053472415768',
	},
	'6': {
		name: 'T5 Squire',
		id: '1428998419250286704',
		emoteName: 'Ex8s6_novice',
		emoteId: '1428988037383327825',
	},
} as const;

export const ADMIN_PERMISSIONS = [
	'Administrator',
	'ManageMessages',
	'ManageChannels',
	'ModerateMembers',
] as const;

export const DISCORD_API_ERROR_CODES = {
	UNKNOWN_CHANNEL: 10003,
	UNKNOWN_GUILD: 10004,
	UNKNOWN_MESSAGE: 10008,
	UNKNOWN_USER: 10013,
	UNKNOWN_EMOJI: 10014,
	UNKNOWN_WEBHOOK: 10015,
	UNKNOWN_INTERACTION: 10062,
	MISSING_ACCESS: 50001,
	MISSING_PERMISSIONS: 50013,
	INVALID_FORM_BODY: 50035,
	INVALID_GUILD: 50055,
} as const;

export const HTTP_STATUS_CODES = {
	BAD_REQUEST: 400,
	UNAUTHORIZED: 401,
	FORBIDDEN: 403,
	NOT_FOUND: 404,
	METHOD_NOT_ALLOWED: 405,
	CONFLICT: 409,
	GONE: 410,
	UNPROCESSABLE_ENTITY: 422,
	RATE_LIMIT: 429,
} as const;

export const RETRY_CONFIG = {
	LOW: {
		retries: 2,
		factor: 2,
		minTimeout: 500,
		maxTimeout: 5000,
	},
	MEDIUM: {
		retries: 3,
		factor: 2,
		minTimeout: 1000,
		maxTimeout: 10000,
	},
	HIGH: {
		retries: 5,
		factor: 2,
		minTimeout: 2000,
		maxTimeout: 30000,
	},
	DATABASE: {
		retries: 4,
		factor: 2,
		minTimeout: 1500,
		maxTimeout: 15000,
	},
} as const;
