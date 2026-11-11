#!/usr/bin/env node
/**
 * Run a command with `.grok/app-env.json` merged into its environment.
 *
 * `dev`, `build` and `preview` all route through this wrapper, so the dev
 * server, the built bundle and the preview server can never disagree about
 * `VITE_AUTH_ENABLED` — a divergence that only shows up as a built-output
 * mismatch long after the fact. Anything that starts Vite directly bypasses it.
 *
 * Only `VITE_`-prefixed keys are honored: the file is a build flag carrier, not
 * a secret store, and only `VITE_` vars reach the browser anyway. A real
 * `process.env` entry always wins, so an explicit override still works.
 *
 * That precedence also means the file governs this workspace only. A deployed
 * build runs with the provider's project env, where the deployer sets
 * `VITE_AUTH_ENABLED` itself (today unconditionally `"true"`), so the deployed
 * flag is the platform's, not this file's.
 *
 * Vite picks the values up because `loadEnv` prefix-matches entries already in
 * `process.env`, which is why the merge has to happen before Vite starts.
 */
import { spawn, spawnSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { constants as osConstants } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Resolve an executable command name into an absolute path, using Node's
 * resolution order so bare `vite` works even when the Windows PATH does not
 * expose a directory that maps command names to their wrappers.
 *
 * On win32, `node_modules/.bin/<command>` is usually a POSIX `.sh` shim that
 * Node's spawn() cannot execute without a shell. Spawning the `.cmd` launcher
 * from there (`node_modules/.bin/<command>.cmd`) also fails on this platform
 * with `spawn EINVAL`, so the reliable path is the package's own entrypoint
 * at <root>/node_modules/<command>/bin/<command>.js — proven to launch cleanly
 * and to pass through the environment merged by this wrapper.
 *
 * Priority:
 * 1. The command's own entrypoint at <root>/node_modules/<command>/bin/<command>.js
 *    (launches cleanly via spawn(), inherits the merged env).
 * 2. The `.cmd` / `.ps1` / `.bat` launcher at <root>/node_modules/.bin/<command>.cmd
 *    (kept as fallback for tools that have no `.js` entrypoint).
 *
 * Returns `undefined` when neither exists — the caller then falls back to
 * spawning the bare name, preserving the pre-existing behaviour.
 */
function resolveCommand(name, root) {
  // Primary: the package's own executable entrypoint (launches via spawn()
  // without EINVAL and keeps the wrapper's env intact).
  const binJs = join(root, "node_modules", name, "bin", name + ".js");
  try {
    if (realpathSync(binJs)) return binJs;
  } catch {
    // fall through to launcher fallback
  }
  // Fallback: a Windows launcher when no `.js` entrypoint exists.
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

export const APP_ENV_REL_PATH = ".grok/app-env.json";

const VITE_PREFIX = "VITE_";

/**
 * Parse an app-env document, keeping only `VITE_`-prefixed string entries.
 * Anything unparseable is an empty environment — a workspace without the file
 * must behave exactly like today (auth on, no overrides).
 */
export function parseAppEnv(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {};
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const env = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (!key.startsWith(VITE_PREFIX)) continue;
    if (typeof value !== "string") continue;
    env[key] = value;
  }
  return env;
}

/** The app env recorded under `root`, or `{}` when the file is absent. */
export function readAppEnv(root) {
  try {
    return parseAppEnv(readFileSync(join(root, APP_ENV_REL_PATH), "utf8"));
  } catch {
    return {};
  }
}

/** File values under the process environment: an explicit override wins. */
export function mergeAppEnv(appEnv, processEnv) {
  return { ...appEnv, ...processEnv };
}

/**
 * Translate a child's `exit` `(code, signal)` into this process's exit status.
 *
 * Do not re-raise the signal with `process.kill(process.pid, signal)`: under
 * qemu-user (amd64 image builds on an arm host) a self-directed signal is
 * routinely delivered as SIGSEGV to the wrong process, which takes down the
 * test worker and fails the image build. `128 + signo` is what a shell reports
 * for a signal-killed command, so a cancelled `vite build` is still a failure.
 */
export function exitStatusFromChild(code, signal) {
  if (signal) {
    const signo = osConstants.signals[signal];
    return 128 + (typeof signo === "number" ? signo : 1);
  }
  return code ?? 1;
}

/** The workspace root (this file lives in `<root>/scripts/`). */
export function projectRoot() {
  return dirname(dirname(fileURLToPath(import.meta.url)));
}

/**
 * Whether `moduleUrl` is the script node was asked to run.
 *
 * Both sides are resolved through symlinks: node realpaths `import.meta.url`
 * but leaves `process.argv[1]` as typed, so comparing them raw makes a CLI
 * launched through a symlinked path (`/tmp` on macOS) a silent no-op.
 */
export function isMainModule(moduleUrl) {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === fileURLToPath(moduleUrl);
  } catch {
    return false;
  }
}

function main(argv) {
  const [command, ...args] = argv;
  if (!command) {
    console.error("usage: node scripts/with-app-env.mjs <command> [args…]");
    process.exit(2);
  }
  const env = mergeAppEnv(readAppEnv(projectRoot()), process.env);
  // Resolve the executable to an absolute path so bare names (vite, tailwindcss,
  // playwright, etc.) work on Windows even when .bin is not on PATH.
  const resolved = resolveCommand(command, projectRoot()) || command;
  // On Windows, package .js entrypoints at <pkg>/bin/<pkg>.js are regular files
  // stored as UTF-16; spawn() raises EFTYPE/EINVAL on them directly, while `node
  // <path>` runs fine. Route resolved .js files through Node so the merged env
  // and the wrapper's event handling still apply.
  const isJsEntrypoint =
    !resolved.includes("/node_modules/.bin/") && resolved.toLowerCase().endsWith(".js");
  const child = isJsEntrypoint
    ? spawn("node", [resolved, ...args], { stdio: "inherit", env })
    : spawn(resolved, args, { stdio: "inherit", env });
  // The dev server is long-running and is stopped by signalling this wrapper.
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(signal, () => child.kill(signal));
  }
  child.on("error", (err) => {
    console.error(`[with-app-env] failed to run ${command}:`, err?.message || err);
    process.exit(127);
  });
  child.on("exit", (code, signal) => {
    process.exit(exitStatusFromChild(code, signal));
  });
}

if (isMainModule(import.meta.url)) {
  main(process.argv.slice(2));
}
