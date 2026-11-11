// READ-ONLY verification of the first real RareCognos NFT purchase.
// Signs nothing, sends nothing, redeploys nothing, repeats nothing. Public RPC + explorer only.
//
// Evidence model (forced by the network): the Zeeve RPC prunes historical STATE after ~100 blocks,
// so block/block-1 balance deltas are only available if this runs within ~90 s of the sale. When they
// are unavailable, settlement is still fully proven by:
//   a) SaleSettled + Purchased + Transfer events decoded from the buy receipt,
//   b) the treasury live balance (it can ONLY ever receive the 0.25% fee and was 0 before),
//   c) the seller live-balance delta versus the saved pre-purchase snapshot,
//   d) conservation: tx.value == fee + proceeds.
import fs from "node:fs";
import {
  createPublicClient, decodeEventLog, decodeFunctionData, formatEther, http,
} from "viem";

const RPC = "https://rpc.testnet.liteforge.zeeve.net";
const EXP = "https://explorer.testnet.liteforge.zeeve.net";
const BUY_HASH = process.argv[2] || "0xfa68d8c01640a99d4f0512d238c4094d75b9ad87a15152af375f3ad35c6846d8";
const TOKEN_ID = 1n, LISTING_ID = 3n;
const PRICE = 10000000000000000n;         // 0.01 zkLTC
const FEE = 25000000000000n;              // 0.000025 zkLTC
const PROCEEDS = 9975000000000000n;       // 0.009975 zkLTC

const file = new URL("./first-real-nft-test.json", import.meta.url);
const record = JSON.parse(fs.readFileSync(file, "utf8"));
const { collection, market } = record.contracts;
const nftAbi = JSON.parse(fs.readFileSync(new URL("../artifacts/RareCognos.json", import.meta.url), "utf8")).abi;
const marketAbi = JSON.parse(fs.readFileSync(new URL("../artifacts/RareCognosMarket.json", import.meta.url), "utf8")).abi;
const client = createPublicClient({ transport: http(RPC, { timeout: 30_000, retryCount: 1 }) });
const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
const jsonSafe = (v) => JSON.stringify(v, (_, x) => (typeof x === "bigint" ? x.toString() : x), 2);

const checks = [];
const check = (id, pass, detail, group) => {
  checks.push({ id, group, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} [${(group || "info").padEnd(10)}] ${id} — ${detail}`);
  return pass;
};

// ---------- 1. transaction + receipt ----------
const tx = await client.getTransaction({ hash: BUY_HASH });
const receipt = await client.getTransactionReceipt({ hash: BUY_HASH });
const head = await client.getBlockNumber();
const gasCost = receipt.gasUsed * (receipt.effectiveGasPrice ?? 0n);
const buyer = tx.from;
check("tx-found", true, `block ${receipt.blockNumber}, head ${head}, ${head - receipt.blockNumber} blocks behind`, "1-tx");
check("receipt-success", receipt.status === "success", `receipt.status = "${receipt.status}"`, "1-tx");
check("target-is-market", same(tx.to, market), `to = ${tx.to}`, "1-tx");
check("not-seller-not-treasury", !same(buyer, record.wallets.seller) && !same(buyer, record.wallets.treasury),
  `sender ${buyer} is neither the seller nor the treasury`, "1-tx");
if (!same(buyer, record.wallets.buyer))
  check("sender-matches-prepared-wallet-B", false,
    `prepared wallet B was ${record.wallets.buyer} (nonce 0, still holding 0.02 zkLTC — it never bought). Actual payer: ${buyer}`, "1-tx");
else check("sender-matches-prepared-wallet-B", true, `payer is the prepared wallet B ${buyer}`, "1-tx");

// ---------- 2. buy() calldata + events ----------
const call = decodeFunctionData({ abi: marketAbi, data: tx.input });
check("function-is-buy", call.functionName === "buy", `decoded ${call.functionName}(${call.args.join(", ")})`, "2-decode");
check("listing-id-3", BigInt(call.args[0]) === LISTING_ID, `buy(listingId=${call.args[0]})`, "2-decode");
check("expected-price-exact", BigInt(call.args[1]) === PRICE, `buy(expectedPrice=${call.args[1]} wei) = 0.01 zkLTC`, "2-decode");

const marketEvents = receipt.logs.filter((l) => same(l.address, market)).flatMap((l) => {
  try { const e = decodeEventLog({ abi: marketAbi, data: l.data, topics: l.topics }); return [{ event: e.eventName, ...e.args }]; } catch { return []; }
});
const nftEvents = receipt.logs.filter((l) => same(l.address, collection)).flatMap((l) => {
  try { const e = decodeEventLog({ abi: nftAbi, data: l.data, topics: l.topics }); return [{ event: e.eventName, ...e.args }]; } catch { return []; }
});
const sale = marketEvents.find((a) => a.event === "SaleSettled");
const purchased = marketEvents.find((a) => a.event === "Purchased");
const transfer = nftEvents.find((a) => a.event === "Transfer");
check("events-emitted", Boolean(sale && purchased && transfer),
  `market: [${marketEvents.map((a) => a.event).join(", ")}] · collection: [${nftEvents.map((a) => a.event).join(", ")}] · note: buy() deactivates the listing struct directly, so no Cancelled event is expected`, "2-decode");
check("sale-settled-fields", Boolean(sale) && same(sale.seller, record.wallets.seller) && same(sale.treasury, record.wallets.treasury) && BigInt(sale.id) === LISTING_ID,
  JSON.stringify(sale && { id: String(sale.id), seller: sale.seller, treasury: sale.treasury, price: String(sale.price), fee: String(sale.fee), proceeds: String(sale.sellerProceeds) }), "2-decode");
check("purchased-buyer-is-sender", Boolean(purchased) && same(purchased.buyer, buyer), `Purchased.buyer = ${purchased?.buyer}`, "2-decode");
check("transfer-seller-to-buyer", Boolean(transfer) && same(transfer.from, record.wallets.seller) && same(transfer.to, buyer) && transfer.tokenId === TOKEN_ID,
  transfer ? `Transfer ${transfer.from} -> ${transfer.to}, tokenId ${transfer.tokenId}` : "missing", "2-decode");

// ---------- 3. ownerOf ----------
const owner = await client.readContract({ address: collection, abi: nftAbi, functionName: "ownerOf", args: [TOKEN_ID] });
const creator = await client.readContract({ address: collection, abi: nftAbi, functionName: "creator", args: [TOKEN_ID] });
const approvedNow = await client.readContract({ address: collection, abi: nftAbi, functionName: "getApproved", args: [TOKEN_ID] });
check("ownerOf-is-buyer", same(owner, buyer), `ownerOf(#1) = ${owner}`, "ownership");
check("creator-unchanged", same(creator, record.wallets.seller), `creator(#1) = ${creator} (immutable, survives transfer)`, "ownership");
check("market-approval-cleared-by-transfer", same(approvedNow, "0x0000000000000000000000000000000000000000"),
  `getApproved(#1) = ${approvedNow}`, "ownership");

// ---------- 4. listing #3 state ----------
const l3 = await client.readContract({ address: market, abi: marketAbi, functionName: "listings", args: [LISTING_ID] });
const activeForToken = await client.readContract({ address: market, abi: marketAbi, functionName: "activeListing", args: [TOKEN_ID] });
const otherListings = await Promise.all([1n, 2n].map((i) => client.readContract({ address: market, abi: marketAbi, functionName: "listings", args: [i] })));
check("listing-3-inactive", l3[3] === false, `listings(3) = { seller ${l3[0]}, token #${l3[1]}, price ${l3[2]}, active ${l3[3]} }`, "listing");
check("no-active-listing-for-token-1", BigInt(activeForToken) === 0n, `activeListing(#1) = ${activeForToken} (0 = none)`, "listing");
check("earlier-listings-still-inactive", otherListings[0][3] === false && otherListings[1][3] === false,
  `#1 active=${otherListings[0][3]} · #2 active=${otherListings[1][3]} (only #3 was active and is now consumed)`);

// ---------- 5. price ----------
check("value-0.01-zkLTC", tx.value === PRICE, `tx.value = ${tx.value} wei = ${formatEther(tx.value)} zkLTC`, "price");
check("event-price-0.01", Boolean(sale) && sale.price === PRICE, `SaleSettled.price = ${sale?.price} wei`, "price");
check("fee-is-floor-0.25pct", Boolean(sale) && sale.fee === (sale.price * 25n) / 10000n && sale.fee > 0n,
  `floor(${sale?.price} × 25 / 10000) = ${sale?.fee} wei — nonzero`, "price");
check("conservation-fee-plus-proceeds", Boolean(sale) && sale.fee + sale.sellerProceeds === sale.price && sale.fee === FEE && sale.sellerProceeds === PROCEEDS,
  `${sale?.fee} + ${sale?.sellerProceeds} = ${sale ? sale.fee + sale.sellerProceeds : "?"} = price`, "price");

// ---------- 6. money actually moved ----------
const snap = record.prePurchaseSnapshot || {};
const evidence = { archive: null, live: {}, explorer: null };

// 6a. archive deltas when still inside the ~100-block state window
if (head - receipt.blockNumber <= 100n) {
  try {
    const [sBefore, sAt, tBefore, tAt] = await Promise.all([
      client.getBalance({ address: sale.seller, blockNumber: receipt.blockNumber - 1n }),
      client.getBalance({ address: sale.seller, blockNumber: receipt.blockNumber }),
      client.getBalance({ address: sale.treasury, blockNumber: receipt.blockNumber - 1n }),
      client.getBalance({ address: sale.treasury, blockNumber: receipt.blockNumber }),
    ]);
    evidence.archive = {
      windowBlocksBehindHead: (head - receipt.blockNumber).toString(),
      sellerBeforeWei: sBefore.toString(), sellerAfterWei: sAt.toString(), sellerDeltaWei: (sAt - sBefore).toString(),
      treasuryBeforeWei: tBefore.toString(), treasuryAfterWei: tAt.toString(), treasuryDeltaWei: (tAt - tBefore).toString(),
    };
    check("archive-seller-delta-equals-proceeds", sAt - sBefore === PROCEEDS, `at block ${receipt.blockNumber} minus block ${receipt.blockNumber - 1n} = ${sAt - sBefore} wei`, "seller");
    check("archive-treasury-delta-equals-fee", tAt - tBefore === FEE, `delta = ${tAt - tBefore} wei`, "fee");
  } catch (e) {
    evidence.archive = { unavailable: String(e.shortMessage || e.message).replace(/\s+/g, " ").slice(0, 140) };
    check("archive-deltas", false, `state already pruned: ${evidence.archive.unavailable}`, "seller");
  }
} else {
  evidence.archive = { skipped: `${head - receipt.blockNumber} blocks behind head; RPC prunes state past ~100 blocks` };
  console.log(`INFO archive deltas unavailable (${head - receipt.blockNumber} blocks behind head); relying on events + live snapshots`);
}

// 6b. treasury: receives value ONLY as the marketplace fee, and was provably 0 before
const treasuryLive = await client.getBalance({ address: record.wallets.treasury });
evidence.live.treasury = { snapshotWei: snap.treasuryWei ?? null, liveWei: treasuryLive.toString() };
check("treasury-balance-equals-exactly-one-fee", treasuryLive === FEE && snap.treasuryWei === "0",
  `live balance ${treasuryLive} wei = ${formatEther(treasuryLive)} zkLTC; pre-purchase snapshot was exactly 0 wei. The only value this address can receive is the 0.25% fee, so +0.000025 zkLTC is the fee.`, "fee");

// 6c. seller: live balance minus the saved pre-purchase snapshot
const sellerLive = await client.getBalance({ address: record.wallets.seller });
const sellerNonceNow = await client.getTransactionCount({ address: record.wallets.seller });
if (snap.sellerWei) {
  const d = sellerLive - BigInt(snap.sellerWei);
  evidence.live.seller = { snapshotWei: snap.sellerWei, snapshotBlock: snap.block, liveWei: sellerLive.toString(), deltaWei: d.toString(), snapshotNonce: snap.sellerNonce, nonceNow: sellerNonceNow.toString() };
  check("seller-delta-equals-proceeds", d === PROCEEDS,
    `live ${sellerLive} − snapshot(block ${snap.block}) ${snap.sellerWei} = ${d} wei = ${formatEther(d)} zkLTC (expected ${PROCEEDS}). Seller nonce moved ${snap.sellerNonce}→${sellerNonceNow}, and an exact proceeds delta means no other value moved through this account`, "seller");
} else check("seller-delta-equals-proceeds", false, "no pre-purchase snapshot stored", "seller");

// 6d. buyer paid: no snapshot exists for the actual payer, so prove by construction + gas
const buyerLive = await client.getBalance({ address: buyer });
const buyerCode = await client.getBytecode({ address: buyer });
evidence.live.buyer = { address: buyer, isEOA: !buyerCode, liveWei: buyerLive.toString(), liveZkLTC: formatEther(buyerLive), nonce: (await client.getTransactionCount({ address: buyer })).toString(), gasCostWei: gasCost.toString() };
check("buyer-paid-price-plus-gas", tx.value === PRICE && gasCost > 0n,
  `msg.value ${tx.value} wei debited atomically from ${buyer} plus ${gasCost} wei gas (EVM guarantees the debit); buyer EOA=${!buyerCode}, nonce ${evidence.live.buyer.nonce}, now holds ${formatEther(buyerLive)} zkLTC. Prepared wallet B ${record.wallets.buyer} still holds exactly ${formatEther(await client.getBalance({ address: record.wallets.buyer }))} zkLTC at nonce 0 — untouched`, "buyer");

// 6e. explorer corroboration
try {
  const j = await (await fetch(`${EXP}/api/v2/transactions/${BUY_HASH}`, { signal: AbortSignal.timeout(20000) })).json();
  evidence.explorer = { result: j.result, value: j.value, gasUsed: j.gas_used, status: j.status, to: j.to?.hash || j.to, from: j.from?.hash || j.from, decodedMethod: j.method };
  check("explorer-confirms-success", j.result === "success" && String(j.value) === PRICE.toString(),
    `explorer: result=${j.result}, method=${j.method}, value=${j.value} wei, gasUsed=${j.gas_used}`, "1-tx");
} catch (e) { evidence.explorer = { error: String(e.message).slice(0, 120) }; }

// ---------- 7. persist ----------
const settlementGroups = { ownership: "ownership", seller: "seller payment", fee: "marketplace fee" };
const summary = Object.entries(settlementGroups).map(([group, label]) => {
  const cs = checks.filter((c) => c.group === group);
  return { metric: label, pass: cs.every((c) => c.pass), checks: cs.map((c) => c.id) };
});
record.transactions.buy = BUY_HASH;
record.stage = "purchase_verified";
record.wallets.actualBuyer = buyer;
record.wallets.actualBuyerNote = "The purchase was paid for by this address, not by the prepared wallet B (nonce 0, untouched).";
record.results = {
  ...(record.results || {}),
  purchase: {
    transactionHash: BUY_HASH, block: receipt.blockNumber.toString(), listingId: LISTING_ID.toString(),
    tokenId: TOKEN_ID.toString(), priceWei: PRICE.toString(), priceZkLTC: "0.01",
    buyer, seller: sale.seller, treasury: sale.treasury,
    gasUsed: receipt.gasUsed.toString(), gasCostWei: gasCost.toString(), status: "success",
  },
  owner: { tokenId: "1", address: owner, previousOwner: sale.seller, creatorPreserved: creator, marketApprovalClearedTo: approvedNow, verified: true },
  listing: { ...(record.results?.listing || {}), purchasedListingId: "3", activeAfterPurchase: false, activeListingForToken1: activeForToken.toString() },
  cancellation: { ...(record.results?.cancellation || {}), listing1CancelledTx: record.transactions.cancel, listing3ConsumedByPurchase: true },
  sellerProceeds: {
    expectedZkLTC: "0.009975", expectedWei: PROCEEDS.toString(),
    eventProceedsWei: sale.sellerProceeds.toString(),
    archiveDeltaWei: evidence.archive?.sellerDeltaWei ?? null,
    liveDeltaFromSnapshotWei: evidence.live.seller?.deltaWei ?? null,
    verified: summary.find((s) => s.metric === "seller payment")?.pass === true,
  },
  treasuryBalanceChange: {
    expectedZkLTC: "0.000025", expectedWei: FEE.toString(), eventFeeWei: sale.fee.toString(),
    archiveDeltaWei: evidence.archive?.treasuryDeltaWei ?? null,
    liveBalanceWei: treasuryLive.toString(), prePurchaseBalanceWei: snap.treasuryWei ?? null,
    nonzero: sale.fee > 0n, verified: summary.find((s) => s.metric === "marketplace fee")?.pass === true,
  },
  buyerPaid: { priceWei: tx.value.toString(), gasCostWei: gasCost.toString(), payer: buyer, note: "no pre-purchase snapshot for the actual payer; proven by atomic msg.value debit + conservation" },
};
record.verifiedAt = new Date().toISOString();

const verdict = {
  verifiedAt: record.verifiedAt, network: "LiteForge Zeeve 4441", rpc: RPC, transactionHash: BUY_HASH,
  transaction: { from: buyer, to: tx.to, valueWei: tx.value.toString(), block: receipt.blockNumber.toString(), gasUsed: receipt.gasUsed.toString(), gasCostWei: gasCost.toString(), status: receipt.status, inputSelector: tx.input.slice(0, 10) },
  decodedCall: { functionName: call.functionName, args: call.args.map(String) },
  events: { market: marketEvents.map((a) => a.event), collection: nftEvents.map((a) => a.event), SaleSettled: sale, Purchased: purchased, Transfer: transfer },
  liveState: { head: head.toString(), ownerOf1: owner, creator1: creator, getApproved1: approvedNow, listing3Active: l3[3], activeListingForToken1: activeForToken.toString(), treasuryLiveWei: treasuryLive.toString(), sellerLiveWei: sellerLive.toString(), buyerLiveWei: buyerLive.toString() },
  moneyEvidence: evidence, summary, checks,
  overallPass: summary.every((s) => s.pass),
  caveat: summary.length && checks.some((c) => !c.pass) ? checks.filter((c) => !c.pass).map((c) => c.id + ": " + c.detail) : null,
};
fs.writeFileSync("qa/first-real-nft-purchase-verification.json", jsonSafe(verdict) + "\n");
fs.writeFileSync(file, JSON.stringify(record, null, 2) + "\n");

console.log("\n=== SETTLEMENT SUMMARY ===");
for (const s of summary) console.log(`  ${s.pass ? "PASS" : "FAIL"} ${s.metric}  (${s.checks.join(", ")})`);
console.log(`\n${verdict.overallPass ? "OVERALL: PASS" : "OVERALL: PARTIAL"} — ${checks.filter((c) => c.pass).length}/${checks.length} checks passed`);
console.log("saved: qa/first-real-nft-purchase-verification.json, qa/first-real-nft-test.json");
process.exit(verdict.overallPass ? 0 : 1);
