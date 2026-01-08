import test from "node:test";
import assert from "node:assert/strict";
import { buildSearchQuery } from "../src/query.js";
test("buildSearchQuery builds parameters", () => {
    const query = buildSearchQuery({
        namespace: "repo",
        context_id: "vps",
        query: "memory",
        tags: ["mcp"],
        types: ["summary"],
        limit: 10
    }, false);
    assert.ok(query.text.includes("FROM entries"));
    assert.ok(query.values.length >= 5);
});
test("buildSearchQuery uses vector ordering when enabled", () => {
    const query = buildSearchQuery({
        namespace: "repo",
        context_id: "vps",
        searchMode: "vector",
        embedding: [0.1, 0.2, 0.3]
    }, true);
    assert.ok(query.text.includes("embedding <->"));
});
