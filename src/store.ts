import crypto from "node:crypto";
import pg from "pg";
import { compressText, decompressText } from "./compression.js";
import { buildSearchQuery } from "./query.js";
import {
  EntryInput,
  EntryRecord,
  SearchOptions,
  ContextRecord,
  ContextAliasRecord
} from "./types.js";

export interface StoreOptions {
  maxContentChars: number;
  maxTitleChars: number;
  maxRawChars: number;
  storeRawPlaintext: boolean;
  vectorEnabled: boolean;
}

export interface MemoryStore {
  createContext(input: {
    namespace: string;
    context_id: string;
    description?: string | null;
    tags?: string[] | null;
    scope?: string | null;
    owner?: string | null;
    metadata?: Record<string, unknown> | null;
  }): Promise<ContextRecord>;
  listContexts(input: {
    namespace?: string | null;
    scope?: string | null;
    owner?: string | null;
    tags?: string[] | null;
    limit?: number | null;
  }): Promise<ContextRecord[]>;
  deleteContext(input: { namespace: string; context_id: string }): Promise<boolean>;
  setContextAlias(input: {
    alias: string;
    namespace: string;
    context_id: string;
  }): Promise<ContextAliasRecord>;
  listContextAliases(input: {
    namespace?: string | null;
    context_id?: string | null;
    limit?: number | null;
  }): Promise<ContextAliasRecord[]>;
  deleteContextAlias(input: { alias: string }): Promise<boolean>;
  resolveContextAlias(alias: string): Promise<{ namespace: string; context_id: string } | null>;
  upsertEntry(input: {
    namespace: string;
    context_id: string;
    entry: EntryInput;
  }): Promise<EntryRecord>;
  getEntry(input: {
    namespace: string;
    context_id: string;
    entry_id: string;
    include_raw?: boolean;
  }): Promise<EntryRecord | null>;
  searchEntries(options: SearchOptions): Promise<EntryRecord[]>;
  deleteEntry(input: {
    namespace: string;
    context_id: string;
    entry_id: string;
  }): Promise<boolean>;
  cleanupExpiredEntries(): Promise<number>;
}

export function createStore(pool: pg.Pool, storeOptions: StoreOptions): MemoryStore {
  return {
    async createContext(input) {
      const id = crypto.randomUUID();
      const result = await pool.query<ContextRecord>(
        `
        INSERT INTO contexts (
          id, namespace, context_id, description, tags, scope, owner, metadata
        ) VALUES (
          $1,
          $2,
          $3,
          $4,
          COALESCE($5, '{}'::text[]),
          COALESCE($6, 'shared'),
          $7,
          COALESCE($8, '{}'::jsonb)
        )
        ON CONFLICT (namespace, context_id) DO UPDATE SET
          description = COALESCE(EXCLUDED.description, contexts.description),
          tags = CASE WHEN EXCLUDED.tags IS NULL THEN contexts.tags ELSE EXCLUDED.tags END,
          scope = COALESCE(EXCLUDED.scope, contexts.scope),
          owner = COALESCE(EXCLUDED.owner, contexts.owner),
          metadata = contexts.metadata || COALESCE(EXCLUDED.metadata, '{}'::jsonb)
        RETURNING *
        `,
        [
          id,
          input.namespace,
          input.context_id,
          input.description ?? null,
          input.tags ?? null,
          input.scope ?? null,
          input.owner ?? null,
          input.metadata ?? {}
        ]
      );

      return result.rows[0];
    },

    async listContexts(input) {
      const values: unknown[] = [];
      const where: string[] = [];

      if (input.namespace) {
        values.push(input.namespace);
        where.push(`namespace = $${values.length}`);
      }

      if (input.scope) {
        values.push(input.scope);
        where.push(`scope = $${values.length}`);
      }

      if (input.owner) {
        values.push(input.owner);
        where.push(`owner = $${values.length}`);
      }

      if (input.tags && input.tags.length > 0) {
        values.push(input.tags);
        where.push(`tags && $${values.length}`);
      }

      const limit = Math.min(input.limit ?? 50, 200);
      values.push(limit);

      const result = await pool.query<ContextRecord>(
        `
        SELECT * FROM contexts
        ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY updated_at DESC
        LIMIT $${values.length}
        `,
        values
      );

      return result.rows;
    },

    async deleteContext(input) {
      const result = await pool.query(
        "DELETE FROM contexts WHERE namespace = $1 AND context_id = $2",
        [input.namespace, input.context_id]
      );
      return (result.rowCount ?? 0) > 0;
    },

    async setContextAlias(input) {
      const result = await pool.query<ContextAliasRecord>(
        `
        INSERT INTO context_aliases (alias, namespace, context_id)
        VALUES ($1, $2, $3)
        ON CONFLICT (alias) DO UPDATE SET
          namespace = EXCLUDED.namespace,
          context_id = EXCLUDED.context_id
        RETURNING *
        `,
        [input.alias, input.namespace, input.context_id]
      );
      return result.rows[0];
    },

    async listContextAliases(input) {
      const values: unknown[] = [];
      const where: string[] = [];

      if (input.namespace) {
        values.push(input.namespace);
        where.push(`namespace = $${values.length}`);
      }

      if (input.context_id) {
        values.push(input.context_id);
        where.push(`context_id = $${values.length}`);
      }

      const limit = Math.min(input.limit ?? 50, 200);
      values.push(limit);

      const result = await pool.query<ContextAliasRecord>(
        `
        SELECT * FROM context_aliases
        ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY updated_at DESC
        LIMIT $${values.length}
        `,
        values
      );

      return result.rows;
    },

    async deleteContextAlias(input) {
      const result = await pool.query(
        "DELETE FROM context_aliases WHERE alias = $1",
        [input.alias]
      );
      return (result.rowCount ?? 0) > 0;
    },

    async resolveContextAlias(alias) {
      const result = await pool.query<{
        namespace: string;
        context_id: string;
      }>("SELECT namespace, context_id FROM context_aliases WHERE alias = $1", [
        alias
      ]);
      if ((result.rowCount ?? 0) === 0) return null;
      return result.rows[0];
    },

    async upsertEntry(input) {
      const contextPk = await resolveContextPk(
        pool,
        input.namespace,
        input.context_id
      );
      if (!contextPk) {
        throw new Error("context not found; create it first");
      }

      const entry = input.entry;
      if (entry.content.length > storeOptions.maxContentChars) {
        throw new Error(
          `content exceeds ${storeOptions.maxContentChars} characters`
        );
      }
      if (entry.title && entry.title.length > storeOptions.maxTitleChars) {
        throw new Error(`title exceeds ${storeOptions.maxTitleChars} characters`);
      }
      if (entry.raw_text && entry.raw_text.length > storeOptions.maxRawChars) {
        throw new Error(`raw_text exceeds ${storeOptions.maxRawChars} characters`);
      }

      const raw = await prepareRaw(entry.raw_text, storeOptions);
      if (entry.embedding && !storeOptions.vectorEnabled) {
        throw new Error("embedding provided but pgvector is not enabled");
      }

      if (entry.entry_id) {
        const update = buildUpdateSql(storeOptions.vectorEnabled);
        const result = await pool.query<EntryRecord>(update.text, [
          entry.entry_type,
          entry.title ?? null,
          entry.content,
          entry.tags ?? [],
          entry.importance ?? 0,
          entry.created_by ?? null,
          raw.rawText,
          raw.rawCompressed,
          entry.metadata ?? {},
          entry.expires_at ?? null,
          ...(storeOptions.vectorEnabled ? [entry.embedding ?? null] : []),
          entry.entry_id,
          contextPk
        ]);

        if ((result.rowCount ?? 0) === 0) {
          throw new Error("entry not found for context");
        }
        return stripRaw(result.rows[0]);
      }

      const entryId = crypto.randomUUID();
      const insert = buildInsertSql(storeOptions.vectorEnabled);
      const result = await pool.query<EntryRecord>(insert.text, [
        entryId,
        contextPk,
        entry.entry_type,
        entry.title ?? null,
        entry.content,
        entry.tags ?? [],
        entry.importance ?? 0,
        entry.created_by ?? null,
        raw.rawText,
        raw.rawCompressed,
        entry.metadata ?? {},
        entry.expires_at ?? null,
        ...(storeOptions.vectorEnabled ? [entry.embedding ?? null] : [])
      ]);

      return stripRaw(result.rows[0]);
    },

    async getEntry(input) {
      const contextPk = await resolveContextPk(
        pool,
        input.namespace,
        input.context_id
      );
      if (!contextPk) return null;

      const result = await pool.query<EntryRecord>(
        "SELECT * FROM entries WHERE id = $1 AND context_pk = $2",
        [input.entry_id, contextPk]
      );
      if ((result.rowCount ?? 0) === 0) return null;

      const entry = result.rows[0];
      if (input.include_raw) {
        if (entry.raw_text === null && entry.raw_compressed) {
          const raw = await decompressText(Buffer.from(entry.raw_compressed));
          return stripRaw({ ...entry, raw_text: raw });
        }
        return stripRaw(entry);
      }

      return stripRaw({ ...entry, raw_text: null });
    },

    async searchEntries(options) {
      const query = buildSearchQuery(options, storeOptions.vectorEnabled);
      const result = await pool.query<EntryRecord>(query.text, query.values);
      return result.rows.map(stripRaw);
    },

    async deleteEntry(input) {
      const contextPk = await resolveContextPk(
        pool,
        input.namespace,
        input.context_id
      );
      if (!contextPk) return false;

      const result = await pool.query(
        "DELETE FROM entries WHERE id = $1 AND context_pk = $2",
        [input.entry_id, contextPk]
      );
      return (result.rowCount ?? 0) > 0;
    },

    async cleanupExpiredEntries() {
      const result = await pool.query(
        "DELETE FROM entries WHERE expires_at IS NOT NULL AND expires_at <= now()"
      );
      return result.rowCount ?? 0;
    }
  };
}

function buildUpdateSql(vectorEnabled: boolean): { text: string } {
  if (vectorEnabled) {
    return {
      text: `
        UPDATE entries SET
          entry_type = $1,
          title = $2,
          content = $3,
          tags = $4,
          importance = $5,
          created_by = $6,
          raw_text = $7,
          raw_compressed = $8,
          metadata = $9,
          expires_at = $10,
          embedding = $11
        WHERE id = $12 AND context_pk = $13
        RETURNING *
      `
    };
  }

  return {
    text: `
      UPDATE entries SET
        entry_type = $1,
        title = $2,
        content = $3,
        tags = $4,
        importance = $5,
        created_by = $6,
        raw_text = $7,
        raw_compressed = $8,
        metadata = $9,
        expires_at = $10
      WHERE id = $11 AND context_pk = $12
      RETURNING *
    `
  };
}

function buildInsertSql(vectorEnabled: boolean): { text: string } {
  if (vectorEnabled) {
    return {
      text: `
        INSERT INTO entries (
          id, context_pk, entry_type, title, content, tags, importance,
          created_by, raw_text, raw_compressed, metadata, expires_at, embedding
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *
      `
    };
  }

  return {
    text: `
      INSERT INTO entries (
        id, context_pk, entry_type, title, content, tags, importance,
        created_by, raw_text, raw_compressed, metadata, expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `
  };
}

function stripRaw(entry: EntryRecord): EntryRecord {
  const { raw_compressed, ...rest } = entry;
  return { ...rest, raw_text: entry.raw_text ?? null };
}

async function resolveContextPk(
  pool: pg.Pool,
  namespace: string,
  context_id: string
): Promise<string | null> {
  const result = await pool.query<{ id: string }>(
    "SELECT id FROM contexts WHERE namespace = $1 AND context_id = $2",
    [namespace, context_id]
  );
  if ((result.rowCount ?? 0) === 0) return null;
  return result.rows[0].id;
}

async function prepareRaw(
  rawText: string | null | undefined,
  storeOptions: StoreOptions
): Promise<{ rawText: string | null; rawCompressed: Buffer | null }> {
  if (!rawText) return { rawText: null, rawCompressed: null };
  if (storeOptions.storeRawPlaintext) {
    return { rawText, rawCompressed: null };
  }
  const compressed = await compressText(rawText);
  return { rawText: null, rawCompressed: compressed };
}
