import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GuildConfigStore } from '../../config/guild-config-store.js';

const { mockQuery, mockEnd } = vi.hoisted(() => {
	const mockQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
	const mockEnd = vi.fn().mockResolvedValue(undefined);
	return { mockQuery, mockEnd };
});

vi.mock('pg', () => {
	class MockPool {
		query = mockQuery;
		end = mockEnd;
	}

	return {
		Pool: MockPool,
	};
});

vi.mock('../../utils/retry.js', () => ({
	withRetry: vi.fn((fn) => fn()),
	DATABASE_RETRY_OPTIONS: {},
}));

vi.mock('../../utils/error-handler.js', () => ({
	handleError: vi.fn(),
	ErrorSeverity: { LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH' },
}));

describe('GuildConfigStore', () => {
	let store: GuildConfigStore;

	beforeEach(() => {
		vi.clearAllMocks();
		mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
		mockEnd.mockResolvedValue(undefined);
		store = new GuildConfigStore('postgresql://localhost:5432/test');
	});

	describe('initialize', () => {
		it('creates the schema and table, then loads existing rows', async () => {
			mockQuery.mockResolvedValue({
				rows: [
					{ guild_id: 'guild-en', locale: 'en' },
					{ guild_id: 'guild-ja', locale: 'ja' },
				],
			});

			await store.initialize();

			// CREATE SCHEMA + CREATE TABLE + SELECT
			expect(mockQuery.mock.calls.length).toBeGreaterThanOrEqual(3);
			expect(store.getLocale('guild-en')).toBe('en');
			expect(store.getLocale('guild-ja')).toBe('ja');
		});

		it('ignores rows with unsupported locales', async () => {
			mockQuery.mockResolvedValue({
				rows: [
					{ guild_id: 'guild-ok', locale: 'ja' },
					{ guild_id: 'guild-bad', locale: 'fr' },
				],
			});

			await store.initialize();

			expect(store.getLocale('guild-ok')).toBe('ja');
			expect(store.getLocale('guild-bad')).toBeUndefined();
		});
	});

	describe('getLocale', () => {
		it('returns undefined for an unknown guild', () => {
			expect(store.getLocale('never-seen')).toBeUndefined();
		});
	});

	describe('setLocale', () => {
		it('upserts the locale and updates the cache', async () => {
			await store.setLocale('guild123', 'ja');

			const upsert = mockQuery.mock.calls.find(([sql]) =>
				String(sql).includes('ON CONFLICT'),
			);
			expect(upsert).toBeDefined();
			expect(upsert?.[1]).toEqual(['guild123', 'ja']);

			expect(store.getLocale('guild123')).toBe('ja');
		});

		it('overwrites a previously cached locale', async () => {
			await store.setLocale('guild123', 'en');
			expect(store.getLocale('guild123')).toBe('en');

			await store.setLocale('guild123', 'ja');
			expect(store.getLocale('guild123')).toBe('ja');
		});
	});

	describe('dispose', () => {
		it('closes the pool', async () => {
			await store.dispose();
			expect(mockEnd).toHaveBeenCalled();
		});
	});
});
