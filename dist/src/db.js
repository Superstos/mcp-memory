import pg from "pg";
const { Pool } = pg;
export function createPool(databaseUrl) {
    return new Pool({
        connectionString: databaseUrl,
        max: 10
    });
}
export async function detectDbInfo(pool) {
    const vectorExtension = await hasVectorExtension(pool);
    const embeddingColumn = await hasEmbeddingColumn(pool);
    return { vectorExtension, embeddingColumn };
}
async function hasVectorExtension(pool) {
    const result = await pool.query("SELECT 1 FROM pg_extension WHERE extname = 'vector'");
    return (result.rowCount ?? 0) > 0;
}
async function hasEmbeddingColumn(pool) {
    const result = await pool.query("SELECT 1 FROM information_schema.columns WHERE table_name = 'entries' AND column_name = 'embedding'");
    return (result.rowCount ?? 0) > 0;
}
