import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const distIndexUrl = new URL("../dist/index.js", import.meta.url);
const distDir = dirname(fileURLToPath(distIndexUrl));

await mkdir(distDir, { recursive: true });
await writeFile(distIndexUrl, 'import "./src/index.js";\n', "utf8");
