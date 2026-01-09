CREATE TABLE IF NOT EXISTS context_aliases (
  alias text PRIMARY KEY,
  namespace text NOT NULL,
  context_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS context_aliases_target_idx
  ON context_aliases (namespace, context_id);

DROP TRIGGER IF EXISTS context_aliases_set_updated_at ON context_aliases;
CREATE TRIGGER context_aliases_set_updated_at
BEFORE UPDATE ON context_aliases
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
