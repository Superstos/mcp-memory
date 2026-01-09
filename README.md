# mcp-memory

Long-term memory MCP server backed by Postgres. This server stores only what agents send; compression is achieved by structured summaries, facts, decisions, and short snippets (not auto-summarized).

## Features
- MCP JSON-RPC over HTTP (`POST /mcp`)
- Postgres storage with full-text search (FTS)
- Optional pgvector semantic search
- Context aliases for stable shortcuts
- Latest-entry helpers for durable summaries
- TTL cleanup for expired entries
- Built-in memory instructions via `resources/read` and `prompts/get`
- API key auth, rate limiting, payload size limits

## Quick start
1) Create the database schema:
```
psql "$DATABASE_URL" -f migrations/001_init.sql
```

Aliases:
```
psql "$DATABASE_URL" -f migrations/003_context_aliases.sql
```
Or:
```
npm run db:aliases
```

Optional (semantic search):
```
psql "$DATABASE_URL" -f migrations/002_pgvector.sql
```

2) Configure env vars (see `.env.example`).

3) Install and run:
```
npm install
npm run build
npm start
```

## MCP endpoint
- `POST /mcp`: JSON-RPC 2.0 requests
- `GET /health`: health + vector status

## Tools
- `context_create`: create or update a namespace/context_id bucket
- `context_list`: list contexts
- `context_delete`: remove context and its entries
- `context_digest`: fetch a compact digest (latest summary + per-type entries)
- `context_alias_set`: create or update an alias
- `context_alias_list`: list aliases
- `context_alias_get`: resolve alias
- `context_alias_delete`: delete alias
- `entry_upsert`: insert/update an entry in a context
- `entry_latest_upsert`: insert/update the latest entry for a type
- `entry_latest_get`: fetch the latest entry for a type
- `entry_get`: fetch a single entry
- `entry_search`: search entries (FTS or vector)
- `entry_delete`: delete an entry

## Prompt/resource
- Resource URI: `memory://instructions`
- Prompt name: `memory_instructions`

## Policy controls
- `REQUIRE_TAGS`: reject entries without tags (default true)
- `AUTO_TAG`: auto-add `namespace:` and `context:` tags (default true)
- `ALLOW_RAW_TEXT`: allow `raw_text` payloads (default false)
- `FORCE_LATEST_SUMMARY`: force summaries into the latest summary entry (default true)
- `LATEST_ENTRY_PREFIX`: prefix used for latest entries (default `latest-`)
- `MAX_CONTENT_CHARS`: hard limit for content length (default 2000)
- `CLEANUP_INTERVAL_MS`: TTL cleanup interval (0 disables, default 0)

## Search modes
- `fts`: Postgres full-text search on title + content
- `vector`: pgvector similarity search (requires `embedding` + pgvector migration)
- `hybrid`: vector search with FTS filter if a query is provided

## Security & performance
- API key enforced via `Authorization: Bearer <key>` or `X-API-Key`
- Rate limiting and max body size to protect resources
- All SQL queries are parameterized
- Background cleanup removes expired entries (configurable)

## Testing
```
npm test
```

Tests are lightweight (validation and query builder). Integration tests can be added later with a real Postgres instance.
