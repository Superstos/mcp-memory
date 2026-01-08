import { normalizeNamespace, normalizeContextId, normalizeRequiredString, normalizeOptionalString, normalizeTags, normalizeEntryType, normalizeImportance, normalizeScope, ValidationError } from "./validation.js";
import { MEMORY_PROMPT } from "./prompt.js";
export function createMcpHandler(options) {
    const capabilities = {
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
                    namespace: { type: "string" },
                    context_id: { type: "string" }
                },
                required: ["namespace", "context_id"]
            }
        },
        {
            name: "entry_upsert",
            description: "Create or update an entry inside a context.",
            inputSchema: {
                type: "object",
                properties: {
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
                required: ["namespace", "context_id", "entry"]
            }
        },
        {
            name: "entry_get",
            description: "Fetch a single entry by id.",
            inputSchema: {
                type: "object",
                properties: {
                    namespace: { type: "string" },
                    context_id: { type: "string" },
                    entry_id: { type: "string" },
                    include_raw: { type: "boolean" }
                },
                required: ["namespace", "context_id", "entry_id"]
            }
        },
        {
            name: "entry_search",
            description: "Search entries within a context.",
            inputSchema: {
                type: "object",
                properties: {
                    namespace: { type: "string" },
                    context_id: { type: "string" },
                    query: { type: "string" },
                    tags: { type: "array", items: { type: "string" } },
                    types: { type: "array", items: { type: "string" } },
                    limit: { type: "number" },
                    include_expired: { type: "boolean" },
                    search_mode: { type: "string", enum: ["fts", "vector", "hybrid"] },
                    embedding: { type: "array", items: { type: "number" } }
                },
                required: ["namespace", "context_id"]
            }
        },
        {
            name: "entry_delete",
            description: "Delete an entry by id.",
            inputSchema: {
                type: "object",
                properties: {
                    namespace: { type: "string" },
                    context_id: { type: "string" },
                    entry_id: { type: "string" }
                },
                required: ["namespace", "context_id", "entry_id"]
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
    async function handleToolCall(name, args) {
        const params = asObject(args);
        switch (name) {
            case "context_create": {
                const namespace = normalizeNamespace(params.namespace);
                const contextId = normalizeContextId(params.context_id);
                const description = normalizeOptionalString(params.description, "description", 500);
                const tags = params.tags === undefined ? null : normalizeTags(params.tags);
                const scope = params.scope === undefined ? null : normalizeScope(params.scope);
                const owner = normalizeOptionalString(params.owner, "owner", 120);
                const metadata = params.metadata === undefined ? null : normalizeMetadata(params.metadata);
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
                const namespace = normalizeOptionalString(params.namespace, "namespace", 64);
                const scope = normalizeOptionalString(params.scope, "scope", 16);
                const owner = normalizeOptionalString(params.owner, "owner", 120);
                const limit = normalizeLimit(params.limit, 200);
                const contexts = await options.store.listContexts({
                    namespace,
                    scope,
                    owner,
                    limit
                });
                return toolResult(contexts);
            }
            case "context_delete": {
                const namespace = normalizeNamespace(params.namespace);
                const contextId = normalizeContextId(params.context_id);
                const deleted = await options.store.deleteContext({
                    namespace,
                    context_id: contextId
                });
                return toolResult({ deleted });
            }
            case "entry_upsert": {
                const namespace = normalizeNamespace(params.namespace);
                const contextId = normalizeContextId(params.context_id);
                const entryParams = asObject(params.entry);
                const entry = {
                    entry_id: normalizeOptionalString(entryParams.entry_id, "entry_id", 64) ??
                        undefined,
                    entry_type: normalizeEntryType(entryParams.entry_type),
                    title: normalizeOptionalString(entryParams.title, "title", 200),
                    content: normalizeRequiredString(entryParams.content, "content", 20000),
                    tags: normalizeTags(entryParams.tags),
                    importance: normalizeImportance(entryParams.importance),
                    created_by: normalizeOptionalString(entryParams.created_by, "created_by", 120),
                    expires_at: normalizeOptionalString(entryParams.expires_at, "expires_at", 64),
                    raw_text: normalizeOptionalString(entryParams.raw_text, "raw_text", 20000),
                    embedding: normalizeEmbedding(entryParams.embedding),
                    metadata: normalizeMetadata(entryParams.metadata)
                };
                if (entry.embedding && !options.vectorEnabled) {
                    throw new ValidationError("embedding provided but pgvector is not enabled on this server");
                }
                const result = await options.store.upsertEntry({
                    namespace,
                    context_id: contextId,
                    entry
                });
                return toolResult(result);
            }
            case "entry_get": {
                const namespace = normalizeNamespace(params.namespace);
                const contextId = normalizeContextId(params.context_id);
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
                const namespace = normalizeNamespace(params.namespace);
                const contextId = normalizeContextId(params.context_id);
                const query = normalizeOptionalString(params.query, "query", 400);
                const tags = normalizeTags(params.tags);
                const types = normalizeEntryTypes(params.types);
                const limit = normalizeLimit(params.limit, 100);
                const includeExpired = Boolean(params.include_expired);
                const searchMode = normalizeSearchMode(params.search_mode);
                const embedding = normalizeEmbedding(params.embedding);
                if ((searchMode === "vector" || searchMode === "hybrid") && !embedding) {
                    throw new ValidationError("embedding is required for vector or hybrid search");
                }
                if ((searchMode === "vector" || searchMode === "hybrid") &&
                    !options.vectorEnabled) {
                    throw new ValidationError("vector search requested but pgvector is not enabled");
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
                const namespace = normalizeNamespace(params.namespace);
                const contextId = normalizeContextId(params.context_id);
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
    async function handleRpcRequest(request) {
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
        }
        catch (err) {
            if (err instanceof ValidationError) {
                return errorResponse(request.id ?? null, -32602, err.message);
            }
            const message = err instanceof Error ? err.message : "Internal error";
            return errorResponse(request.id ?? null, -32000, message);
        }
    }
    async function handleJsonRpc(payload) {
        if (Array.isArray(payload)) {
            const responses = await Promise.all(payload.map((request) => handleRpcRequest(request)));
            const filtered = responses.filter(Boolean);
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
function normalizeLimit(value, max) {
    if (value === undefined || value === null)
        return undefined;
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) {
        throw new ValidationError("limit must be a positive number");
    }
    return Math.min(Math.floor(num), max);
}
function normalizeSearchMode(value) {
    if (value === undefined || value === null)
        return "fts";
    if (value === "fts" || value === "vector" || value === "hybrid") {
        return value;
    }
    throw new ValidationError("search_mode must be fts, vector, or hybrid");
}
function normalizeEmbedding(value) {
    if (value === undefined || value === null)
        return null;
    if (!Array.isArray(value)) {
        throw new ValidationError("embedding must be an array of numbers");
    }
    if (value.length === 0)
        return null;
    const vector = value.map((item) => Number(item));
    if (vector.some((item) => !Number.isFinite(item))) {
        throw new ValidationError("embedding must contain only numbers");
    }
    if (vector.length > 4096) {
        throw new ValidationError("embedding is too large");
    }
    return vector;
}
function normalizeMetadata(value) {
    if (value === undefined || value === null)
        return {};
    if (typeof value !== "object" || Array.isArray(value)) {
        throw new ValidationError("metadata must be an object");
    }
    return value;
}
function normalizeEntryTypes(value) {
    if (value === undefined || value === null)
        return [];
    if (!Array.isArray(value)) {
        throw new ValidationError("types must be an array of strings");
    }
    const cleaned = value
        .map((item) => normalizeOptionalString(item, "type", 20))
        .filter((item) => Boolean(item));
    const normalized = cleaned.map((item) => normalizeEntryType(item));
    return Array.from(new Set(normalized));
}
function asObject(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new ValidationError("arguments must be an object");
    }
    return value;
}
function toolResult(data) {
    return {
        content: [
            {
                type: "text",
                text: JSON.stringify(data, null, 2)
            }
        ]
    };
}
function errorResponse(id, code, message, data) {
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
