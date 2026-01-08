import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeNamespace,
  normalizeContextId,
  normalizeEntryType,
  normalizeTags,
  normalizeImportance,
  ValidationError
} from "../src/validation.js";

test("normalizeNamespace accepts valid values", () => {
  assert.equal(normalizeNamespace("repo.main"), "repo.main");
});

test("normalizeNamespace rejects spaces", () => {
  assert.throws(() => normalizeNamespace("bad namespace"), ValidationError);
});

test("normalizeContextId enforces length", () => {
  assert.throws(() => normalizeContextId("a".repeat(200)), ValidationError);
});

test("normalizeEntryType defaults to note", () => {
  assert.equal(normalizeEntryType(undefined), "note");
});

test("normalizeTags de-duplicates", () => {
  const tags = normalizeTags(["alpha", "alpha", "beta"]);
  assert.deepEqual(tags, ["alpha", "beta"]);
});

test("normalizeImportance bounds", () => {
  assert.equal(normalizeImportance(42.7), 43);
  assert.throws(() => normalizeImportance(200), ValidationError);
});
