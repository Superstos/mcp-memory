import { gzip, gunzip } from "node:zlib";
import { promisify } from "node:util";
const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);
export async function compressText(text) {
    return gzipAsync(text, { level: 6 });
}
export async function decompressText(buffer) {
    const result = await gunzipAsync(buffer);
    return result.toString("utf8");
}
