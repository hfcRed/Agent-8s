export const MAX_PARTICIPANTS = 8;

export const PING_ROLE_NAMES = ['Comp 8s', 'Casual 8s'];

export const COLORS = {
	OPEN: '#626CE9',
	STARTED: '#1cff5c',
	CANCELLED: '#ff1c1c',
	FINISHED: '#ff1c1c',
} as const;

export const STATUS_MESSAGES = {
	OPEN: '🟢 Open for Sign Ups',
	READY: '✅ Ready to Start!',
	STARTED: '✅ Event Started!',
	CANCELLED: '❌ Event cancelled',
	FINISHED: '🏁 Event Finished',
} as const;

export const ERROR_MESSAGES = {
	ALREADY_SIGNED_UP:
		'You are already signed up for an event. Please sign out, cancel, or wait for the event to finish before joining a new one.',
	CREATOR_ONLY_START: 'Only the event creator can start the event.',
	CREATOR_ONLY_CANCEL: 'Only the event creator can cancel this event.',
	CREATOR_ONLY_FINISH: 'Only the event creator can finish this event.',
	CREATOR_CANNOT_SIGNOUT:
		'The event creator cannot sign out. Please cancel the event instead.',
} as const;
