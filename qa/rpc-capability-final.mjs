// Final read-only capability matrix for the LiteForge Zeeve public RPC.
const RPC = "https://rpc.testnet.liteforge.zeeve.net";
const TREASURY = "0x06e53D74751392ee4aC7139f611B8db3f98591f9";
const MARKET = "0x77c0ea4283ea569fB40FC86641799693381B7Ec0";
const MINT = "0xb6e4602a0ea78dfc4746e8aec5e212787fc5e0173e6ca96fa1db77c2e93d9874";
const FUND = "0x377480d23aca3eb54d8e23f4bebc4977fb2be5f2997f2b7051f7891553508a42";
let seq = 0;
const rpc = async (method, params, ms = 20000) => {
  const t = Date.now();
  try {
    const r = await fetch(RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++seq, method, params }),
      signal: AbortSignal.timeout(ms),
    });
    const j = await r.json();
    if (j.error) return { ok: false, ms: Date.now() - t, msg: String(j.error.message).slice(0, 70) };
    return { ok: true, ms: Date.now() - t, result: j.result };
  } catch (e) {
    return { ok: false, ms: Date.now() - t, msg: "TIMEOUT/" + String(e.name) };
  }
};
const tag = (r) => (r.ok ? `OK(${r.ms}ms)` : `FAIL(${r.ms}ms) ${r.msg}`);
const headRes = await rpc("eth_blockNumber", []);
const head = BigInt(headRes.result);
console.log("head =", head, "\n");

console.log("=== A. historical STATE (eth_getBalance at a past block) ===");
const works = async (back) => (await rpc("eth_getBalance", [TREASURY, "0x" + (head - back).toString(16)], 12000)).ok;
let deepest = 0n;
for (const back of [1n, 10n, 50n, 100n, 150n, 200n, 300n, 500n, 1000n]) if (await works(back)) deepest = back;
for (const back of [1n, 50n, 100n, 150n, 200n, deepest])
  console.log(`  head-${String(back).padEnd(5)} ${tag(await rpc("eth_getBalance", [TREASURY, "0x" + (head - back).toString(16)]))} -> ${deepest === back ? "deepest working window" : ""}`);

console.log("\n=== B. block HEADERS (app replacement search uses getBlock) ===");
for (const back of [1n, 1000n, 20000n, 70000n])
  console.log(`  head-${String(back).padEnd(6)} ${tag(await rpc("eth_getBlockByNumber", ["0x" + (head - back).toString(16), true]))}`);
console.log(`  genesis          ${tag(await rpc("eth_getBlockByNumber", ["0x0", false]))}`);

console.log("\n=== C. historical TRANSACTIONS + RECEIPTS (event proof survives pruning) ===");
console.log("  getTransaction(mint, 45k blocks old)  ", tag(await rpc("eth_getTransactionByHash", [MINT])));
console.log("  getTransactionReceipt(mint)           ", tag(await rpc("eth_getTransactionReceipt", [MINT])));
console.log("  getTransactionReceipt(fundBuyer)      ", tag(await rpc("eth_getTransactionReceipt", [FUND])));

console.log("\n=== D. eth_getLogs ===");
for (const [label, p] of [
  ["single block (mint block)", { address: MARKET, fromBlock: "0x42c1f56", toBlock: "0x42c1f56" }],
  ["last 1 block", { address: MARKET, fromBlock: "0x" + (head - 1n).toString(16), toBlock: "latest" }],
  ["last 20 blocks", { address: MARKET, fromBlock: "0x" + (head - 20n).toString(16), toBlock: "latest" }],
])
  console.log(`  ${label.padEnd(28)} ${tag(await rpc("eth_getLogs", [p], 30000))}`);

console.log("\n=== E. block production rate ===");
const b1 = await rpc("eth_getBlockByNumber", ["latest", false]);
const h1 = await rpc("eth_blockNumber", []);
await new Promise((r) => setTimeout(r, 30000));
const b2 = await rpc("eth_getBlockByNumber", ["latest", false]);
const h2 = await rpc("eth_blockNumber", []);
const dn = Number(h2.result) - Number(h1.result);
const dt = Number(b2.result.timestamp) - Number(b1.result.timestamp);
console.log(`  ${dn} blocks / ${dt}s  =>  ${(dt / (dn || 1)).toFixed(2)} s/block`);
console.log(`  prune window ≈ ${deepest} blocks ≈ ${((dt / (dn || 1)) * Number(deepest) / 60).toFixed(1)} minutes of history for STATE reads`);
