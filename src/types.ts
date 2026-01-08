export interface ContextRecord {
  id: string;
  namespace: string;
  context_id: string;
  description: string | null;
  tags: string[];
  scope: string;
  owner: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface EntryRecord {
  id: string;
  context_pk: string;
  entry_type: string;
  title: string | null;
  content: string;
  tags: string[];
  importance: number;
  created_by: string | null;
  raw_text: string | null;
  raw_compressed?: Buffer | null;
  embedding?: number[] | null;
  metadata: Record<string, unknown>;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface EntryInput {
  entry_id?: string;
  entry_type: string;
  title?: string | null;
  content: string;
  tags?: string[];
  importance?: number;
  created_by?: string | null;
  expires_at?: string | null;
  raw_text?: string | null;
  embedding?: number[] | null;
  metadata?: Record<string, unknown>;
}

export interface SearchOptions {
  namespace: string;
  context_id: string;
  query?: string | null;
  tags?: string[];
  types?: string[];
  limit?: number;
  includeExpired?: boolean;
  searchMode?: "fts" | "vector" | "hybrid";
  embedding?: number[] | null;
}
