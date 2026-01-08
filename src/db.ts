import pg from "pg";

export interface DbInfo {
  vectorExtension: boolean;
  embeddingColumn: boolean;
}

const { Pool } = pg;

export function createPool(databaseUrl: string): pg.Pool {
  return new Pool({
    connectionString: databaseUrl,
    max: 10
  });
}

export async function detectDbInfo(pool: pg.Pool): Promise<DbInfo> {
  const vectorExtension = await hasVectorExtension(pool);
  const embeddingColumn = await hasEmbeddingColumn(pool);
  return { vectorExtension, embeddingColumn };
}

async function hasVectorExtension(pool: pg.Pool): Promise<boolean> {
  const result = await pool.query(
    "SELECT 1 FROM pg_extension WHERE extname = 'vector'"
  );
  return (result.rowCount ?? 0) > 0;
}

async function hasEmbeddingColumn(pool: pg.Pool): Promise<boolean> {
  const result = await pool.query(
    "SELECT 1 FROM information_schema.columns WHERE table_name = 'entries' AND column_name = 'embedding'"
  );
  return (result.rowCount ?? 0) > 0;
}
