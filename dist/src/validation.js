export class ValidationError extends Error {
    code = "validation_error";
}
const ENTRY_TYPES = new Set([
    "summary",
    "fact",
    "decision",
    "question",
    "note",
    "snippet",
    "todo"
]);
const SCOPES = new Set(["local", "shared"]);
export function normalizeNamespace(value) {
    return normalizeIdentifier(value, "namespace", 64);
}
export function normalizeContextId(value) {
    return normalizeIdentifier(value, "context_id", 128);
}
export function normalizeScope(value) {
    const scope = normalizeOptionalString(value, "scope", 16) ?? "shared";
    if (!SCOPES.has(scope)) {
        throw new ValidationError(`scope must be one of: ${[...SCOPES].join(", ")}`);
    }
    return scope;
}
export function normalizeEntryType(value) {
    const raw = normalizeOptionalString(value, "entry_type", 20) ?? "note";
    if (!ENTRY_TYPES.has(raw)) {
        throw new ValidationError(`entry_type must be one of: ${[...ENTRY_TYPES].join(", ")}`);
    }
    return raw;
}
export function normalizeImportance(value) {
    if (value === undefined || value === null || value === "")
        return 0;
    const num = Number(value);
    if (!Number.isFinite(num) || num < 0 || num > 100) {
        throw new ValidationError("importance must be between 0 and 100");
    }
    return Math.round(num);
}
export function normalizeTags(value, maxTags = 32, maxTagLength = 32) {
    if (value === undefined || value === null)
        return [];
    if (!Array.isArray(value)) {
        throw new ValidationError("tags must be an array of strings");
    }
    const cleaned = value
        .map((tag) => normalizeOptionalString(tag, "tag", maxTagLength))
        .filter((tag) => Boolean(tag));
    const unique = Array.from(new Set(cleaned));
    if (unique.length > maxTags) {
        throw new ValidationError(`tags cannot exceed ${maxTags} items`);
    }
    return unique;
}
export function normalizeOptionalString(value, field, maxLength) {
    if (value === undefined || value === null)
        return null;
    if (typeof value !== "string") {
        throw new ValidationError(`${field} must be a string`);
    }
    const trimmed = value.trim();
    if (!trimmed)
        return null;
    if (trimmed.length > maxLength) {
        throw new ValidationError(`${field} exceeds ${maxLength} characters`);
    }
    ensureNoControlChars(trimmed, field);
    return trimmed;
}
export function normalizeRequiredString(value, field, maxLength) {
    const normalized = normalizeOptionalString(value, field, maxLength);
    if (!normalized) {
        throw new ValidationError(`${field} is required`);
    }
    return normalized;
}
export function normalizeIdentifier(value, field, maxLength) {
    const normalized = normalizeRequiredString(value, field, maxLength);
    if (/\s/.test(normalized)) {
        throw new ValidationError(`${field} must not contain spaces`);
    }
    return normalized;
}
function ensureNoControlChars(value, field) {
    if (/[\u0000-\u001F]/.test(value)) {
        throw new ValidationError(`${field} contains control characters`);
    }
}
