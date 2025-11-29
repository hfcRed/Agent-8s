import dotenv from 'dotenv';

dotenv.config({ quiet: true });

export const DEV = process.env.NODE_ENV === 'development';
export const AUTHOR_ID = process.env.AUTHOR_ID;
export const DEFAULT_METRICS_PORT = 9464;
export const DEFAULT_SCHEMA = 'public';
export const DEFAULT_TABLE = 'telemetry_events';

export const MAX_PARTICIPANTS = DEV ? 2 : 8;
export const MAX_SPECTATORS = 2;
export const MATCH_ID_LENGTH = 5;

export const WEAPON_ROLES = [
	'⚫ None',
	'🔪 Slayer',
	'🏹 Skirmisher',
	'🛡️ Support',
	'⚔️ Midline',
	'🏰 Backline',
	'⚙️ Flex',
	'🥤 Cooler (Frontline)',
	'🥤 Cooler (Midline)',
	'🥤 Cooler (Backline)',
] as const;

export const TIMINGS = {
	MINUTE_IN_MS: 60 * 1000,
	HOUR_IN_MS: 60 * 60 * 1000,
	DAY_IN_MS: 24 * 60 * 60 * 1000,
	PROCESSING_TIMEOUT_MS: 30000,
	SHUTDOWN_EVENT_CLEANUP_DELAY_MS: 2000,
	REPING_COOLDOWN_MS: 15 * 60 * 1000,
	MESSAGE_UPDATE_DEBOUNCE_MS: 300,
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

export const FIELD_NAMES = {
	PARTICIPANTS: 'Participants',
	ROLE: 'Role',
	START: 'Start',
	STATUS: 'Status',
	SPECTATORS: 'Spectators',
	QUEUE: 'Queue',
} as const;

export const PARTICIPANT_FIELD_NAME = (current: number) =>
	`Participants (${current})` as const;

export const COLORS = {
	OPEN: '#626CE9',
	STARTED: '#1cff5c',
	CANCELLED: '#ff1c1c',
	FINISHED: '#ff1c1c',
	STATUS: '#5865F2',
} as const;

export const TITLES = {
	CASUAL: '[Casual] 8s Sign Up',
	COMPETITIVE: '[Competitive] 8s Sign Up',
	CASUAL_PREFIX: '[Casual]',
	COMPETITIVE_PREFIX: '[Competitive]',
} as const;

export const VOICE_CHANNEL_NAMES = [
	'👥 Group',
	'🔵 Team A',
	'🔴 Team B',
] as const;

export const VOICE_CHANNEL_NAME = (
	name: (typeof VOICE_CHANNEL_NAMES)[number],
	shortId: string,
) => `${name} - ${shortId}` as const;

export const THREAD_NAME = (shortId: string) =>
	`8s Event - ${shortId}` as const;

export const STATUS_MESSAGES = {
	OPEN: '🟢 Open for Sign Ups',
	READY: '✅ Ready to Start!',
	STARTED: '✅ Event Started!',
	CANCELLED: '❌ Event cancelled',
	FINISHED: '🏁 Event Finished',
	EXPIRED: '⏰ Event Expired (6h timeout)',
	SHUTDOWN: '⚠️ Event closed due to bot shutdown!',
} as const;

export const START_MESSAGES = {
	WHEN_FULL: '👥 When 8 players have signed up',
	AT_TIME: (timestamp: number) => `⏰ ${TIMESTAMP.RELATIVE(timestamp)}`,
} as const;

export const ERROR_MESSAGES = {
	ALREADY_SIGNED_UP:
		'You are already signed up for an event. Please sign out, cancel, or wait for the event to finish before joining a new one.',
	NOT_SIGNED_UP: 'You need to be signed up to perform this action.',
	EVENT_FULL: 'This event is already full! You cannot sign up.',

	CREATOR_ONLY_START: 'Only the event creator can start the event.',
	CREATOR_ONLY_CANCEL:
		'Only the event creator or administrators can cancel this event.',
	CREATOR_ONLY_FINISH:
		'Only the event creator or administrators can finish this event.',
	CREATOR_CANNOT_SIGNOUT:
		'The event creator cannot sign out. Please cancel or finish the event instead.',
	OWNER_ONLY_PARTICIPANT:
		'You are the only participant in this event. Please finish the event instead of dropping out.',
	NO_BOT_PERMISSIONS: 'I do not have permission to interact in this channel.',
	KICK_SELF: 'You cannot kick yourself from your own event.',

	NOT_ENOUGH_PARTICIPANTS:
		'Cannot start the event yet - not enough participants signed up.',
	NO_EVENT_OWNED: "You don't own any active events.",
	NOT_IN_EVENT: "You're not currently in any active events.",
	REPING_EVENT_FULL: 'Your event is already full. No need to re-ping roles.',

	CHANNEL_NOT_FOUND: 'Could not find the event channel.',
	CHANNEL_NO_ACCESS: 'Could not access the event channel.',
	MESSAGE_NOT_FOUND: 'Could not find the event message.',
	ROLE_NOT_FOUND: 'Could not find the appropriate role to ping in this server.',

	SHUTDOWN_WARNING: 'Bot is shutting down. Please try again later.',
	ACTION_IN_PROGRESS:
		'You already have an action in progress. Please wait for it to complete.',
	UNEXPECTED_ERROR:
		'An unexpected error occurred while processing your request. Please try again later.',

	ROLE_UPDATE_ERROR: 'An error occurred while updating your role selection.',
	SIGN_UP_ERROR: 'An error occurred while processing your sign-up.',
	SIGN_OUT_ERROR: 'An error occurred while processing your sign-out.',
	CANCEL_ERROR: 'An error occurred while cancelling the event.',
	START_ERROR: 'An error occurred while starting the event.',
	FINISH_ERROR: 'An error occurred while finishing the event.',
	DROP_OUT_ERROR: 'An error occurred while dropping out of the event.',
	DROP_IN_ERROR: 'An error occurred while dropping in to the event.',
	CREATE_ERROR: 'An error occurred while creating the event. Please try again.',
	STATUS_ERROR: 'An error occurred while fetching bot status.',
	REPING_ERROR: 'An error occurred while trying to re-ping roles.',
	KICK_ERROR: 'An error occurred while trying to kick the user.',

	QUEUE_EVENT_NOT_FULL: 'You can only join the queue when the event is full.',
	QUEUE_ALREADY_IN_QUEUE: 'You are already in the queue for this event.',
	QUEUE_ALREADY_PARTICIPATING:
		'You are already participating in an active event. Please leave that event before joining a queue.',
	QUEUE_NOT_IN_QUEUE: 'You are not in the queue for this event.',
	JOIN_QUEUE_ERROR: 'An error occurred while joining the queue.',
	LEAVE_QUEUE_ERROR: 'An error occurred while leaving the queue.',

	SPECTATE_ALREADY_SPECTATING: 'You are already spectating this event.',
	SPECTATE_FULL: 'This event already has the maximum number of spectators.',
	SPECTATE_NOT_SPECTATING: 'You are not spectating this event.',
	SPECTATE_ERROR: 'An error occurred while starting to spectate.',
	STOP_SPECTATE_ERROR: 'An error occurred while stopping spectating.',

	KICK_NOT_PARTICIPANT: (userId: string) =>
		`<@${userId}> is not signed up for your event.` as const,
	REPING_COOLDOWN: (minutesLeft: number) =>
		`Please wait ${minutesLeft} more minute${minutesLeft !== 1 ? 's' : ''} before re-pinging again.` as const,
} as const;

export const SUCCESS_MESSAGES = {
	KICK_SUCCESS: (userId: string) =>
		`Successfully kicked <@${userId}> from your event.` as const,
	OWNERSHIP_TRANSFERRED: (userId: string) =>
		`⚠️ Event owner dropped out! <@${userId}> you are now the owner of this event.` as const,
} as const;

export const PROCESSING_MESSAGES = {
	STILL_STARTING: 'Event is still starting, please wait...',
	ALREADY_FINISHING: 'Event is already being finished...',
	ALREADY_CANCELLING: 'Event is already being cancelled...',
	CLEANING_UP: 'Event is cleaning up, no actions can be performed anymore...',
} as const;

export const REPING_MESSAGE = (
	rolePing: string,
	missing: number,
	url: string,
) => `${rolePing}\nLooking for **+${missing}** for ${url}` as const;

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
