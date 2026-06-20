import { Pool } from 'pg';
import { DEFAULT_GUILD_CONFIG_TABLE, DEFAULT_SCHEMA } from '../constants.js';
import { isLocale, type Locale } from '../i18n/index.js';
import { ErrorSeverity, handleError } from '../utils/error-handler.js';
import { DATABASE_RETRY_OPTIONS, withRetry } from '../utils/retry.js';

interface GuildConfigStoreOptions {
	schema?: string;
	table?: string;
}

/**
 * Persists per-guild configuration in PostgreSQL.
 * Values are cached in memory and the cache is preloaded on {@link initialize},
 * so {@link getLocale} is a synchronous lookup on the hot path (event creation).
 */
export class GuildConfigStore {
	private readonly schemaName: string;
	private readonly tableName: string;
	private readonly tableReference: string;
	private pool: Pool;
	private initialized = false;
	private localeCache = new Map<string, Locale>();
	private secondLocaleCache = new Map<string, Locale>();

	constructor(connectionString: string, options: GuildConfigStoreOptions = {}) {
		this.schemaName = this.resolveIdentifier(options.schema, DEFAULT_SCHEMA);
		this.tableName = this.resolveIdentifier(
			options.table,
			DEFAULT_GUILD_CONFIG_TABLE,
		);
		this.tableReference = `${this.quoteIdentifier(this.schemaName)}.${this.quoteIdentifier(this.tableName)}`;
		this.pool = new Pool({ connectionString });
	}

	async initialize() {
		try {
			await this.ensureSchema();
			await this.loadAll();
		} catch (error) {
			handleError({
				reason: 'Failed to initialize guild config store',
				severity: ErrorSeverity.MEDIUM,
				error,
				metadata: { schema: this.schemaName, table: this.tableName },
			});
		}
	}

	getLocale(guildId: string): Locale | undefined {
		return this.localeCache.get(guildId);
	}

	getSecondLocale(guildId: string): Locale | undefined {
		return this.secondLocaleCache.get(guildId);
	}

	async setLocale(guildId: string, locale: Locale, secondLocale?: Locale) {
		await this.ensureSchema();

		const second =
			secondLocale && secondLocale !== locale ? secondLocale : null;

		await withRetry(
			() =>
				this.pool.query(
					`INSERT INTO ${this.tableReference} (guild_id, locale, locale_second, updated_at)
					VALUES ($1, $2, $3, NOW())
					ON CONFLICT (guild_id)
					DO UPDATE SET locale = EXCLUDED.locale, locale_second = EXCLUDED.locale_second, updated_at = NOW()`,
					[guildId, locale, second],
				),
			DATABASE_RETRY_OPTIONS,
		);

		this.localeCache.set(guildId, locale);
		if (second) {
			this.secondLocaleCache.set(guildId, second);
		} else {
			this.secondLocaleCache.delete(guildId);
		}
	}

	async dispose() {
		await this.pool.end();
	}

	private async loadAll() {
		const result = await withRetry(
			() =>
				this.pool.query<{
					guild_id: string;
					locale: string;
					locale_second: string | null;
				}>(
					`SELECT guild_id, locale, locale_second FROM ${this.tableReference}`,
				),
			DATABASE_RETRY_OPTIONS,
		);

		this.localeCache.clear();
		this.secondLocaleCache.clear();
		for (const row of result.rows) {
			if (isLocale(row.locale)) {
				this.localeCache.set(row.guild_id, row.locale);
			}
			if (row.locale_second && isLocale(row.locale_second)) {
				this.secondLocaleCache.set(row.guild_id, row.locale_second);
			}
		}
	}

	private async ensureSchema() {
		if (this.initialized) return;

		await withRetry(
			() =>
				this.pool.query(
					`CREATE SCHEMA IF NOT EXISTS ${this.quoteIdentifier(this.schemaName)}`,
				),
			DATABASE_RETRY_OPTIONS,
		);

		await withRetry(
			() =>
				this.pool.query(`
				CREATE TABLE IF NOT EXISTS ${this.tableReference} (
					guild_id TEXT PRIMARY KEY,
					locale TEXT NOT NULL,
					locale_second TEXT,
					updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
				);
			`),
			DATABASE_RETRY_OPTIONS,
		);

		this.initialized = true;
	}

	private resolveIdentifier(
		value: string | null | undefined,
		fallback: string,
	) {
		if (!value) return fallback;

		const trimmed = value.trim();
		if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(trimmed)) {
			console.warn(
				`Invalid identifier "${value}" supplied to GuildConfigStore. Falling back to "${fallback}".`,
			);
			return fallback;
		}

		return trimmed;
	}

	private quoteIdentifier(identifier: string) {
		return `"${identifier.replace(/"/g, '""')}"`;
	}
}
