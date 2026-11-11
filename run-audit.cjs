const { execFile } = process.getBuiltinModule("node:child_process");
const fs = process.getBuiltinModule("node:fs");
const path = process.getBuiltinModule("node:path");

const root = path.join(__dirname);
const jsonOut = path.join(root, "audit-critical.json");
const errOut = path.join(root, "audit-error.txt");

fs.writeFileSync(errOut, "", "utf8");

execFile(
  "npm",
  ["audit", "--json"],
  { cwd: root, maxBuffer: 64 * 1024 * 1024 },
  (err, stdout, stderr) => {
    fs.writeFileSync(jsonOut, stdout || "{}", "utf8");
    fs.writeFileSync(errOut, stderr, "utf8");

    let size = 0;
    try {
      size = fs.statSync(jsonOut).size;
    } catch {
      /* retain the default size */
    }

    console.log(`exit code: ${err ? err.code : 0}`);
    if (err) console.log("npm error:", err.message);
    console.log("audit-critical.json size:", size, "bytes");
    if (stderr.trim()) {
      console.log("stderr:", stderr);
    }
    process.exit(err ? err.code : 0);
  },
);
