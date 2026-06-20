import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleSetLanguageCommand } from '../../commands/set-language-command.js';
import { getEventDictionary } from '../../i18n/bilingual.js';
import { t } from '../../i18n/index.js';

const { mockIsUserAdmin, mockSafeReply } = vi.hoisted(() => ({
	mockIsUserAdmin: vi.fn(() => true),
	mockSafeReply: vi.fn(),
}));

vi.mock('../../utils/helpers.js', () => ({
	isUserAdmin: mockIsUserAdmin,
	safeReplyToInteraction: mockSafeReply,
}));

vi.mock('../../utils/error-handler.js', () => ({
	handleError: vi.fn(),
	ErrorSeverity: { LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH' },
}));

describe('set-language-command', () => {
	let mockInteraction: ReturnType<typeof createMockInteraction>;
	let mockGuildConfig: ReturnType<typeof createMockGuildConfig>;

	function createMockInteraction(language = 'ja', languageSecond?: string) {
		return {
			user: { id: 'user123' },
			guildId: 'guild123',
			locale: 'en',
			member: {},
			options: {
				getString: vi.fn((name: string) =>
					name === 'language_second' ? (languageSecond ?? null) : language,
				),
			},
			deferReply: vi.fn().mockResolvedValue(undefined),
			editReply: vi.fn().mockResolvedValue(undefined),
		};
	}

	function createMockGuildConfig() {
		return {
			setLocale: vi.fn().mockResolvedValue(undefined),
		};
	}

	beforeEach(() => {
		vi.clearAllMocks();
		mockIsUserAdmin.mockReturnValue(true);
		mockInteraction = createMockInteraction();
		mockGuildConfig = createMockGuildConfig();
	});

	it('stores the chosen locale and confirms in that language', async () => {
		await handleSetLanguageCommand(
			mockInteraction as never,
			mockGuildConfig as never,
		);

		expect(mockGuildConfig.setLocale).toHaveBeenCalledWith(
			'guild123',
			'ja',
			undefined,
		);
		expect(mockInteraction.editReply).toHaveBeenCalledWith({
			content: t('ja').success.languageSet,
		});
	});

	it('stores a second locale and confirms bilingually', async () => {
		mockInteraction = createMockInteraction('en', 'ja');

		await handleSetLanguageCommand(
			mockInteraction as never,
			mockGuildConfig as never,
		);

		expect(mockGuildConfig.setLocale).toHaveBeenCalledWith(
			'guild123',
			'en',
			'ja',
		);
		expect(mockInteraction.editReply).toHaveBeenCalledWith({
			content: getEventDictionary('en', 'ja').success.languageSet,
		});
	});

	it('ignores a second locale equal to the primary', async () => {
		mockInteraction = createMockInteraction('ja', 'ja');

		await handleSetLanguageCommand(
			mockInteraction as never,
			mockGuildConfig as never,
		);

		expect(mockGuildConfig.setLocale).toHaveBeenCalledWith(
			'guild123',
			'ja',
			undefined,
		);
	});

	it('rejects non-administrators without writing config', async () => {
		mockIsUserAdmin.mockReturnValue(false);

		await handleSetLanguageCommand(
			mockInteraction as never,
			mockGuildConfig as never,
		);

		expect(mockGuildConfig.setLocale).not.toHaveBeenCalled();
		expect(mockInteraction.editReply).toHaveBeenCalledWith({
			content: t('en').errors.adminOnly,
		});
	});

	it('reports when config storage is unavailable', async () => {
		await handleSetLanguageCommand(mockInteraction as never, undefined);

		expect(mockInteraction.editReply).toHaveBeenCalledWith({
			content: t('en').errors.configUnavailable,
		});
	});

	it('rejects an unsupported language value', async () => {
		mockInteraction = createMockInteraction('fr');

		await handleSetLanguageCommand(
			mockInteraction as never,
			mockGuildConfig as never,
		);

		expect(mockGuildConfig.setLocale).not.toHaveBeenCalled();
		expect(mockInteraction.editReply).toHaveBeenCalledWith({
			content: t('en').errors.setLanguageError,
		});
	});
});
