// Keyless local launcher for the existing upload service. No app source is modified.
// On Windows `node upload-service/server.mjs` never self-starts: the entry guard compares
// process.argv[1] (C:\...) with new URL(import.meta.url).pathname (/C:/... and percent-encoded
// non-ASCII). This imports the same exported startUploadServer() instead.
// Secrets stay in upload-service/.env and are never printed.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startUploadServer } from "../upload-service/server.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = path.join(root, "upload-service", ".env");
const env = {};
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (m) env[m[1]] = m[2];
  }
}
const dataDir = process.env.UPLOAD_DATA_DIR || path.join(root, ".upload-data");
const port = Number(process.env.UPLOAD_PORT || 8787);

const service = await startUploadServer({
  port,
  dir: dataDir,
  demo: false,
  jwt: env.PINATA_JWT,
  origins: (env.UPLOAD_ALLOWED_ORIGINS || "http://localhost:8080")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
  chainId: 4441,
});
console.log(
  `upload service listening on ${service.port} · ipfs mode: ${Boolean(env.PINATA_JWT)} · ` +
    `data dir: ${dataDir} · origins: ${(env.UPLOAD_ALLOWED_ORIGINS || "").trim()}`,
);
