import { SearchOptions } from "./types.js";

export interface SearchQuery {
  text: string;
  values: unknown[];
}

export function buildSearchQuery(
  options: SearchOptions,
  vectorEnabled: boolean
): SearchQuery {
  const values: unknown[] = [];
  const where: string[] = [];
  let queryParamIndex: number | null = null;

  values.push(options.namespace);
  where.push(`c.namespace = $${values.length}`);

  values.push(options.context_id);
  where.push(`c.context_id = $${values.length}`);

  if (!options.includeExpired) {
    where.push("(e.expires_at IS NULL OR e.expires_at > now())");
  }

  if (options.tags && options.tags.length > 0) {
    values.push(options.tags);
    where.push(`e.tags && $${values.length}`);
  }

  if (options.types && options.types.length > 0) {
    values.push(options.types);
    where.push(`e.entry_type = ANY($${values.length})`);
  }

  const queryText = options.query?.trim();
  if (queryText) {
    values.push(queryText);
    queryParamIndex = values.length;
    where.push(
      `to_tsvector('english', coalesce(e.title, '') || ' ' || e.content) @@ websearch_to_tsquery('english', $${queryParamIndex})`
    );
  }

  const mode = options.searchMode ?? "fts";
  const useVector =
    vectorEnabled &&
    (mode === "vector" || mode === "hybrid") &&
    options.embedding &&
    options.embedding.length > 0;

  let orderBy = "e.importance DESC, e.created_at DESC";
  if (useVector) {
    values.push(options.embedding);
    orderBy = `e.embedding <-> $${values.length} ASC, e.importance DESC, e.created_at DESC`;
  } else if (queryText && queryParamIndex) {
    orderBy = `ts_rank_cd(to_tsvector('english', coalesce(e.title, '') || ' ' || e.content), websearch_to_tsquery('english', $${queryParamIndex})) DESC, e.importance DESC, e.created_at DESC`;
  }

  const limit = Math.min(options.limit ?? 20, 100);
  values.push(limit);

  const text = `
    SELECT
      e.id,
      e.context_pk,
      e.entry_type,
      e.title,
      e.content,
      e.tags,
      e.importance,
      e.created_by,
      e.metadata,
      e.expires_at,
      e.created_at,
      e.updated_at
    FROM entries e
    JOIN contexts c ON e.context_pk = c.id
    WHERE ${where.join(" AND ")}
    ORDER BY ${orderBy}
    LIMIT $${values.length}
  `;

  return { text, values };
}
