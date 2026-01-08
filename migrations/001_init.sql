CREATE TABLE IF NOT EXISTS contexts (
  id uuid PRIMARY KEY,
  namespace text NOT NULL,
  context_id text NOT NULL,
  description text,
  tags text[] NOT NULL DEFAULT '{}',
  scope text NOT NULL DEFAULT 'shared',
  owner text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (namespace, context_id)
);

CREATE TABLE IF NOT EXISTS entries (
  id uuid PRIMARY KEY,
  context_pk uuid NOT NULL REFERENCES contexts(id) ON DELETE CASCADE,
  entry_type text NOT NULL,
  title text,
  content text NOT NULL,
  tags text[] NOT NULL DEFAULT '{}',
  importance integer NOT NULL DEFAULT 0,
  created_by text,
  raw_text text,
  raw_compressed bytea,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS entries_context_idx ON entries (context_pk);
CREATE INDEX IF NOT EXISTS entries_entry_type_idx ON entries (entry_type);
CREATE INDEX IF NOT EXISTS entries_tags_gin ON entries USING GIN (tags);
CREATE INDEX IF NOT EXISTS entries_fts_idx ON entries USING GIN (
  to_tsvector('english', coalesce(title, '') || ' ' || content)
);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS contexts_set_updated_at ON contexts;
CREATE TRIGGER contexts_set_updated_at
BEFORE UPDATE ON contexts
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS entries_set_updated_at ON entries;
CREATE TRIGGER entries_set_updated_at
BEFORE UPDATE ON entries
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
