import test from "node:test";
import assert from "node:assert/strict";
import { createMcpHandler } from "../src/mcp.js";
import { MemoryStore } from "../src/store.js";
import { ContextRecord, ContextAliasRecord, EntryRecord, SearchOptions } from "../src/types.js";

function makeEntry(overrides: Partial<EntryRecord>): EntryRecord {
  const now = new Date(0).toISOString();
  return {
    id: "entry",
    context_pk: "ctx",
    entry_type: "note",
    title: null,
    content: "content",
    tags: [],
    importance: 0,
    created_by: null,
    raw_text: null,
    metadata: {},
    expires_at: null,
    created_at: now,
    updated_at: now,
    ...overrides
  };
}

function createStoreStub(input: {
  latestSummary?: EntryRecord | null;
  entriesByType?: Record<string, EntryRecord[]>;
}): MemoryStore {
  const latestSummary = input.latestSummary ?? null;
  const entriesByType = input.entriesByType ?? {};
  const context: ContextRecord = {
    id: "ctx",
    namespace: "repo",
    context_id: "app",
    description: null,
    tags: [],
    scope: "shared",
    owner: null,
    metadata: {},
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString()
  };
  const alias: ContextAliasRecord = {
    alias: "alias",
    namespace: "repo",
    context_id: "app",
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString()
  };

  return {
    async createContext() {
      return context;
    },
    async listContexts() {
      return [context];
    },
    async deleteContext() {
      return false;
    },
    async setContextAlias() {
      return alias;
    },
    async listContextAliases() {
      return [alias];
    },
    async deleteContextAlias() {
      return false;
    },
    async resolveContextAlias() {
      return null;
    },
    async upsertEntry(inputEntry) {
      return makeEntry({
        id: inputEntry.entry.entry_id ?? "upserted",
        entry_type: inputEntry.entry.entry_type,
        content: inputEntry.entry.content
      });
    },
    async getEntry(inputEntry) {
      if (inputEntry.entry_id === "latest-summary") {
        return latestSummary;
      }
      for (const entries of Object.values(entriesByType)) {
        const match = entries.find((entry) => entry.id === inputEntry.entry_id);
        if (match) return match;
      }
      return null;
    },
    async searchEntries(options: SearchOptions) {
      const types = options.types ?? [];
      let results: EntryRecord[] = [];
      for (const type of types) {
        results = results.concat(entriesByType[type] ?? []);
      }
      const limit = options.limit ?? results.length;
      return results.slice(0, limit);
    },
    async deleteEntry() {
      return false;
    },
    async cleanupExpiredEntries() {
      return 0;
    }
  };
}

function createHandler(store: MemoryStore) {
  return createMcpHandler({
    store,
    serverInfo: { name: "test", version: "0.0.0" },
    vectorEnabled: false,
    policy: {
      requireTags: false,
      autoTag: false,
      allowRawText: true,
      forceLatestSummary: true,
      latestEntryPrefix: "latest-",
      maxContentChars: 2000
    }
  });
}

async function callTool(handler: ReturnType<typeof createMcpHandler>, name: string, args: any) {
  const response = await handler.handleJsonRpc({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name, arguments: args }
  });
  const result = (response as any).result;
  const text = result.content[0].text;
  return JSON.parse(text);
}

test("context_digest returns summary and per-type entries", async () => {
  const summary = makeEntry({
    id: "latest-summary",
    entry_type: "summary",
    content: "Latest summary"
  });
  const decision = makeEntry({
    id: "dec-1",
    entry_type: "decision",
    content: "Decision"
  });
  const question = makeEntry({
    id: "q-1",
    entry_type: "question",
    content: "Question"
  });

  const store = createStoreStub({
    latestSummary: summary,
    entriesByType: {
      decision: [decision],
      question: [question]
    }
  });
  const handler = createHandler(store);
  const digest = await callTool(handler, "context_digest", {
    namespace: "repo",
    context_id: "app",
    types: ["summary", "decision", "question"],
    limit: 2
  });

  assert.equal(digest.namespace, "repo");
  assert.equal(digest.context_id, "app");
  assert.equal(digest.summary.id, "latest-summary");
  assert.equal(digest.entries.decision.length, 1);
  assert.equal(digest.entries.question[0].id, "q-1");
});

test("context_digest falls back to most recent summary when latest is missing", async () => {
  const fallbackSummary = makeEntry({
    id: "summary-legacy",
    entry_type: "summary",
    content: "Legacy summary"
  });

  const store = createStoreStub({
    latestSummary: null,
    entriesByType: {
      summary: [fallbackSummary]
    }
  });
  const handler = createHandler(store);
  const digest = await callTool(handler, "context_digest", {
    namespace: "repo",
    context_id: "app",
    types: ["summary"]
  });

  assert.equal(digest.summary.id, "summary-legacy");
});
