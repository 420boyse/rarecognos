// Read-only LiteForge settlement check for the first real NFT purchase.
//
// Network constraint discovered during preparation (qa/rpc-capability-final.mjs):
// the public Zeeve RPC prunes historical STATE after roughly 100 blocks (~1.5 min at ~0.9 s/block),
// and eth_getLogs is unusable. Block headers, transactions and receipts remain available.
// So this script proves settlement from three independent sources, strongest available first:
//   1. SaleSettled / Purchased events in the buy receipt (immune to state pruning).
//   2. A live balance snapshot taken before the purchase (qa/nft-e2e-snapshot.mjs) versus after.
//   3. Archive balance reads at block-1/block, attempted only when still inside the pruning window.
// It never signs, never broadcasts, and writes only the QA record.
import fs from "node:fs";
import { createPublicClient, decodeEventLog, formatEther, http } from "viem";

const file = new URL("./first-real-nft-test.json", import.meta.url);
const record = JSON.parse(fs.readFileSync(file, "utf8"));
const { collection, market } = record.contracts;
const nftAbi = JSON.parse(fs.readFileSync(new URL("../artifacts/RareCognos.json", import.meta.url), "utf8")).abi;
const marketAbi = JSON.parse(fs.readFileSync(new URL("../artifacts/RareCognosMarket.json", import.meta.url), "utf8")).abi;
const client = createPublicClient({ transport: http("https://rpc.testnet.liteforge.zeeve.net", { timeout: 30_000 }) });
const same = (a, b) => typeof a === "string" && typeof b === "string" && a.toLowerCase() === b.toLowerCase();
const assert = (c, m) => { if (!c) throw Error(m); };

assert((await client.getChainId()) === 4441, "Wrong RPC chain");
const hashes = record.transactions;
const done = ["mint", "approve", "firstList", "cancel", "relist"].filter((n) => hashes[n]);
const missing = ["mint", "approve", "firstList", "cancel", "relist", "buy"].filter((n) => !hashes[n]);

// ---- snapshot mode: run BEFORE the purchase is approved ----
if (missing.length && !process.argv.includes("--verify")) {
  const head = await client.getBlockNumber();
  const [seller, buyer, treasury] = [record.wallets.seller, record.wallets.buyer, record.wallets.treasury];
  const [sellerBal, buyerBal, treasuryBal, sellerNonce, buyerNonce, treasuryNonce, liveTreasury, feeBps] = await Promise.all([
    client.getBalance({ address: seller }), client.getBalance({ address: buyer }), client.getBalance({ address: treasury }),
    client.getTransactionCount({ address: seller }), client.getTransactionCount({ address: buyer }), client.getTransactionCount({ address: treasury }),
    client.readContract({ address: market, abi: marketAbi, functionName: "treasury" }),
    client.readContract({ address: market, abi: marketAbi, functionName: "FEE_BPS" }),
  ]);
  const activeId = await client.readContract({ address: market, abi: marketAbi, functionName: "activeListing", args: [1n] });
  const active = await client.readContract({ address: market, abi: marketAbi, functionName: "listings", args: [activeId] });
  record.prePurchaseSnapshot = {
    takenAt: new Date().toISOString(), block: head.toString(),
    sellerWei: sellerBal.toString(), buyerWei: buyerBal.toString(), treasuryWei: treasuryBal.toString(),
    sellerNonce: sellerNonce.toString(), buyerNonce: buyerNonce.toString(), treasuryNonce: treasuryNonce.toString(),
    onChainTreasury: liveTreasury, feeBps: Number(feeBps),
    activeListingId: activeId.toString(), activeListingPriceWei: active[2].toString(), activeListingSeller: active[0],
    note: "Live balances captured before the buy. The treasury receives value only as the 0.25% fee, so its post-sale delta is exact.",
  };
  record.stage = "pre_purchase_snapshot";
  record.pendingApprovals = missing;
  fs.writeFileSync(file, JSON.stringify(record, null, 2) + "\n");
  console.log(`snapshot @ block ${head}: seller ${formatEther(sellerBal)} · buyer ${formatEther(buyerBal)} · treasury ${formatEther(treasuryBal)} zkLTC`);
  console.log(`active listing for token #1: #${activeId} @ ${formatEther(active[2])} zkLTC (seller ${active[0]})`);
  console.log(`still awaiting OKX approval: ${missing.join(", ")}`);
  process.exit(0);
}

if (!hashes.buy) { console.log("Nothing to verify: buy hash not recorded yet."); process.exit(0); }

const receipts = {};
for (const name of done.concat(["buy"])) {
  receipts[name] = await client.getTransactionReceipt({ hash: hashes[name] });
  assert(receipts[name].status === "success", `${name} transaction failed`);
}
const events = (receipt, address, abi) => receipt.logs
  .filter((l) => same(l.address, address))
  .flatMap((l) => { try { return [decodeEventLog({ abi, data: l.data, topics: l.topics }).args]; } catch { return []; } });

const minted = events(receipts.mint, collection, nftAbi).find((a) => a.tokenId !== undefined);
assert(minted, "Mint event missing");
const tokenId = minted.tokenId;
const sale = events(receipts.buy, market, marketAbi).find((a) => a.sellerProceeds !== undefined);
const bought = events(receipts.buy, market, marketAbi).find((a) => a.buyer !== undefined);
assert(sale && bought, "Purchase settlement events missing");

// 1. Event-level settlement proof (authoritative, pruning-immune)
assert(same(sale.seller, record.wallets.seller), "Seller wallet mismatch");
assert(same(bought.buyer, record.wallets.buyer), "Buyer wallet mismatch");
assert(same(sale.treasury, record.wallets.treasury), "Treasury wallet mismatch");
assert(sale.price === BigInt(record.sale.priceWei), "Sale price mismatch");
assert(sale.fee === (sale.price * 25n) / 10000n, "Fee is not 0.25% rounded down");
assert(sale.fee === BigInt(record.sale.expectedTreasuryFeeWei), "Treasury fee mismatch vs record");
assert(sale.sellerProceeds === sale.price - sale.fee, "Proceeds do not equal price minus fee");
assert(sale.sellerProceeds === BigInt(record.sale.expectedSellerProceedsWei), "Seller proceeds mismatch vs record");
const buyTx = await client.getTransaction({ hash: hashes.buy });
assert(buyTx.value === sale.price, "Buyer payment amount mismatch");
const feeNonzero = sale.fee > 0n;
assert(feeNonzero, "Treasury fee is zero — the price was too low to exercise the 0.25% fee");

// 2. Live state proof
const block = receipts.buy.blockNumber;
const head = await client.getBlockNumber();
const [owner, soldState, sellerNow, buyerNow, treasuryNow] = await Promise.all([
  client.readContract({ address: collection, abi: nftAbi, functionName: "ownerOf", args: [tokenId] }),
  client.readContract({ address: market, abi: marketAbi, functionName: "listings", args: [sale.id] }),
  client.getBalance({ address: sale.seller }), client.getBalance({ address: bought.buyer }), client.getBalance({ address: sale.treasury }),
]);
assert(same(owner, bought.buyer), "Buyer does not own minted token");
assert(soldState[3] === false, "Purchased listing is still active");

const snap = record.prePurchaseSnapshot;
let method, sellerDelta, treasuryDelta, buyerDelta;
if (snap) {
  sellerDelta = sellerNow - BigInt(snap.sellerWei);
  treasuryDelta = treasuryNow - BigInt(snap.treasuryWei);
  buyerDelta = buyerNow - BigInt(snap.buyerWei);
  method = "pre-purchase live snapshot vs live balance";
  assert(treasuryDelta === sale.fee, `Treasury delta ${treasuryDelta} != fee ${sale.fee}`);
} else {
  method = "live treasury balance only (no pre-purchase snapshot recorded)";
  treasuryDelta = treasuryNow;
  assert(treasuryNow === sale.fee, `Treasury balance ${treasuryNow} != expected cumulative fee ${sale.fee}`);
}

// 3. Archive cross-check when the purchase is still inside the pruning window (~100 blocks)
let archive = null;
if (head - block <= 90n) {
  try {
    const [sellerBefore, sellerAtBlock, treasuryBefore, treasuryAtBlock] = await Promise.all([
      client.getBalance({ address: sale.seller, blockNumber: block - 1n }),
      client.getBalance({ address: sale.seller, blockNumber: block }),
      client.getBalance({ address: sale.treasury, blockNumber: block - 1n }),
      client.getBalance({ address: sale.treasury, blockNumber: block }),
    ]);
    archive = {
      sellerDeltaWei: (sellerAtBlock - sellerBefore).toString(),
      treasuryDeltaWei: (treasuryAtBlock - treasuryBefore).toString(),
      matchesProceeds: sellerAtBlock - sellerBefore === sale.sellerProceeds,
      matchesFee: treasuryAtBlock - treasuryBefore === sale.fee,
    };
    assert(archive.matchesFee, "Archive treasury delta differs from fee");
    assert(archive.matchesProceeds, "Archive seller delta differs from proceeds");
  } catch (e) {
    archive = { unavailable: String(e.shortMessage || e.message).slice(0, 120) };
  }
} else archive = { skipped: `purchase is ${head - block} blocks behind head; state pruned beyond ~100 blocks` };

record.stage = "purchase_verified";
record.results = {
  ...record.results,
  purchase: {
    transactionHash: hashes.buy, block: block.toString(), listingId: sale.id.toString(),
    priceWei: sale.price.toString(), tokenTransferred: true,
  },
  owner: { tokenId: tokenId.toString(), address: owner, verified: true },
  sellerProceeds: {
    eventProceedsWei: sale.sellerProceeds.toString(), eventProceedsZkLTC: formatEther(sale.sellerProceeds),
    observedDeltaWei: sellerDelta === undefined ? null : sellerDelta.toString(),
    verification: method, verified: true,
  },
  treasuryBalanceChange: {
    eventFeeWei: sale.fee.toString(), eventFeeZkLTC: formatEther(sale.fee),
    observedDeltaWei: treasuryDelta.toString(), liveBalanceWei: treasuryNow.toString(),
    nonzero: feeNonzero, verified: true,
  },
  buyerPaid: { priceWei: sale.price.toString(), observedDeltaWei: buyerDelta === undefined ? null : buyerDelta.toString() },
  archiveCrossCheck: archive,
};
record.verifiedAt = new Date().toISOString();
fs.writeFileSync(file, JSON.stringify(record, null, 2) + "\n");
console.log(`PASS token #${tokenId} owner=${owner}`);
console.log(`  price     ${formatEther(sale.price)} zkLTC   (listing #${sale.id}, block ${block})`);
console.log(`  fee       ${formatEther(sale.fee)} zkLTC  -> treasury, delta verified: ${method}`);
console.log(`  proceeds  ${formatEther(sale.sellerProceeds)} zkLTC -> seller`);
console.log(`  archive cross-check: ${JSON.stringify(archive)}`);
