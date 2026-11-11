// Upload-service contract check. Requests a challenge for a throwaway public address only, then
// attempts deliberately INVALID /prepare calls. It never signs and never pins real content.
import { createHash } from "node:crypto";
import fs from "node:fs";
const BASE = "http://127.0.0.1:8787";
const ORIGIN = "http://localhost:8080";
const THROWAWAY = "0x1111111111111111111111111111111111111111";
const bytes = fs.readFileSync("qa/first-test-artwork.png");
const digest = createHash("sha256").update(bytes).digest("hex");
const post = async (path, body, origin = ORIGIN) => {
  const r = await fetch(BASE + path, { method: "POST", headers: { "content-type": "application/json", Origin: origin }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
  return { status: r.status, json: await r.json().catch(() => null) };
};
const c = await post("/challenge", { wallet: THROWAWAY, digest, name: "Read-only service probe", description: "Challenge-shape verification only; nothing is signed or pinned.", rights: true });
const msg = c.json.message || "";
// The server binds the message to SHA-256 of the canonical payload JSON, not to the raw image digest.
const payload = JSON.stringify({ wallet: THROWAWAY, digest, name: "Read-only service probe", description: "Challenge-shape verification only; nothing is signed or pinned.", rights: true, chainId: 4441 });
const payloadHash = createHash("sha256").update(payload).digest("hex");
const checks = {
  http200: c.status === 200,
  hasNonce: /^[0-9a-f]{48}$/.test(c.json.id || ""),
  fiveMinuteWindow: typeof c.json.expires === "number" && c.json.expires - Date.now() > 240_000 && c.json.expires - Date.now() <= 300_000,
  bindsOrigin: msg.includes("Origin: " + ORIGIN),
  bindsChain4441: msg.includes("Chain: 4441"),
  bindsWallet: msg.toLowerCase().includes(THROWAWAY),
  bindsPayloadHashCoveringImageDigest: msg.includes("Payload SHA-256: " + payloadHash),
  imageDigestInsidePayload: payload.includes(digest),
  declaresNotATransaction: /not a transaction/i.test(msg),
  rightsAttested: /rights to publish this artwork/i.test(msg),
};
console.log("POST /challenge ->", c.status);
for (const [k, v] of Object.entries(checks)) console.log(`  ${v ? "PASS" : "FAIL"} ${k}`);

// Invalid-authorisation attempts. Each must be refused and must NOT pin anything.
const rand65 = "0x" + "11".repeat(65); // well-formed 65-byte signature, wrong signer
const neg = [];
const n1 = await post("/prepare", { id: c.json.id, signature: rand65, file: bytes.toString("base64") });
neg.push({ label: "malformed signature", expect: "4xx", status: n1.status, error: n1.json?.error });
const n2 = await post("/prepare", { id: c.json.id, signature: rand65, file: Buffer.concat([Buffer.from([0x00]), bytes.subarray(1)]).toString("base64") });
neg.push({ label: "tampered image bytes", expect: "4xx", status: n2.status, error: n2.json?.error });
const n3 = await post("/prepare", { id: "0".repeat(48), signature: rand65, file: bytes.toString("base64") });
neg.push({ label: "unknown nonce", expect: "4xx", status: n3.status, error: n3.json?.error });
const n4 = await post("/challenge", { wallet: THROWAWAY, digest: "zz", name: "x", description: "y", rights: true });
neg.push({ label: "non-hex digest rejected", expect: "4xx", status: n4.status, error: n4.json?.error });
const n5 = await post("/challenge", { wallet: THROWAWAY, digest, name: "x", description: "y", rights: false });
neg.push({ label: "missing rights declaration rejected", expect: "4xx", status: n5.status, error: n5.json?.error });
const n6 = await post("/prepare", { id: c.json.id, signature: rand65, file: bytes.toString("base64") }, "https://not-allowed.example");
neg.push({ label: "disallowed origin rejected", expect: "403", status: n6.status, error: n6.json?.error });
// Reuse of the same nonce after a refusal must still be refused (single-use nonces)
const n7 = await post("/prepare", { id: c.json.id, signature: rand65, file: bytes.toString("base64") });
neg.push({ label: "replay of same nonce refused", expect: "4xx", status: n7.status, error: n7.json?.error });
console.log("\ninvalid-authorisation probes (nothing pinned):");
for (const n of neg) console.log(`  ${400 <= n.status && n.status < 500 ? "PASS" : "FAIL"} ${n.label} -> HTTP ${n.status} ${JSON.stringify(n.error)}`);
const all4xx = Object.values(checks).every(Boolean) && neg.every(n => n.status >= 400 && n.status < 500);
console.log("\n" + (all4xx ? "UPLOAD SERVICE: PASS (no content pinned, no signature made)" : "UPLOAD SERVICE: FAIL"));
fs.writeFileSync("qa/upload-service-verdict.json", JSON.stringify({ generatedAt: new Date().toISOString(), pinned: false, signed: false, checks, probes: neg }, null, 2) + "\n");
process.exit(all4xx ? 0 : 1);
