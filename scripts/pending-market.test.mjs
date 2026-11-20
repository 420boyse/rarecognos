import test from "node:test";
import assert from "node:assert/strict";
import { encodeFunctionData, parseAbi } from "viem";
import { matchesMarketPending } from "../src/lib/nft/pending-market.ts";
const market = "0x0000000000000000000000000000000000000011";
const collection = "0x0000000000000000000000000000000000000022";
const other = "0x0000000000000000000000000000000000000033";
const abi = parseAbi([
  "function list(address,uint256,bool,uint256)", "function buy(uint256)", "function cancel(uint256)",
  "function approve(address,uint256)", "function setApprovalForAll(address,bool)",
]);
const asset = { collection, id: "7", multi: false };
const record = (contract, functionName, args) => ({
  contract, data: encodeFunctionData({ abi, functionName, args }),
});
test("pending listing belongs to its token, collection and standard", () => {
  const r = record(market, "list", [collection, 7n, false, 1n]);
  assert.equal(matchesMarketPending(r, market, asset), true);
  for (const diff of [{ id: "8" }, { collection: other }, { multi: true }, { saleId: 7n }])
    assert.equal(matchesMarketPending(r, market, { ...asset, ...diff }), false);
  assert.equal(matchesMarketPending({ ...r, contract: other }, market, asset), false);
});
test("pending buy and cancel match the sale ID and market", () => {
  for (const action of ["buy", "cancel"]) {
    const r = record(market, action, [2n]);
    assert.equal(matchesMarketPending(r, market, { ...asset, saleId: 2n }), true);
    assert.equal(matchesMarketPending(r, market, { ...asset, saleId: 3n }), false);
    assert.equal(matchesMarketPending(r, market, asset), false);
  }
});
test("token approval and collection approval stay within their actual scope", () => {
  const r = record(collection, "approve", [market, 7n]);
  assert.equal(matchesMarketPending(r, market, asset), true);
  assert.equal(matchesMarketPending(r, market, { ...asset, id: "8" }), false);
  assert.equal(matchesMarketPending(record(collection, "approve", [other, 7n]), market, asset), false);
  const all = record(collection, "setApprovalForAll", [market, true]);
  assert.equal(matchesMarketPending(all, market, { ...asset, multi: true }), true);
  assert.equal(matchesMarketPending(all, market, asset), false);
  assert.equal(matchesMarketPending(all, market, { ...asset, multi: true, collection: other }), false);
  assert.equal(matchesMarketPending(record(collection, "setApprovalForAll", [market, false]), market, { ...asset, multi: true }), false);
  assert.equal(matchesMarketPending({ contract: market, data: "0x1234" }, market, asset), false);
});
