import { MemoryStore } from "./store.js";
import {
  normalizeAlias,
  normalizeNamespace,
  normalizeContextId,
  normalizeRequiredString,
  normalizeOptionalString,
  normalizeTags,
  normalizeEntryType,
  normalizeImportance,
  normalizeScope,
  ValidationError
} from "./validation.js";
import { MEMORY_PROMPT } from "./prompt.js";

export interface McpServerInfo {
  name: string;
  version: string;
}

export interface McpCapabilities {
  tools: { listChanged: boolean };
  resources: { subscribe: boolean; listChanged: boolean };
  prompts: { listChanged: boolean };
}

export interface McpHandlerOptions {
  store: MemoryStore;
  serverInfo: McpServerInfo;
  vectorEnabled: boolean;
  policy: {
    requireTags: boolean;
    autoTag: boolean;
    allowRawText: boolean;
    forceLatestSummary: boolean;
    latestEntryPrefix: string;
    maxContentChars: number;
  };
}

type RpcRequest = {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: unknown;
};

type RpcResponse = {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

export function createMcpHandler(options: McpHandlerOptions) {
  const capabilities: McpCapabilities = {
    tools: { listChanged: false },
    resources: { subscribe: false, listChanged: false },
    prompts: { listChanged: false }
  };

  const tools = [
    {
      name: "context_create",
      description: "Create or update a context bucket.",
      inputSchema: {
        type: "object",
        properties: {
          namespace: { type: "string" },
          context_id: { type: "string" },
          description: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
          scope: { type: "string", enum: ["local", "shared"] },
          owner: { type: "string" },
          metadata: { type: "object" }
        },
        required: ["namespace", "context_id"]
      }
    },
    {
      name: "context_list",
      description: "List stored contexts.",
      inputSchema: {
        type: "object",
        properties: {
          namespace: { type: "string" },
          scope: { type: "string", enum: ["local", "shared"] },
          owner: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
          limit: { type: "number" }
        }
      }
    },
    {
      name: "context_delete",
      description: "Delete a context and its entries.",
      inputSchema: {
        type: "object",
        properties: {
          alias: { type: "string" },
          namespace: { type: "string" },
          context_id: { type: "string" }
        }
      }
    },
    {
      name: "context_alias_set",
      description: "Create or update a context alias.",
      inputSchema: {
        type: "object",
        properties: {
          alias: { type: "string" },
          namespace: { type: "string" },
          context_id: { type: "string" }
        },
        required: ["alias", "namespace", "context_id"]
      }
    },
    {
      name: "context_alias_list",
      description: "List context aliases.",
      inputSchema: {
        type: "object",
        properties: {
          namespace: { type: "string" },
          context_id: { type: "string" },
          limit: { type: "number" }
        }
      }
    },
    {
      name: "context_alias_get",
      description: "Resolve an alias to its namespace/context_id.",
      inputSchema: {
        type: "object",
        properties: {
          alias: { type: "string" }
        },
        required: ["alias"]
      }
    },
    {
      name: "context_alias_delete",
      description: "Delete a context alias.",
      inputSchema: {
        type: "object",
        properties: {
          alias: { type: "string" }
        },
        required: ["alias"]
      }
    },
    {
      name: "entry_upsert",
      description: "Create or update an entry inside a context.",
      inputSchema: {
        type: "object",
        properties: {
          alias: { type: "string" },
          namespace: { type: "string" },
          context_id: { type: "string" },
          entry: {
            type: "object",
            properties: {
              entry_id: { type: "string" },
              entry_type: {
                type: "string",
                enum: [
                  "summary",
                  "fact",
                  "decision",
                  "question",
                  "note",
                  "snippet",
                  "todo"
                ]
              },
              title: { type: "string" },
              content: { type: "string" },
              tags: { type: "array", items: { type: "string" } },
              importance: { type: "number" },
              created_by: { type: "string" },
              expires_at: { type: "string" },
              raw_text: { type: "string" },
              embedding: { type: "array", items: { type: "number" } },
              metadata: { type: "object" }
            },
            required: ["entry_type", "content"]
          }
        },
        required: ["entry"]
      }
    },
    {
      name: "entry_latest_upsert",
      description: "Upsert a latest entry for a given entry type.",
      inputSchema: {
        type: "object",
        properties: {
          alias: { type: "string" },
          namespace: { type: "string" },
          context_id: { type: "string" },
          entry: {
            type: "object",
            properties: {
              entry_id: { type: "string" },
              entry_type: {
                type: "string",
                enum: [
                  "summary",
                  "fact",
                  "decision",
                  "question",
                  "note",
                  "snippet",
                  "todo"
                ]
              },
              title: { type: "string" },
              content: { type: "string" },
              tags: { type: "array", items: { type: "string" } },
              importance: { type: "number" },
              created_by: { type: "string" },
              expires_at: { type: "string" },
              raw_text: { type: "string" },
              embedding: { type: "array", items: { type: "number" } },
              metadata: { type: "object" }
            },
            required: ["entry_type", "content"]
          }
        },
        required: ["entry"]
      }
    },
    {
      name: "entry_latest_get",
      description: "Get the latest entry for a given entry type.",
      inputSchema: {
        type: "object",
        properties: {
          alias: { type: "string" },
          namespace: { type: "string" },
          context_id: { type: "string" },
          entry_type: {
            type: "string",
            enum: [
              "summary",
              "fact",
              "decision",
              "question",
              "note",
              "snippet",
              "todo"
            ]
          },
          include_raw: { type: "boolean" }
        },
        required: ["entry_type"]
      }
    },
    {
      name: "entry_get",
      description: "Fetch a single entry by id.",
      inputSchema: {
        type: "object",
        properties: {
          alias: { type: "string" },
          namespace: { type: "string" },
          context_id: { type: "string" },
          entry_id: { type: "string" },
          include_raw: { type: "boolean" }
        },
        required: ["entry_id"]
      }
    },
    {
      name: "entry_search",
      description: "Search entries within a context.",
      inputSchema: {
        type: "object",
        properties: {
          alias: { type: "string" },
          namespace: { type: "string" },
          context_id: { type: "string" },
          query: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
          types: { type: "array", items: { type: "string" } },
          limit: { type: "number" },
          include_expired: { type: "boolean" },
          search_mode: { type: "string", enum: ["fts", "vector", "hybrid"] },
          embedding: { type: "array", items: { type: "number" } }
        }
      }
    },
    {
      name: "entry_delete",
      description: "Delete an entry by id.",
      inputSchema: {
        type: "object",
        properties: {
          alias: { type: "string" },
          namespace: { type: "string" },
          context_id: { type: "string" },
          entry_id: { type: "string" }
        },
        required: ["entry_id"]
      }
    }
  ];

  const resources = [
    {
      uri: "memory://instructions",
      name: "Memory Instructions",
      description: "How to store compressed memory entries.",
      mimeType: "text/plain"
    }
  ];

  const prompts = [
    {
      name: "memory_instructions",
      description: "Guidance for compressing and storing memory entries.",
      arguments: []
    }
  ];

  const latestEntryId = (entryType: string) =>
    `${options.policy.latestEntryPrefix}${entryType}`;

  async function resolveContextParams(params: Record<string, unknown>) {
    const hasAlias = params.alias !== undefined && params.alias !== null;
    const hasNamespace = params.namespace !== undefined && params.namespace !== null;
    const hasContextId = params.context_id !== undefined && params.context_id !== null;

    if (hasAlias) {
      if (hasNamespace || hasContextId) {
        throw new ValidationError(
          "provide alias or namespace/context_id, not both"
        );
      }
      const alias = normalizeAlias(params.alias);
      const resolved = await options.store.resolveContextAlias(alias);
      if (!resolved) {
        throw new ValidationError(`alias not found: ${alias}`);
      }
      return { namespace: resolved.namespace, contextId: resolved.context_id };
    }

    if (!hasNamespace || !hasContextId) {
      throw new ValidationError("namespace and context_id are required");
    }

    return {
      namespace: normalizeNamespace(params.namespace),
      contextId: normalizeContextId(params.context_id)
    };
  }

  function applyTagPolicy(
    tags: string[],
    namespace: string,
    contextId: string,
    warnings: string[]
  ): string[] {
    let updated = [...tags];
    const baseTags = [`namespace:${namespace}`, `context:${contextId}`];

    if (options.policy.autoTag) {
      const before = new Set(updated);
      for (const tag of baseTags) {
        before.add(tag);
      }
      updated = Array.from(before);
      if (updated.length !== tags.length) {
        warnings.push(`auto-tagged: ${baseTags.join(", ")}`);
      }
    }

    const normalized = normalizeTags(updated, 64, 160);

    if (options.policy.requireTags && normalized.length === 0) {
      throw new ValidationError("tags are required");
    }

    return normalized;
  }

  async function handleToolCall(name: string, args: unknown) {
    const params = asObject(args);
    switch (name) {
      case "context_create": {
        const namespace = normalizeNamespace(params.namespace);
        const contextId = normalizeContextId(params.context_id);
        const description = normalizeOptionalString(
          params.description,
          "description",
          500
        );
        const tags = params.tags === undefined ? null : normalizeTags(params.tags);
        const scope = params.scope === undefined ? null : normalizeScope(params.scope);
        const owner = normalizeOptionalString(params.owner, "owner", 120);
        const metadata =
          params.metadata === undefined ? null : normalizeMetadata(params.metadata);
        const context = await options.store.createContext({
          namespace,
          context_id: contextId,
          description,
          tags,
          scope,
          owner,
          metadata
        });
        return toolResult(context);
      }
      case "context_list": {
        const namespace = normalizeOptionalString(
          params.namespace,
          "namespace",
          64
        );
        const scope = normalizeOptionalString(params.scope, "scope", 16);
        const owner = normalizeOptionalString(params.owner, "owner", 120);
        const tags =
          params.tags === undefined ? null : normalizeTags(params.tags, 64, 160);
        const limit = normalizeLimit(params.limit, 200);
        const contexts = await options.store.listContexts({
          namespace,
          scope,
          owner,
          tags,
          limit
        });
        return toolResult(contexts);
      }
      case "context_delete": {
        const { namespace, contextId } = await resolveContextParams(params);
        const deleted = await options.store.deleteContext({
          namespace,
          context_id: contextId
        });
        return toolResult({ deleted });
      }
      case "context_alias_set": {
        const alias = normalizeAlias(params.alias);
        const namespace = normalizeNamespace(params.namespace);
        const contextId = normalizeContextId(params.context_id);
        const result = await options.store.setContextAlias({
          alias,
          namespace,
          context_id: contextId
        });
        return toolResult(result);
      }
      case "context_alias_list": {
        const namespace = normalizeOptionalString(
          params.namespace,
          "namespace",
          64
        );
        const contextId = normalizeOptionalString(
          params.context_id,
          "context_id",
          128
        );
        const limit = normalizeLimit(params.limit, 200);
        const aliases = await options.store.listContextAliases({
          namespace,
          context_id: contextId,
          limit
        });
        return toolResult(aliases);
      }
      case "context_alias_get": {
        const alias = normalizeAlias(params.alias);
        const result = await options.store.resolveContextAlias(alias);
        return toolResult(result ?? { found: false });
      }
      case "context_alias_delete": {
        const alias = normalizeAlias(params.alias);
        const deleted = await options.store.deleteContextAlias({ alias });
        return toolResult({ deleted });
      }
      case "entry_upsert": {
        const { namespace, contextId } = await resolveContextParams(params);
        const entryParams = asObject(params.entry);
        const warnings: string[] = [];

        if (entryParams.raw_text && !options.policy.allowRawText) {
          throw new ValidationError("raw_text is disabled on this server");
        }

        const entryType = normalizeEntryType(
          normalizeRequiredString(entryParams.entry_type, "entry_type", 20)
        );

        const entry = {
          entry_id: normalizeOptionalString(entryParams.entry_id, "entry_id", 64) ?? undefined,
          entry_type: entryType,
          title: normalizeOptionalString(entryParams.title, "title", 200),
          content: normalizeRequiredString(
            entryParams.content,
            "content",
            options.policy.maxContentChars
          ),
          tags: normalizeTags(entryParams.tags, 64, 160),
          importance: normalizeImportance(entryParams.importance),
          created_by: normalizeOptionalString(entryParams.created_by, "created_by", 120),
          expires_at: normalizeOptionalString(entryParams.expires_at, "expires_at", 64),
          raw_text: normalizeOptionalString(entryParams.raw_text, "raw_text", 20000),
          embedding: normalizeEmbedding(entryParams.embedding),
          metadata: normalizeMetadata(entryParams.metadata)
        };

        entry.tags = applyTagPolicy(entry.tags, namespace, contextId, warnings);

        if (entry.content.length > options.policy.maxContentChars * 0.8) {
          warnings.push("content length is near the limit; consider compressing further");
        }
        if (entry.raw_text) {
          warnings.push("raw_text stored; prefer compressed summaries when possible");
        }

        if (options.policy.forceLatestSummary && entry.entry_type === "summary") {
          const forcedId = latestEntryId(entry.entry_type);
          if (entry.entry_id && entry.entry_id !== forcedId) {
            warnings.push(`entry_id overridden to ${forcedId}`);
          }
          entry.entry_id = forcedId;
        }

        if (entry.embedding && !options.vectorEnabled) {
          throw new ValidationError(
            "embedding provided but pgvector is not enabled on this server"
          );
        }

        const result = await options.store.upsertEntry({
          namespace,
          context_id: contextId,
          entry
        });
        return toolResult(result, warnings);
      }
      case "entry_latest_upsert": {
        const { namespace, contextId } = await resolveContextParams(params);
        const entryParams = asObject(params.entry);
        const warnings: string[] = [];

        if (entryParams.raw_text && !options.policy.allowRawText) {
          throw new ValidationError("raw_text is disabled on this server");
        }

        const entryType = normalizeEntryType(
          normalizeRequiredString(entryParams.entry_type, "entry_type", 20)
        );
        const forcedId = latestEntryId(entryType);
        const providedId =
          normalizeOptionalString(entryParams.entry_id, "entry_id", 64) ?? undefined;
        if (providedId && providedId !== forcedId) {
          warnings.push(`entry_id overridden to ${forcedId}`);
        }

        const entry = {
          entry_id: forcedId,
          entry_type: entryType,
          title: normalizeOptionalString(entryParams.title, "title", 200),
          content: normalizeRequiredString(
            entryParams.content,
            "content",
            options.policy.maxContentChars
          ),
          tags: normalizeTags(entryParams.tags, 64, 160),
          importance: normalizeImportance(entryParams.importance),
          created_by: normalizeOptionalString(entryParams.created_by, "created_by", 120),
          expires_at: normalizeOptionalString(entryParams.expires_at, "expires_at", 64),
          raw_text: normalizeOptionalString(entryParams.raw_text, "raw_text", 20000),
          embedding: normalizeEmbedding(entryParams.embedding),
          metadata: normalizeMetadata(entryParams.metadata)
        };

        entry.tags = applyTagPolicy(entry.tags, namespace, contextId, warnings);

        if (entry.content.length > options.policy.maxContentChars * 0.8) {
          warnings.push("content length is near the limit; consider compressing further");
        }
        if (entry.raw_text) {
          warnings.push("raw_text stored; prefer compressed summaries when possible");
        }

        if (entry.embedding && !options.vectorEnabled) {
          throw new ValidationError(
            "embedding provided but pgvector is not enabled on this server"
          );
        }

        const result = await options.store.upsertEntry({
          namespace,
          context_id: contextId,
          entry
        });
        return toolResult(result, warnings);
      }
      case "entry_latest_get": {
        const { namespace, contextId } = await resolveContextParams(params);
        const entryType = normalizeEntryType(
          normalizeRequiredString(params.entry_type, "entry_type", 20)
        );
        const includeRaw = Boolean(params.include_raw);
        const entryId = latestEntryId(entryType);
        const entry = await options.store.getEntry({
          namespace,
          context_id: contextId,
          entry_id: entryId,
          include_raw: includeRaw
        });
        return toolResult(entry ?? { found: false });
      }
      case "entry_get": {
        const { namespace, contextId } = await resolveContextParams(params);
        const entryId = normalizeRequiredString(params.entry_id, "entry_id", 64);
        const includeRaw = Boolean(params.include_raw);
        const entry = await options.store.getEntry({
          namespace,
          context_id: contextId,
          entry_id: entryId,
          include_raw: includeRaw
        });
        return toolResult(entry ?? { found: false });
      }
      case "entry_search": {
        const { namespace, contextId } = await resolveContextParams(params);
        const query = normalizeOptionalString(params.query, "query", 400);
        const tags = normalizeTags(params.tags, 64, 160);
        const types = normalizeEntryTypes(params.types);
        const limit = normalizeLimit(params.limit, 100);
        const includeExpired = Boolean(params.include_expired);
        const searchMode = normalizeSearchMode(params.search_mode);
        const embedding = normalizeEmbedding(params.embedding);

        if ((searchMode === "vector" || searchMode === "hybrid") && !embedding) {
          throw new ValidationError(
            "embedding is required for vector or hybrid search"
          );
        }
        if (
          (searchMode === "vector" || searchMode === "hybrid") &&
          !options.vectorEnabled
        ) {
          throw new ValidationError(
            "vector search requested but pgvector is not enabled"
          );
        }

        const entries = await options.store.searchEntries({
          namespace,
          context_id: contextId,
          query,
          tags,
          types,
          limit,
          includeExpired,
          searchMode,
          embedding
        });
        return toolResult(entries);
      }
      case "entry_delete": {
        const { namespace, contextId } = await resolveContextParams(params);
        const entryId = normalizeRequiredString(params.entry_id, "entry_id", 64);
        const deleted = await options.store.deleteEntry({
          namespace,
          context_id: contextId,
          entry_id: entryId
        });
        return toolResult({ deleted });
      }
      default:
        throw new ValidationError(`unknown tool: ${name}`);
    }
  }

  async function handleRpcRequest(request: RpcRequest): Promise<RpcResponse | null> {
    if (!request || request.jsonrpc !== "2.0" || !request.method) {
      return errorResponse(request?.id ?? null, -32600, "Invalid Request");
    }

    if (request.method === "notifications/initialized") {
      return null;
    }

    try {
      switch (request.method) {
        case "initialize":
          return {
            jsonrpc: "2.0",
            id: request.id ?? null,
            result: {
              protocolVersion: "2024-11-05",
              capabilities,
              serverInfo: options.serverInfo
            }
          };
        case "tools/list":
          return {
            jsonrpc: "2.0",
            id: request.id ?? null,
            result: { tools }
          };
        case "tools/call": {
          const params = asObject(request.params);
          const name = normalizeRequiredString(params.name, "name", 120);
          const args = params.arguments ?? {};
          const result = await handleToolCall(name, args);
          return {
            jsonrpc: "2.0",
            id: request.id ?? null,
            result
          };
        }
        case "resources/list":
          return {
            jsonrpc: "2.0",
            id: request.id ?? null,
            result: { resources }
          };
        case "resources/read": {
          const params = asObject(request.params);
          const uri = normalizeRequiredString(params.uri, "uri", 200);
          if (uri !== "memory://instructions") {
            return errorResponse(request.id ?? null, -32602, "Unknown resource");
          }
          return {
            jsonrpc: "2.0",
            id: request.id ?? null,
            result: {
              contents: [
                {
                  uri,
                  mimeType: "text/plain",
                  text: MEMORY_PROMPT
                }
              ]
            }
          };
        }
        case "prompts/list":
          return {
            jsonrpc: "2.0",
            id: request.id ?? null,
            result: { prompts }
          };
        case "prompts/get": {
          const params = asObject(request.params);
          const name = normalizeRequiredString(params.name, "name", 120);
          if (name !== "memory_instructions") {
            return errorResponse(request.id ?? null, -32602, "Unknown prompt");
          }
          return {
            jsonrpc: "2.0",
            id: request.id ?? null,
            result: {
              messages: [
                {
                  role: "system",
                  content: {
                    type: "text",
                    text: MEMORY_PROMPT
                  }
                }
              ]
            }
          };
        }
        default:
          return errorResponse(request.id ?? null, -32601, "Method not found");
      }
    } catch (err) {
      if (err instanceof ValidationError) {
        return errorResponse(request.id ?? null, -32602, err.message);
      }
      const message = err instanceof Error ? err.message : "Internal error";
      return errorResponse(request.id ?? null, -32000, message);
    }
  }

  async function handleJsonRpc(
    payload: RpcRequest | RpcRequest[]
  ): Promise<RpcResponse | RpcResponse[] | null> {
    if (Array.isArray(payload)) {
      const responses = await Promise.all(
        payload.map((request) => handleRpcRequest(request))
      );
      const filtered = responses.filter(Boolean) as RpcResponse[];
      return filtered.length > 0 ? filtered : null;
    }
    return handleRpcRequest(payload);
  }

  return {
    tools,
    resources,
    prompts,
    handleJsonRpc
  };
}

function normalizeLimit(value: unknown, max: number): number | undefined {
  if (value === undefined || value === null) return undefined;
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) {
    throw new ValidationError("limit must be a positive number");
  }
  return Math.min(Math.floor(num), max);
}

function normalizeSearchMode(value: unknown): "fts" | "vector" | "hybrid" {
  if (value === undefined || value === null) return "fts";
  if (value === "fts" || value === "vector" || value === "hybrid") {
    return value;
  }
  throw new ValidationError("search_mode must be fts, vector, or hybrid");
}

function normalizeEmbedding(value: unknown): number[] | null {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value)) {
    throw new ValidationError("embedding must be an array of numbers");
  }
  if (value.length === 0) return null;
  const vector = value.map((item) => Number(item));
  if (vector.some((item) => !Number.isFinite(item))) {
    throw new ValidationError("embedding must contain only numbers");
  }
  if (vector.length > 4096) {
    throw new ValidationError("embedding is too large");
  }
  return vector;
}

function normalizeMetadata(value: unknown): Record<string, unknown> {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new ValidationError("metadata must be an object");
  }
  return value as Record<string, unknown>;
}

function normalizeEntryTypes(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new ValidationError("types must be an array of strings");
  }
  const cleaned = value
    .map((item) => normalizeOptionalString(item, "type", 20))
    .filter((item): item is string => Boolean(item));
  const normalized = cleaned.map((item) => normalizeEntryType(item));
  return Array.from(new Set(normalized));
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ValidationError("arguments must be an object");
  }
  return value as Record<string, unknown>;
}

function toolResult(data: unknown, warnings?: string[]) {
  const content = [
    {
      type: "text",
      text: JSON.stringify(data, null, 2)
    }
  ];

  if (warnings && warnings.length > 0) {
    content.push({
      type: "text",
      text: `warnings:\n- ${warnings.join("\n- ")}`
    });
  }

  return { content };
}

function errorResponse(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown
): RpcResponse {
  return {
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message,
      data
    }
  };
}
