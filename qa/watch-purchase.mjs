// Read-only purchase watcher for LiteForge 4441.
//
// Why this exists: the public RPC prunes historical state after ~100 blocks (~90 s), so balance
// deltas at the purchase block must be read almost immediately. eth_getLogs is unusable there,
// so instead of scanning logs this watcher watches the TREASURY BALANCE, which can only change by
// the 0.25% marketplace fee. The instant it moves, it resolves the buy transaction from the
// explorer's indexed transaction list, reads the receipt, and records everything.
//
// It never signs, never broadcasts, and never reads a private key.
import fs from "node:fs";
import { createPublicClient, decodeEventLog, formatEther, http } from "viem";

const RPC = "https://rpc.testnet.liteforge.zeeve.net";
const EXP = "https://explorer.testnet.liteforge.zeeve.net";
const file = new URL("./first-real-nft-test.json", import.meta.url);
const record = JSON.parse(fs.readFileSync(file, "utf8"));
const { collection, market } = record.contracts;
const nftAbi = JSON.parse(fs.readFileSync(new URL("../artifacts/RareCognos.json", import.meta.url), "utf8")).abi;
const marketAbi = JSON.parse(fs.readFileSync(new URL("../artifacts/RareCognosMarket.json", import.meta.url), "utf8")).abi;
const client = createPublicClient({ transport: http(RPC, { timeout: 25_000, retryCount: 0 }) });
const BUYER = record.wallets.buyer, SELLER = record.wallets.seller, TREASURY = record.wallets.treasury;

const snap = record.prePurchaseSnapshot;
const baselineTreasury = BigInt(snap ? snap.treasuryWei : await client.getBalance({ address: TREASURY }));
const baselineSeller = BigInt(snap ? snap.sellerWei : await client.getBalance({ address: SELLER }));
const baselineBuyer = BigInt(snap ? snap.buyerWei : await client.getBalance({ address: BUYER }));
console.log(`watching treasury ${TREASURY} for a fee above ${formatEther(baselineTreasury)} zkLTC`);
console.log(`seller ${formatEther(baselineSeller)} · buyer ${formatEther(baselineBuyer)} zkLTC (snapshot ${snap ? snap.block : "live"})`);

const deadline = Date.now() + Number(process.env.WATCH_SECONDS || 1800) * 1000;
let found = null, ticks = 0;
while (!found && Date.now() < deadline) {
  ticks++;
  try {
    const now = await client.getBalance({ address: TREASURY });
    if (now !== baselineTreasury) {
      const head = await client.getBlockNumber();
      // Resolve the buy from the MARKET's indexed transactions, not the prepared buyer's.
      // (The first sale was paid for by a different account than the one planned, and the
      // earlier version of this watcher looked only at the prepared buyer and found nothing.)
      const marketTxs = await fetch(`${EXP}/api/v2/addresses/${market}/transactions`)
        .then((r) => r.json()).then((j) => j.items || []).catch(() => []);
      const candidate = marketTxs.find((t) => String(t.method || "").toLowerCase() === "buy")
        || marketTxs.find((t) => (t.to?.hash || t.to || "").toLowerCase() === market.toLowerCase());
      if (!candidate) { console.log(`treasury moved to ${now} but no buy() is indexed on the market yet`); }
      else {
        const receipt = await client.getTransactionReceipt({ hash: candidate.hash });
        if (receipt.status !== "success") throw Error("candidate buy reverted: " + candidate.hash);
        const block = receipt.blockNumber;
        // Everything below must happen inside the state window, so it is done immediately.
        const [sale, bought] = (() => {
          const args = receipt.logs.filter((l) => l.address.toLowerCase() === market.toLowerCase())
            .flatMap((l) => { try { return [decodeEventLog({ abi: marketAbi, data: l.data, topics: l.topics }).args]; } catch { return []; } });
          return [args.find((a) => a.sellerProceeds !== undefined), args.find((a) => a.buyer !== undefined)];
        })();
        const listing = await client.readContract({ address: market, abi: marketAbi, functionName: "listings", args: [sale.id] });
        const buyTx = await client.getTransaction({ hash: candidate.hash });
        const tokenId = listing[1];
        const [owner, sellerNow, buyerNow, treasuryNow, postHead] = await Promise.all([
          client.readContract({ address: collection, abi: nftAbi, functionName: "ownerOf", args: [tokenId] }),
          client.getBalance({ address: SELLER }), client.getBalance({ address: receipt.from ?? BUYER }), client.getBalance({ address: TREASURY }),
          client.getBlockNumber(),
        ]);
        let archive = null;
        try {
          const [sBefore, sAt, tBefore, tAt] = await Promise.all([
            client.getBalance({ address: sale.seller, blockNumber: block - 1n }),
            client.getBalance({ address: sale.seller, blockNumber: block }),
            client.getBalance({ address: sale.treasury, blockNumber: block - 1n }),
            client.getBalance({ address: sale.treasury, blockNumber: block }),
          ]);
          archive = {
            sellerDeltaWei: (sAt - sBefore).toString(), treasuryDeltaWei: (tAt - tBefore).toString(),
            matchesProceeds: sAt - sBefore === sale.sellerProceeds, matchesFee: tAt - tBefore === sale.fee,
            readAtBlockOffset: (postHead - block).toString(),
          };
        } catch (e) { archive = { unavailable: String(e.shortMessage || e.message).slice(0, 140) }; }
        found = {
          transactionHash: candidate.hash, block: block.toString(), listingId: sale.id.toString(),
          tokenId: listing[1].toString(), priceWei: sale.price.toString(),
          buyerValueWei: buyTx.value.toString(), valueMatchesPrice: buyTx.value === sale.price,
          treasuryFeeWei: sale.fee.toString(),
          treasuryFeeZkLTC: formatEther(sale.fee), sellerProceedsWei: sale.sellerProceeds.toString(),
          sellerProceedsZkLTC: formatEther(sale.sellerProceeds), buyer: bought.buyer, seller: sale.seller,
          treasury: sale.treasury, owner, gasUsed: receipt.gasUsed.toString(),
          effectiveGasPriceWei: (receipt.effectiveGasPrice ?? 0n).toString(),
          buyerPaidTotalWei: (sale.price + BigInt(receipt.gasUsed) * (receipt.effectiveGasPrice ?? 0n)).toString(),
          liveDeltas: {
            sellerWei: (sellerNow - baselineSeller).toString(),
            buyerWei: (buyerNow - baselineBuyer).toString(),
            treasuryWei: (treasuryNow - baselineTreasury).toString(),
            treasuryNowWei: treasuryNow.toString(),
          },
          archive, detectedAfterPolls: ticks, detectedAt: new Date().toISOString(),
        };
      }
    }
  } catch (e) { if (ticks % 15 === 1) console.log("poll error:", String(e.message).slice(0, 100)); }
  if (!found) await new Promise((r) => setTimeout(r, 2000));
}
if (!found) { console.log(`no purchase detected within ${process.env.WATCH_SECONDS || 1800}s`); process.exit(1); }

record.transactions.buy = found.transactionHash;
record.stage = "purchase_observed";
record.results.purchaseObservation = found;
fs.writeFileSync(file, JSON.stringify(record, null, 2) + "\n");
console.log("\nPURCHASE OBSERVED");
console.log(`  tx          ${found.transactionHash}  (block ${found.block}, listing #${found.listingId}, token #${found.tokenId})`);
console.log(`  price       ${formatEther(BigInt(found.priceWei))} zkLTC`);
console.log(`  treasury    +${found.treasuryFeeZkLTC} zkLTC (0.25%)  live delta ${formatEther(BigInt(found.liveDeltas.treasuryWei))} zkLTC`);
console.log(`  seller      +${found.sellerProceedsZkLTC} zkLTC      live delta ${formatEther(BigInt(found.liveDeltas.sellerWei))} zkLTC`);
console.log(`  owner       ${found.owner}`);
console.log(`  archive     ${JSON.stringify(found.archive)}`);
console.log("\nnow run: node qa/first-real-nft-verify.mjs --verify");
