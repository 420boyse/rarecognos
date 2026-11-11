/**
 * Summarize a fresh `npm audit --json` (v2 schema) via stdin.
 * Usage: npm audit --json | node qa/audit-summary.mjs [module ...]
 * With no args prints severity totals + all direct vulnerabilities; with args
 * prints the full advisory chain for the named modules.
 */
let d = "";
process.stdin.on("data", (c) => (d += c));
process.stdin.on("end", () => {
  const j = JSON.parse(d);
  console.log("metadata:", JSON.stringify(j.metadata.vulnerabilities));
  const wanted = process.argv.slice(2);
  const entries = Object.entries(j.vulnerabilities);
  if (!wanted.length) {
    const direct = entries.filter(([, v]) => v.isDirect);
    console.log("direct vulnerable modules:", direct.length);
    for (const [name, v] of direct) {
      const fix =
        v.fixAvailable === true
          ? "yes"
          : v.fixAvailable
            ? JSON.stringify(v.fixAvailable)
            : "NO-FIX";
      console.log(
        " ",
        v.severity.padEnd(9),
        name.padEnd(24),
        v.range.padEnd(18),
        "fix:",
        fix,
      );
    }
    console.log("all modules:", entries.map(([n]) => n).sort().join(", "));
  }
  for (const [name, v] of entries) {
    if (wanted.length && !wanted.includes(name)) continue;
    console.log("===", name, "| direct:", v.isDirect, "| severity:", v.severity, "| range:", v.range);
    for (const va of v.via) {
      if (typeof va === "object") {
        console.log("   via:", va.name, va.range);
        console.log("      title:", va.title);
        console.log("      url:", va.url, "| cves:", JSON.stringify(va.cves || []));
      } else {
        console.log("   via(dep of):", va);
      }
    }
  }
});
