// Keyless flow simulator for the LiteForge 4441 RareCognos NFT test.
// Uses eth_call / eth_estimateGas only. It never constructs, signs or broadcasts a transaction,
// never touches a private key, and never asks a wallet for a signature.
import fs from "node:fs";
import {
  createPublicClient,
  http,
  encodeFunctionData,
  formatEther,
  keccak256,
  toHex,
} from "viem";

const RPC = "https://rpc.testnet.liteforge.zeeve.net";
const cfg = JSON.parse(fs.readFileSync("config/liteforge.json", "utf8"));
const nftAbi = JSON.parse(fs.readFileSync("artifacts/RareCognos.json", "utf8")).abi;
const mktAbi = JSON.parse(fs.readFileSync("artifacts/RareCognosMarket.json", "utf8")).abi;
const client = createPublicClient({ transport: http(RPC, { timeout: 30_000, retryCount: 0 }) });

const SELLER = "0xfFd9618E19Fb7f74169f75343550E14b74d19CB3";
const BUYER = "0xfeb935dc86d5549e2a61003dd5f2d52f6f840811";
const TREASURY = "0x06e53D74751392ee4aC7139f611B8db3f98591f9";

const out = { generatedAt: new Date().toISOString(), rpc: RPC, mode: "keyless eth_call + eth_estimateGas" };
const gasPrice = await client.getGasPrice();
out.gasPriceWei = gasPrice.toString();
out.feeFormula = "fee = floor(price * 25 / 10000); proceeds = price - fee";

const run = async (label, { to, data, from, value = 0n }) => {
  const entry = { from, to, value: value.toString(), calldata: data.slice(0, 74) + "…" };
  try {
    const gas = await client.estimateGas({ account: from, to, data, value });
    entry.gasUsed = gas.toString();
    entry.txEthCostWei = (gas * gasPrice).toString();
    entry.txEthCost = formatEther(gas * gasPrice) + " zkLTC";
    await client.call({ account: from, to, data, value });
    entry.simulation = "PASS (no revert)";
  } catch (e) {
    entry.simulation = "FAIL";
    entry.error = String(e.shortMessage || e.message).slice(0, 220);
  }
  out[label] = entry;
  console.log(`${entry.simulation === "PASS (no revert)" ? "OK  " : "ERR "} ${label.padEnd(34)} ${entry.gasUsed ? entry.gasUsed + " gas ≈ " + entry.txEthCost : entry.error}`);
  return entry;
};

// Live state first
const count = await client.readContract({ address: cfg.market, abi: mktAbi, functionName: "count" });
const active = await client.readContract({ address: cfg.market, abi: mktAbi, functionName: "activeListing", args: [1n] });
const listing = await client.readContract({ address: cfg.market, abi: mktAbi, functionName: "listings", args: [active] });
const nextId = await client.readContract({ address: cfg.collection, abi: nftAbi, functionName: "nextId" });
const treasuryCode = await client.getBytecode({ address: TREASURY });
const sellerCode = await client.getBytecode({ address: SELLER });
const buyerCode = await client.getBytecode({ address: BUYER });
out.state = {
  nextTokenId: (nextId + 1n).toString(),
  listingCount: count.toString(),
  activeListingIdForToken1: active.toString(),
  activeListing: { id: active.toString(), seller: listing[0], tokenId: listing[1].toString(), priceWei: listing[2].toString(), isActive: listing[3] },
  receiversAreEOA: { treasury: !treasuryCode, seller: !sellerCode, buyer: !buyerCode },
};
console.log(`\nchain state: next token #${out.state.nextTokenId}, active listing #${active} @ ${formatEther(listing[2])} zkLTC, listing count ${count}`);
console.log(`EOA check (must receive native): treasury=${!treasuryCode} seller=${!sellerCode} buyer=${!buyerCode}\n`);

// 1) Mint a NEW uri. Deliberately a synthetic uri that is not the pinned one, to avoid claiming
// an edition slot; simulation only, so nothing is written on chain.
const probeUri = "ipfs://bafkreiqavalueprobeforreadonlysimulation0000000000000000000000";
out.probeUriAlreadyMinted = (await client.readContract({
  address: cfg.collection, abi: nftAbi, functionName: "tokenForURI", args: [keccak256(toHex(probeUri))],
})).toString();
await run("mint (seller, new uri)", { to: cfg.collection, data: encodeFunctionData({ abi: nftAbi, functionName: "mint", args: [probeUri] }), from: SELLER });

// 2) setApprovalForAll / approve for the existing token #1
await run("approve token#1 -> market (seller)", { to: cfg.collection, data: encodeFunctionData({ abi: nftAbi, functionName: "approve", args: [cfg.market, 1n] }), from: SELLER });

// 3) List token #1 at the recommended price
for (const priceEth of ["0.01", "0.001", "0.0001"]) {
  const price = BigInt(Math.round(Number(priceEth) * 1e18));
  const fee = (price * 25n) / 10000n;
  const label = `list token#1 @ ${priceEth} zkLTC`;
  if (label.includes("0.01")) await run(label, { to: cfg.market, data: encodeFunctionData({ abi: mktAbi, functionName: "list", args: [1n, price] }), from: SELLER });
  out["price_" + priceEth] = { priceWei: price.toString(), treasuryFeeWei: fee.toString(), treasuryFee: formatEther(fee), sellerProceedsWei: (price - fee).toString(), nonzeroFee: fee > 0n };
}

// 4) Cancel the active listing
await run("cancel active listing", { to: cfg.market, data: encodeFunctionData({ abi: mktAbi, functionName: "cancel", args: [active] }), from: SELLER });

// 5) BUY the live listing #3 at the exact price (this is the pending user approval)
const price = listing[2];
await run(`buy listing #${active} @ ${formatEther(price)}`, { to: cfg.market, data: encodeFunctionData({ abi: mktAbi, functionName: "buy", args: [active, price] }), from: BUYER, value: price });

// Wrong-caller guards (must revert)
await (async () => {
  const e = await run("guard: buyer cancels (expect revert)", { to: cfg.market, data: encodeFunctionData({ abi: mktAbi, functionName: "cancel", args: [active] }), from: BUYER });
  e.expected = "revert"; e.correct = e.simulation === "FAIL";
})();
await (async () => {
  const e = await run("guard: buy with wrong price (expect revert)", { to: cfg.market, data: encodeFunctionData({ abi: mktAbi, functionName: "buy", args: [active, price - 1n] }), from: BUYER, value: price });
  e.expected = "revert"; e.correct = e.simulation === "FAIL";
})();

// Buyer funding adequacy
const buyerBal = await client.getBalance({ address: BUYER });
const buyEntry = out[`buy listing #${active} @ ${formatEther(price)}`];
out.buyerFunding = {
  balanceWei: buyerBal.toString(), balance: formatEther(buyerBal),
  neededWei: (price + BigInt(buyEntry.gasUsed || 0) * gasPrice).toString(),
  sufficient: buyEntry.simulation?.startsWith("PASS") && buyerBal > price,
};
console.log(`\nbuyer balance ${formatEther(buyerBal)} zkLTC; needs ${formatEther(price)} + gas`);

// Price recommendation table
out.minimumPriceForNonzeroFee = { explanation: "floor(price*25/10000) >= 1 wei", minimumPriceWei: "400", minimumPriceZkLTC: "4e-16" };
out.recommendedPrice = { value: "0.01", unit: "zkLTC", wei: "10000000000000000", treasuryFeeWei: "25000000000000", treasuryFeeZkLTC: "0.000025", sellerProceedsZkLTC: "0.009975", reason: "matches the already-listed active listing #3; fee is 25,000,000,000,000 wei, clearly nonzero and measurable by balance delta" };
const maxGas = BigInt(buyEntry.gasUsed || 0);
out.buyerGasHeadroom = { buyGas: maxGas.toString(), gasCostZkLTC: formatEther(maxGas * gasPrice), note: "gas is ~1000x smaller than the price at 10 wei/gas base fee" };

fs.mkdirSync("qa", { recursive: true });
fs.writeFileSync("qa/nft-flow-simulation.json", JSON.stringify(out, null, 2) + "\n");
console.log("\nwrote qa/nft-flow-simulation.json");
