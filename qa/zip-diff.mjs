/**
 * Compare the workspace tree against the pristine ZIP manifest
 * (C:/Users/efeca/AppData/Local/Temp/opencode/zip-manifest.json, written from
 * RareCognos-V2-Production-Verified.zip).
 *
 * Excludes build/dev-output and QA artifacts from both sides. Same path + same
 * size => "same size (content not hashed)"; size mismatch => "MODIFIED";
 * only in workspace => "ADDED"; only in zip => "REMOVED".
 * Usage: node qa/zip-diff.mjs
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = process.cwd();
const EXCLUDE_DIRS = new Set([
  "node_modules",
  ".vercel",
  "dist",
  "qa",
  ".grok",
  ".openai",
  "test-logs",
  "artifacts",
]);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "Thumbs.db") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDE_DIRS.has(entry.name)) continue;
      walk(full, out);
    } else {
      out.push(full);
    }
  }
  return out;
}

const workspaceFiles = walk(ROOT);
const zipEntries = JSON.parse(
  readFileSync("C:/Users/efeca/AppData/Local/Temp/opencode/zip-manifest.json", "utf8").replace(
    /^\uFEFF/,
    "",
  ),
);
const PREFIX = "RareCognos-V2/";
const zipMap = new Map();
for (const e of zipEntries) {
  if (!e.path.startsWith(PREFIX)) continue;
  const rel = e.path.slice(PREFIX.length);
  const top = rel.split("/")[0];
  if (EXCLUDE_DIRS.has(top) || rel.includes("/node_modules/")) continue;
  zipMap.set(rel.replace(/\//g, sep), e.size);
}

const wsMap = new Map();
for (const full of workspaceFiles) {
  const rel = relative(ROOT, full);
  const top = rel.split(sep)[0];
  if (EXCLUDE_DIRS.has(top)) continue;
  wsMap.set(rel, statSync(full).size);
}

const same = [],
  modified = [],
  added = [],
  removed = [];
for (const [rel, size] of wsMap) {
  if (!zipMap.has(rel)) added.push(rel);
  else if (zipMap.get(rel) === size) same.push(rel);
  else modified.push(`${rel} (zip ${zipMap.get(rel)} B -> ws ${size} B)`);
}
for (const rel of zipMap.keys()) if (!wsMap.has(rel)) removed.push(rel);

console.log("=== IDENTICAL (same path + size, content not hashed):", same.length);
console.log("=== MODIFIED (size differs):", modified.length);
for (const m of modified.sort()) console.log("   M", m);
console.log("=== ADDED (not in zip):", added.length);
for (const a of added.sort()) console.log("   A", a);
console.log("=== REMOVED (in zip, not in workspace):", removed.length);
for (const r of removed.sort()) console.log("   R", r);
