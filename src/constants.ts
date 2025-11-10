import dotenv from 'dotenv';

dotenv.config({ quiet: true });
export const DEV = process.env.NODE_ENV === 'development';

export const MAX_PARTICIPANTS = DEV ? 2 : 8;

export const TIMINGS = {
	MINUTE_IN_MS: 60 * 1000,
	HOUR_IN_MS: 60 * 60 * 1000,
	DAY_IN_MS: 24 * 60 * 60 * 1000,
	PROCESSING_TIMEOUT_MS: 30000,
	EVENT_START_DELAY_MINUTES: DEV ? 0 : 0.25,
	SHUTDOWN_EVENT_CLEANUP_DELAY_MS: 2000,
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
	},
	'2': {
		name: 'T1 Legend',
		id: '1428998361188532264',
	},
	'3': {
		name: 'T2 Ascendant',
		id: '1428997469303341166',
	},
	'4': {
		name: 'T3 Elite',
		id: '1428997715106332815',
	},
	'5': {
		name: 'T4 Knight',
		id: '1428998081126596618',
	},
	'6': {
		name: 'T5 Squire',
		id: '1428998419250286704',
	},
} as const;

export const COLORS = {
	OPEN: '#626CE9',
	FINALIZING: '#E9D662',
	STARTED: '#1cff5c',
	CANCELLED: '#ff1c1c',
	FINISHED: '#ff1c1c',
} as const;

export const STATUS_MESSAGES = {
	OPEN: '🟢 Open for Sign Ups',
	READY: '✅ Ready to Start!',
	FINALIZING: '⏳ Finalizing...',
	STARTED: '✅ Event Started!',
	CANCELLED: '❌ Event cancelled',
	FINISHED: '🏁 Event Finished',
	EXPIRED: '⏰ Event Expired (24h timeout)',
	SHUTDOWN: '⚠️ Event closed due to bot shutdown!',
} as const;

export const ERROR_MESSAGES = {
	ALREADY_SIGNED_UP:
		'You are already signed up for an event. Please sign out, cancel, or wait for the event to finish before joining a new one.',
	CREATOR_ONLY_START: 'Only the event creator can start the event.',
	CREATOR_ONLY_CANCEL:
		'Only the event creator or administrators can cancel this event.',
	CREATOR_ONLY_FINISH:
		'Only the event creator or administrators can finish this event.',
	CREATOR_CANNOT_SIGNOUT:
		'The event creator cannot sign out. Please cancel or finish the event instead.',
	NOT_SIGNED_UP: 'You need to be signed up to perform this action.',
	EVENT_FULL: 'This event is already full! You cannot sign up.',
	NOT_ENOUGH_PARTICIPANTS:
		'Cannot start the event yet - not enough participants signed up.',
	EVENT_FINALIZING:
		'The event is finalizing and will start soon. Only role changes are allowed.',
	NO_BOT_PERMISSIONS: 'I do not have permission to interact in this channel.',
	NO_EVENT_OWNED: "You don't own any active events.",
	CHANNEL_NOT_FOUND: 'Could not find the event channel.',
	CHANNEL_NO_ACCESS: 'Could not access the event channel.',
	MESSAGE_NOT_FOUND: 'Could not find the event message.',
	ROLE_NOT_FOUND: 'Could not find the appropriate role to ping in this server.',
	REPING_EVENT_FULL: 'Your event is already full. No need to re-ping roles.',
} as const;

export const PROCESSING_MESSAGES = {
	STILL_STARTING: 'Event is still starting, please wait...',
	ALREADY_FINISHING: 'Event is already being finished...',
	ALREADY_CANCELLING: 'Event is already being cancelled...',
	CLEANING_UP: 'Event is cleaning up, no actions can be performed anymore...',
} as const;

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

export const ADMIN_PERMISSIONS = [
	'Administrator',
	'ManageMessages',
	'ManageChannels',
	'ModerateMembers',
] as const;
