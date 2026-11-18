// Read-only LiteForge health/contract history check. No wallet, key, signature or transaction writes.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const deployment = JSON.parse(readFileSync(new URL("../config/liteforge.json", import.meta.url)));
const rpcUrl = "https://rpc.testnet.liteforge.zeeve.net/";
const historicalBuyHash = "0xfa68d8c01640a99d4f0512d238c4094d75b9ad87a15152af375f3ad35c6846d8";
let nextId = 0;
async function request(method, params = []) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: ++nextId, method, params }),
        signal: AbortSignal.timeout(14000),
      });
      assert.equal(response.ok, true, `HTTP ${response.status} for ${method}`);
      const body = await response.json();
      if (body.error) throw Error(`${method}: ${JSON.stringify(body.error)}`);
      return body.result;
    } catch (error) {
      if (attempt >= 3) throw error;
      console.warn(`Retrying ${method} after transient RPC failure (attempt ${attempt}/3): ${String(error)}`);
    }
  }
}

const id = parseInt(await request("eth_chainId"), 16);
assert.equal(id, 4441, `Unexpected chain ID: ${id}`);
console.log("PASS LiteForge RPC responds with chain ID 4441");
const height = parseInt(await request("eth_blockNumber"), 16);
assert(Number.isInteger(height) && height > 70062538, `Invalid block height: ${height}`);
console.log("PASS block height =", height);

for (const [label, address] of [["NFT collection", deployment.collection], ["Marketplace", deployment.market]]) {
  const code = await request("eth_getCode", [address, "latest"]);
  assert.match(code, /^0x[0-9a-f]+$/i);
  assert(code.length > 100, `${label}: missing contract bytecode`);
  console.log(`PASS ${label} contract bytecode exists at ${address}`);
}

const call = "0x6352211e" + 1n.toString(16).padStart(64, "0"); // ERC-721 ownerOf(1)
const ownerValue = await request("eth_call", [{ to: deployment.collection, data: call }, "latest"]);
assert.match(ownerValue, /^0x[0-9a-f]{64}$/i);
const owner = "0x" + ownerValue.slice(-40);
assert.notEqual(owner.toLowerCase(), "0x0000000000000000000000000000000000000000");
console.log("PASS on-chain ERC-721 ownerOf(1) =", owner);

const tx = await request("eth_getTransactionByHash", [historicalBuyHash]);
assert(tx, "Previously verified buy transaction not found");
assert.equal(tx.to.toLowerCase(), deployment.market.toLowerCase());
console.log("PASS historical buy transaction points to RareCognos marketplace");

const receipt = await request("eth_getTransactionReceipt", [historicalBuyHash]);
assert(receipt, "Historical receipt not available from public RPC");
assert.equal(receipt.status, "0x1", "The recorded buy transaction reverted");
assert.equal(receipt.to.toLowerCase(), deployment.market.toLowerCase());
assert(receipt.logs?.some((log) => log.address.toLowerCase() === deployment.collection.toLowerCase()), "No collection events in buy receipt");
assert(receipt.logs?.some((log) => log.address.toLowerCase() === deployment.market.toLowerCase()), "No marketplace events in buy receipt");
console.log("PASS historical 0.01 zkLTC purchase succeeded with collection and market logs");
console.log("Read-only RPC acceptance passed. No testnet transactions were sent.");
