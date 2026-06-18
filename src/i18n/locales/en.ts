import { TIMESTAMP } from '../../constants.js';

export const en = {
	// Shared event embed field names (server/event locale)
	fields: {
		participants: 'Participants',
		participantsCount: (current: number) => `Participants (${current})`,
		role: 'Role',
		start: 'Start',
		status: 'Status',
		spectators: 'Spectators',
		queue: 'Queue',
	},

	// Shared event embed titles (server/event locale)
	titles: {
		casual: '[Casual] 8s Sign Up',
		competitive: '[Competitive] 8s Sign Up',
	},

	// Shared event status line (server/event locale)
	status: {
		open: '🟢 Open for Sign Ups',
		ready: '✅ Ready to Start!',
		started: '✅ Event Started!',
		cancelled: '❌ Event cancelled',
		finished: '🏁 Event Finished',
		expired: '⏰ Event Expired (6h timeout)',
		shutdown: '⚠️ Event closed due to bot shutdown!',
	},

	// Shared event "start" field value (server/event locale)
	start: {
		whenFull: '👥 When 8 players have signed up',
		atTime: (timestamp: number) => `⏰ ${TIMESTAMP.RELATIVE(timestamp)}`,
	},

	// Weapon role labels, keyed by the stable RoleKey. The key is the wire/
	// stored value; this label is only ever shown, never matched.
	roles: {
		none: '⚫ None',
		slayer: '🔪 Slayer',
		skirmisher: '🏹 Skirmisher',
		support: '🛡️ Support',
		midline: '⚔️ Midline',
		backline: '🏰 Backline',
		flex: '⚙️ Flex',
		coolerFrontline: '🥤 Cooler (Frontline)',
		coolerMidline: '🥤 Cooler (Midline)',
		coolerBackline: '🥤 Cooler (Backline)',
	},

	// Shared component button labels (server/event locale)
	buttons: {
		signUp: 'Sign Up',
		signOut: 'Sign Out',
		cancelEvent: 'Cancel Event',
		startNow: 'Start Now',
		dropIn: 'Drop In',
		dropOut: 'Drop Out',
		joinQueue: 'Join Queue',
		leaveQueue: 'Leave Queue',
		finishEvent: 'Finish Event',
		spectate: 'Spectate',
		stopSpectating: 'Stop Spectating',
	},

	// Shared role select menu (server/event locale)
	select: {
		placeholder: 'Select a weapon role',
	},

	// Thread + voice channel names and the thread bootstrap message
	// (server/event locale)
	channels: {
		group: '👥 Group',
		teamA: '🔵 Team A',
		teamB: '🔴 Team B',
		thread: (shortId: string) => `8s Event - ${shortId}`,
		voiceChannelsCreated: (channelMentions: string) =>
			`**Voice Channels Created**\n\n${channelMentions}`,
	},

	// Ephemeral replies to the acting user (user locale)
	errors: {
		alreadySignedUp:
			'You are already signed up for an event. Please sign out, cancel, or wait for the event to finish before joining a new one.',
		notSignedUp: 'You need to be signed up to perform this action.',
		eventFull: 'This event is already full! You cannot sign up.',

		creatorOnlyStart: 'Only the event creator can start the event.',
		creatorOnlyCancel:
			'Only the event creator or administrators can cancel this event.',
		creatorOnlyFinish:
			'Only the event creator or administrators can finish this event.',
		creatorCannotSignout:
			'The event creator cannot sign out. Please cancel or finish the event instead.',
		ownerOnlyParticipant:
			'You are the only participant in this event. Please finish the event instead of dropping out.',
		noBotPermissions: 'I do not have permission to interact in this channel.',
		kickSelf: 'You cannot kick yourself from your own event.',

		notEnoughParticipants:
			'Cannot start the event yet - not enough participants signed up.',
		noEventOwned: "You don't own any active events.",
		notInEvent: "You're not currently in any active events.",
		repingEventFull: 'Your event is already full. No need to re-ping roles.',

		channelNotFound: 'Could not find the event channel.',
		channelNoAccess: 'Could not access the event channel.',
		messageNotFound: 'Could not find the event message.',
		roleNotFound: 'Could not find the appropriate role to ping in this server.',

		shutdownWarning: 'Bot is shutting down. Please try again later.',
		actionInProgress:
			'You already have an action in progress. Please wait for it to complete.',
		unexpectedError:
			'An unexpected error occurred while processing your request. Please try again later.',

		roleUpdateError: 'An error occurred while updating your role selection.',
		signUpError: 'An error occurred while processing your sign-up.',
		signOutError: 'An error occurred while processing your sign-out.',
		cancelError: 'An error occurred while cancelling the event.',
		startError: 'An error occurred while starting the event.',
		finishError: 'An error occurred while finishing the event.',
		dropOutError: 'An error occurred while dropping out of the event.',
		dropInError: 'An error occurred while dropping in to the event.',
		createError:
			'An error occurred while creating the event. Please try again.',
		statusError: 'An error occurred while fetching bot status.',
		repingError: 'An error occurred while trying to re-ping roles.',
		kickError: 'An error occurred while trying to kick the user.',

		queueEventNotFull: 'You can only join the queue when the event is full.',
		queueAlreadyInQueue: 'You are already in the queue for this event.',
		queueAlreadyParticipating:
			'You are already participating in an active event. Please leave that event before joining a queue.',
		queueNotInQueue: 'You are not in the queue for this event.',
		joinQueueError: 'An error occurred while joining the queue.',
		leaveQueueError: 'An error occurred while leaving the queue.',

		spectateAlreadySpectating: 'You are already spectating this event.',
		spectateFull: 'This event already has the maximum number of spectators.',
		spectateNotSpectating: 'You are not spectating this event.',
		spectateError: 'An error occurred while starting to spectate.',
		stopSpectateError: 'An error occurred while stopping spectating.',
		toggleSpectatorsError:
			'An error occurred while toggling spectators for your event.',

		dropoutAllNotInEvents:
			"You're not currently participating in, spectating, or queued for any events.",
		dropoutAllError:
			'An error occurred while processing your dropout-all request.',

		kickNotParticipant: (userId: string) =>
			`<@${userId}> is not signed up for your event.`,
		repingCooldown: (minutesLeft: number) =>
			`Please wait ${minutesLeft} more minute${minutesLeft !== 1 ? 's' : ''} before re-pinging again.`,
	},

	// Ephemeral success replies to the acting user (user locale)
	success: {
		kickSuccess: (userId: string) =>
			`Successfully kicked <@${userId}> from your event.`,
		spectatorsEnabled: 'Spectators are now **enabled** for your event.',
		spectatorsDisabled:
			'Spectators are now **disabled** for your event. All current spectators have been removed.',
		dropoutAllSuccess:
			'Successfully removed you from all events, queues, and spectator lists.',
	},

	// Posted to the shared event thread, addressed to the new owner
	// (server/event locale, NOT the dropping user's locale)
	ownership: {
		transferred: (userId: string) =>
			`⚠️ Event owner dropped out! <@${userId}> you are now the owner of this event.`,
	},

	// Ephemeral processing-state replies to the acting user (user locale)
	processing: {
		stillStarting: 'Event is still starting, please wait...',
		alreadyFinishing: 'Event is already being finished...',
		alreadyCancelling: 'Event is already being cancelled...',
		cleaningUp: 'Event is cleaning up, no actions can be performed anymore...',
	},

	// Public re-ping message posted to the channel (server/event locale)
	reping: {
		message: (rolePing: string, missing: number, url: string) =>
			`${rolePing}\nLooking for **+${missing}** for ${url}`,
	},

	// /status command embed (ephemeral, user locale). Dynamic values such as
	// version numbers, ping, counts and memory figures are not translated.
	statusCommand: {
		title: 'Bot Status',
		version: '📦 Version',
		node: '🟢 Node.js',
		guilds: '🌐 Guilds',
		uptime: '⏱️ Uptime',
		ping: '🏓 Ping',
		telemetry: '🔔 Telemetry',
		activeEvents: '📊 Active Events',
		totalParticipants: '👥 Total Participants',
		memoryUsage: '💾 Memory Usage',
		telemetryDisabled: '❌ Disabled',
		telemetryHttpDb: '✅ HTTP/DB',
		telemetryHttp: '✅ HTTP',
		telemetryDb: '✅ DB',
	},

	// Slash command + option descriptions. Names stay English and live in
	// index.ts; only descriptions are localized (natively via Discord).
	commands: {
		create: {
			description: 'Create a new 8s event.',
			options: {
				time: 'Time in minutes before the event starts. If not specified, event starts when 8 players sign up.',
				casual: 'Whether to ping casual roles.',
				spectators: 'Whether to allow spectators for this event.',
				info: 'Add a description to the event.',
			},
		},
		status: {
			description: 'Display bot status and statistics.',
		},
		reping: {
			description: 'Re-ping the roles for your event.',
		},
		kick: {
			description: 'Kick the selected user from your event.',
			options: {
				user: 'User to kick',
			},
		},
		toggleSpectators: {
			description: 'Enable or disable spectators for your event.',
		},
		dropoutAll: {
			description:
				'Remove yourself from all events, queues, and spectator lists.',
		},
	},
};
