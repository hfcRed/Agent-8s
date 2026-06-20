import { TIMESTAMP } from '../../constants.js';
import type { Dictionary } from '../types.js';

export const ja: Dictionary = {
	fields: {
		participants: '参加者',
		participantsCount: (current: number) => `参加者 (${current})`,
		role: 'ロール',
		start: '開始',
		status: 'ステータス',
		spectators: '観戦者',
		queue: '待機列',
	},

	titles: {
		casual: '【カジュアル】8s 募集',
		competitive: '【コンペ】8s 募集',
	},

	status: {
		open: '🟢 募集中',
		ready: '✅ 開始準備完了！',
		started: '✅ イベント開始！',
		cancelled: '❌ イベントは中止されました',
		finished: '🏁 イベント終了',
		expired: '⏰ イベント期限切れ（6時間経過）',
		shutdown: '⚠️ Bot のシャットダウンによりイベントが終了しました！',
	},

	start: {
		whenFull: '👥 8 人が参加したとき',
		atTime: (timestamp: number) => `⏰ ${TIMESTAMP.RELATIVE(timestamp)}`,
	},

	roles: {
		none: '⚫ なし',
		slayer: '🔪 スレイヤー',
		skirmisher: '🏹 スカーミッシャー',
		support: '🛡️ サポート',
		midline: '⚔️ ミッドライン',
		backline: '🏰 バックライン',
		flex: '⚙️ フレックス',
		coolerFrontline: '🥤 クーラー（フロントライン）',
		coolerMidline: '🥤 クーラー（ミッドライン）',
		coolerBackline: '🥤 クーラー（バックライン）',
	},

	buttons: {
		signUp: '参加',
		signOut: '参加取消',
		cancelEvent: 'イベント中止',
		startNow: '今すぐ開始',
		dropIn: '途中参加',
		dropOut: '離脱',
		joinQueue: '待機列に入る',
		leaveQueue: '待機列から出る',
		finishEvent: 'イベント終了',
		spectate: '観戦',
		stopSpectating: '観戦をやめる',
	},

	select: {
		placeholder: '武器ロールを選択',
	},

	channels: {
		group: '👥 グループ',
		teamA: '🔵 チーム A',
		teamB: '🔴 チーム B',
		thread: (shortId: string) => `8s イベント - ${shortId}`,
		voiceChannelsCreated: (channelMentions: string) =>
			`**ボイスチャンネルを作成しました**\n\n${channelMentions}`,
	},

	errors: {
		alreadySignedUp:
			'すでにイベントに参加しています。新しいイベントに参加する前に、参加を取り消すか、イベントを中止または終了してください。',
		notSignedUp: 'この操作を行うにはイベントに参加している必要があります。',
		eventFull: 'このイベントはすでに満員です！参加できません。',

		creatorOnlyStart: 'イベントを開始できるのは作成者だけです。',
		creatorOnlyCancel:
			'このイベントを中止できるのは作成者または管理者だけです。',
		creatorOnlyFinish:
			'このイベントを終了できるのは作成者または管理者だけです。',
		creatorCannotSignout:
			'イベントの作成者は参加を取り消せません。代わりにイベントを中止または終了してください。',
		ownerOnlyParticipant:
			'あなたはこのイベントの唯一の参加者です。離脱する代わりにイベントを終了してください。',
		noBotPermissions: 'このチャンネルで操作する権限がありません。',
		kickSelf: '自分のイベントから自分自身をキックすることはできません。',

		notEnoughParticipants: 'まだイベントを開始できません。参加者が足りません。',
		noEventOwned: '現在、アクティブなイベントを所有していません。',
		notInEvent: '現在、どのアクティブなイベントにも参加していません。',
		repingEventFull:
			'あなたのイベントはすでに満員です。ロールを再通知する必要はありません。',

		channelNotFound: 'イベントのチャンネルが見つかりませんでした。',
		channelNoAccess: 'イベントのチャンネルにアクセスできませんでした。',
		messageNotFound: 'イベントのメッセージが見つかりませんでした。',
		roleNotFound: 'このサーバーで通知する適切なロールが見つかりませんでした。',

		shutdownWarning: 'Bot をシャットダウン中です。後でもう一度お試しください。',
		actionInProgress:
			'すでに処理中の操作があります。完了するまでお待ちください。',
		unexpectedError:
			'リクエストの処理中に予期しないエラーが発生しました。後でもう一度お試しください。',

		roleUpdateError: 'ロール選択の更新中にエラーが発生しました。',
		signUpError: '参加の処理中にエラーが発生しました。',
		signOutError: '参加取消の処理中にエラーが発生しました。',
		cancelError: 'イベントの中止中にエラーが発生しました。',
		startError: 'イベントの開始中にエラーが発生しました。',
		finishError: 'イベントの終了中にエラーが発生しました。',
		dropOutError: 'イベントからの離脱中にエラーが発生しました。',
		dropInError: 'イベントへの途中参加中にエラーが発生しました。',
		createError:
			'イベントの作成中にエラーが発生しました。もう一度お試しください。',
		statusError: 'Bot のステータス取得中にエラーが発生しました。',
		repingError: 'ロールの再通知中にエラーが発生しました。',
		kickError: 'ユーザーのキック中にエラーが発生しました。',

		queueEventNotFull: '待機列に入れるのはイベントが満員のときだけです。',
		queueAlreadyInQueue: 'あなたはすでにこのイベントの待機列に入っています。',
		queueAlreadyParticipating:
			'あなたはすでにアクティブなイベントに参加しています。待機列に入る前にそのイベントから離れてください。',
		queueNotInQueue: 'あなたはこのイベントの待機列に入っていません。',
		joinQueueError: '待機列への参加中にエラーが発生しました。',
		leaveQueueError: '待機列からの退出中にエラーが発生しました。',

		spectateAlreadySpectating: 'あなたはすでにこのイベントを観戦しています。',
		spectateFull: 'このイベントはすでに観戦者が上限に達しています。',
		spectateNotSpectating: 'あなたはこのイベントを観戦していません。',
		spectateError: '観戦の開始中にエラーが発生しました。',
		stopSpectateError: '観戦の終了中にエラーが発生しました。',
		toggleSpectatorsError:
			'イベントの観戦設定の切り替え中にエラーが発生しました。',

		dropoutAllNotInEvents:
			'現在、どのイベント・待機列・観戦リストにも参加していません。',
		dropoutAllError: '一括離脱リクエストの処理中にエラーが発生しました。',

		adminOnly: 'このコマンドを使用するにはサーバー管理者である必要があります。',
		configUnavailable:
			'データベースが設定されていないため、サーバー設定を利用できません。',
		setLanguageError: 'サーバーの言語の更新中にエラーが発生しました。',

		kickNotParticipant: (userId: string) =>
			`<@${userId}> はあなたのイベントに参加していません。`,
		repingCooldown: (minutesLeft: number) =>
			`再通知まであと ${minutesLeft} 分お待ちください。`,
	},

	success: {
		kickSuccess: (userId: string) =>
			`<@${userId}> をあなたのイベントからキックしました。`,
		spectatorsEnabled: 'あなたのイベントの観戦を**有効**にしました。',
		spectatorsDisabled:
			'あなたのイベントの観戦を**無効**にしました。現在の観戦者は全員削除されました。',
		dropoutAllSuccess:
			'すべてのイベント・待機列・観戦リストからあなたを削除しました。',
		languageSet: 'サーバーの言語を更新しました。',
	},

	ownership: {
		transferred: (userId: string) =>
			`⚠️ イベントの所有者が離脱しました！<@${userId}> さん、あなたがこのイベントの新しい所有者になりました。`,
	},

	processing: {
		stillStarting: 'イベントはまだ開始処理中です。お待ちください…',
		alreadyFinishing: 'イベントはすでに終了処理中です…',
		alreadyCancelling: 'イベントはすでに中止処理中です…',
		cleaningUp: 'イベントはクリーンアップ中です。これ以上の操作はできません…',
	},

	reping: {
		lookingFor: (missing: number, url: string) =>
			`${url} のメンバーを **+${missing}** 人募集中`,
	},

	statusCommand: {
		title: 'Bot ステータス',
		version: '📦 バージョン',
		node: '🟢 Node.js',
		guilds: '🌐 サーバー数',
		uptime: '⏱️ 稼働時間',
		ping: '🏓 Ping',
		telemetry: '🔔 テレメトリ',
		activeEvents: '📊 アクティブなイベント',
		totalParticipants: '👥 合計参加者数',
		memoryUsage: '💾 メモリ使用量',
		telemetryDisabled: '❌ 無効',
		telemetryHttpDb: '✅ HTTP/DB',
		telemetryHttp: '✅ HTTP',
		telemetryDb: '✅ DB',
	},

	commands: {
		create: {
			description: '新しい 8s イベントを作成します。',
			options: {
				time: 'イベント開始までの時間（分）。指定しない場合、8 人が参加した時点で開始します。',
				casual: 'カジュアルロールに通知するかどうか。',
				spectators: 'このイベントで観戦を許可するかどうか。',
				info: 'イベントに説明を追加します。',
			},
		},
		status: {
			description: 'Bot のステータスと統計を表示します。',
		},
		reping: {
			description: 'あなたのイベントのロールを再通知します。',
		},
		kick: {
			description: '選択したユーザーをあなたのイベントからキックします。',
			options: {
				user: 'キックするユーザー',
			},
		},
		toggleSpectators: {
			description: 'あなたのイベントの観戦を有効または無効にします。',
		},
		dropoutAll: {
			description:
				'すべてのイベント・待機列・観戦リストからあなたを削除します。',
		},
		setLanguage: {
			description: 'このサーバーで Bot が使用する言語を設定します。',
			options: {
				language: '共有イベントメッセージに使用する言語。',
				languageSecond:
					'最初の言語と並べて括弧内に表示する任意の 2 つ目の言語。',
			},
		},
	},
};
