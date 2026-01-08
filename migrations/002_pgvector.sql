-- Optional: enable pgvector for semantic search. Adjust dimensions to your embedding size.
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE entries
  ADD COLUMN IF NOT EXISTS embedding vector(1536);

CREATE INDEX IF NOT EXISTS entries_embedding_idx
  ON entries
  USING ivfflat (embedding vector_l2_ops)
  WITH (lists = 100);
