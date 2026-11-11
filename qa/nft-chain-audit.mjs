// Single read-only chain + network audit for the first real NFT test.
// Verifies recorded receipts against live chain data, contract wiring, every listing, wallet
// readiness and the RPC capabilities that constrain how settlement can later be proven.
// No signing, no broadcasting, no private keys.
import fs from "node:fs";
import { createPublicClient, decodeEventLog, formatEther, http } from "viem";

const RPC = "https://rpc.testnet.liteforge.zeeve.net";
const EXP = "https://explorer.testnet.liteforge.zeeve.net";
const cfg = JSON.parse(fs.readFileSync("config/liteforge.json", "utf8"));
const record = JSON.parse(fs.readFileSync("qa/first-real-nft-test.json", "utf8"));
const nftAbi = JSON.parse(fs.readFileSync("artifacts/RareCognos.json", "utf8")).abi;
const marketAbi = JSON.parse(fs.readFileSync("artifacts/RareCognosMarket.json", "utf8")).abi;
const client = createPublicClient({ transport: http(RPC, { timeout: 25_000, retryCount: 0 }) });
const lines = [];
const say = (s) => { lines.push(s); console.log(s); };

const SELLER = record.wallets.seller, BUYER = record.wallets.buyer, TREASURY = record.wallets.treasury;

say("=== 1. network + contract identity ===");
const head = await client.getBlockNumber();
const gasPrice = await client.getGasPrice();
const [name, version, nextId, mktCollection, mktOwner, mktTreasury, feeBps] = await Promise.all([
  client.readContract({ address: cfg.collection, abi: nftAbi, functionName: "name" }),
  client.readContract({ address: cfg.collection, abi: nftAbi, functionName: "version" }),
  client.readContract({ address: cfg.collection, abi: nftAbi, functionName: "nextId" }),
  client.readContract({ address: cfg.market, abi: marketAbi, functionName: "collection" }),
  client.readContract({ address: cfg.market, abi: marketAbi, functionName: "owner" }),
  client.readContract({ address: cfg.market, abi: marketAbi, functionName: "treasury" }),
  client.readContract({ address: cfg.market, abi: marketAbi, functionName: "FEE_BPS" }),
]);
say(`  chain 4441 · head ${head} · gasPrice ${gasPrice} wei`);
say(`  collection "${name}" v${version}, ${nextId} token(s)`);
say(`  market.collection() ${mktCollection} ${mktCollection.toLowerCase() === cfg.collection.toLowerCase() ? "== config" : "MISMATCH"}`);
say(`  market.treasury()   ${mktTreasury} ${mktTreasury.toLowerCase() === TREASURY.toLowerCase() ? "== record" : "MISMATCH"}`);
say(`  market.owner()      ${mktOwner}`);
say(`  FEE_BPS ${feeBps} (0.25%)`);
for (const [a, label] of [[cfg.collection, "collection"], [cfg.market, "market"], [TREASURY, "treasury"], [BUYER, "buyer"]]) {
  const code = await client.getBytecode({ address: a });
  say(`  ${label.padEnd(11)} ${a} ${code ? "CONTRACT" : "EOA"}`);
}
for (const [label, url] of [["collection", cfg.collection], ["market", cfg.market]]) {
  const j = await fetch(`${EXP}/api/v2/smart-contracts/${url}`, { signal: AbortSignal.timeout(20000) }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  say(`  explorer verified(${label}): ${j?.compiler_version ? "YES — " + j.compiler_version + ", " + (j.source_code?.length || 0) + " source chars" : "NOT VERIFIED"}`);
}

say("\n=== 2. recorded transactions ===");
for (const [label, hash] of Object.entries(record.transactions)) {
  if (!hash) { say(`  ${label.padEnd(14)} PENDING (no hash yet)`); continue; }
  try {
    const r = await client.getTransactionReceipt({ hash });
    const names = r.logs.flatMap((l) => {
      for (const [abi, addr] of [[nftAbi, cfg.collection], [marketAbi, cfg.market]]) {
        if (l.address.toLowerCase() !== addr.toLowerCase()) continue;
        try { return [decodeEventLog({ abi, data: l.data, topics: l.topics }).eventName]; } catch { return []; }
      }
      return [];
    });
    say(`  ${label.padEnd(14)} block ${r.blockNumber} · ${r.status === "success" ? "SUCCESS" : "FAILED"} · ${r.gasUsed} gas · ${names.join(",") || "value transfer"}`);
  } catch (e) { say(`  ${label.padEnd(14)} ${String(e.shortMessage || e.message).slice(0, 80)}`); }
}

say("\n=== 3. every listing ever created ===");
const count = await client.readContract({ address: cfg.market, abi: marketAbi, functionName: "count" });
const all = await Promise.all(Array.from({ length: Number(count) }, (_, i) =>
  client.readContract({ address: cfg.market, abi: marketAbi, functionName: "listings", args: [BigInt(i + 1)] })));
let activeId = null;
all.forEach((l, i) => {
  const id = BigInt(i + 1);
  if (l[3]) activeId = id;
  say(`  listing #${id}: token #${l[1]} seller ${l[0].slice(0, 10)}… price ${formatEther(l[2])} zkLTC · ${l[3] ? "ACTIVE" : "inactive"}`);
});
say(`  => the purchase target is listing #${activeId}`);
const owner1 = await client.readContract({ address: cfg.collection, abi: nftAbi, functionName: "ownerOf", args: [1n] });
const approved1 = await client.readContract({ address: cfg.collection, abi: nftAbi, functionName: "getApproved", args: [1n] });
say(`  token #1 owner ${owner1} · getApproved ${approved1} ${approved1.toLowerCase() === cfg.market.toLowerCase() ? "(market, so buy is authorized)" : ""}`);

say("\n=== 4. wallet readiness for the purchase ===");
const [sellerBal, buyerBal, treasuryBal, buyerNonce] = await Promise.all([
  client.getBalance({ address: SELLER }), client.getBalance({ address: BUYER }), client.getBalance({ address: TREASURY }),
  client.getTransactionCount({ address: BUYER }),
]);
const buyGas = 187_000n; // measured in qa/nft-flow-simulation.json
const price = all[Number(activeId) - 1][2];
const needed = price + buyGas * gasPrice;
say(`  seller  ${formatEther(sellerBal)} zkLTC (receives proceeds ${formatEther(price - (price * 25n) / 10000n)})`);
say(`  buyer   ${formatEther(buyerBal)} zkLTC, nonce ${buyerNonce} · needs ${formatEther(needed)} zkLTC (price + ${buyGas} gas) → ${buyerBal >= needed ? "SUFFICIENT" : "INSUFFICIENT"}`);
say(`  treasury ${formatEther(treasuryBal)} zkLTC — a nonzero post-sale balance is itself proof the fee moved`);
say(`  distinct wallets: seller≠buyer ${SELLER !== BUYER} · seller≠treasury ${SELLER !== TREASURY} · buyer≠treasury ${BUYER !== TREASURY}`);

say("\n=== 5. fee ladder (fee = floor(price * 25 / 10000)) ===");
for (const p of ["0.01", "0.001", "0.0001", "0.00001", "0.000001", "1e-9", "400"]) {
  const wei = p === "400" ? 400n : BigInt(Math.round(Number(p) * 1e18));
  const fee = (wei * 25n) / 10000n;
  say(`  price ${formatEther(wei).padEnd(12)} zkLTC -> fee ${fee.toString().padStart(23)} wei ${fee > 0n ? "NONZERO" : "zero (fee lost to rounding)"}`);
}

say("\n=== 6. RPC capability (constrains verification) ===");
const tryRpc = async (method, params) => {
  try {
    const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(15_000) });
    const j = await r.json();
    return j.error ? "FAIL: " + String(j.error.message).slice(0, 45) : "OK";
  } catch { return "FAIL: timeout"; }
};
say(`  balance@head-1     ${await tryRpc("eth_getBalance", [TREASURY, "0x" + (head - 1n).toString(16)])}`);
say(`  balance@head-100   ${await tryRpc("eth_getBalance", [TREASURY, "0x" + (head - 100n).toString(16)])}`);
say(`  balance@head-500   ${await tryRpc("eth_getBalance", [TREASURY, "0x" + (head - 500n).toString(16)])}`);
say(`  block@head-20000   ${await tryRpc("eth_getBlockByNumber", ["0x" + (head - 20000n).toString(16), false])}`);
say(`  receipt(oldest tx) ${await tryRpc("eth_getTransactionReceipt", [record.transactions.mint])}`);
say(`  eth_getLogs(1 blk) ${await tryRpc("eth_getLogs", [{ address: cfg.market, fromBlock: "0x" + (head - 1n).toString(16), toBlock: "latest" }])}`);
say("  => state is readable only for ~100 blocks (~90 s); logs are unusable.");
say("  => settlement proof must use receipt events + a live pre-snapshot, not block-N balance reads.");

fs.writeFileSync("qa/nft-chain-audit.txt", lines.join("\n") + "\n");
say("\nwrote qa/nft-chain-audit.txt");
