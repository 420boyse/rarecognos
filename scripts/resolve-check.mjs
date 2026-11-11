#!/usr/bin/env node
import { spawn } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

/**
 * Replicate the exact resolution used by with-app-env.mjs so the diagnostic
 * tests the same path the wrapper will actually launch.
 */
function resolveCommand(name, root) {
  const binJs = join(root, "node_modules", name, "bin", name + ".js");
  try {
    if (realpathSync(binJs)) return binJs;
  } catch {
    // fall through to launcher fallback
  }
  const bin = join(root, "node_modules", ".bin", name);
  for (const suffix of [".cmd", ".ps1", ".bat"]) {
    const path = bin + suffix;
    try {
      if (realpathSync(path)) return path;
    } catch {
      continue;
    }
  }
  return undefined;
}

const cmd = process.argv[2] || "vite";
const resolved = resolveCommand(cmd, root);
console.log(`command = ${cmd}`);
console.log(`resolved = ${resolved}`);

if (!resolved) {
  console.log("no resolution -> spawning bare name");
}

const child = spawn(process.execPath, [resolved || cmd, "--version"], {
  stdio: ["inherit", "pipe", "pipe"],
});

const stdout = [];
const stderr = [];
child.stdout.on("data", (d) => stdout.push(d));
child.stderr.on("data", (d) => stderr.push(d));

child.on("error", (err) => {
  console.log(`spawn ERROR: ${err.message}`, { code: err.code, errno: err.errno, syscall: err.syscall });
  process.exit(127);
});

child.on("exit", (code, signal) => {
  const out = Buffer.concat(stdout).toString("utf8").trim();
  const err = Buffer.concat(stderr).toString("utf8").trim();
  console.log(`exit code = ${code}, signal = ${signal}`);
  if (out) console.log(`stdout = ${out}`);
  if (err) console.log(`stderr = ${err}`);
  process.exit(code ?? 127);
});
