import assert from "node:assert/strict";
import test from "node:test";
import { encodeEventTopics, parseAbi } from "viem";
import { editionReceipt } from "../src/lib/nft/edition-receipt.ts";

const contract = "0x0000000000000000000000000000000000000001";
const wallet = "0x0000000000000000000000000000000000000002";
const other = "0x0000000000000000000000000000000000000003";
const abi = parseAbi(["event PieceMinted(address indexed collector, uint256 indexed piece, uint256 indexed tokenId)"]);
const mintLog = (address, collector, piece, tokenId) => ({
  address, data: "0x",
  topics: encodeEventTopics({ abi, eventName: "PieceMinted", args: { collector, piece, tokenId } }),
});
const hash = "0x" + "11".repeat(32);
test("a receipt identifies the minted edition from the collector and contract in the event", () => {
  const receipt = { status: "success", transactionHash: hash, logs: [
    mintLog(other, wallet, 0n, 1n), mintLog(contract, other, 2n, 201n), mintLog(contract, wallet, 1n, 101n),
  ] };
  assert.deepEqual(editionReceipt(receipt, contract, wallet), { hash, contract, wallet, piece: 1, tokenId: "101" });
});
test("a confirmed transaction remains confirmed without an identifiable edition", () => {
  const receipt = { status: "success", transactionHash: hash, logs: [] };
  assert.deepEqual(editionReceipt(receipt, contract, wallet), { hash, contract, wallet, piece: undefined, tokenId: undefined });
});
test("a reverted mint never produces a success receipt", () => {
  assert.throws(() => editionReceipt({ status: "reverted", transactionHash: hash, logs: [] }, contract, wallet), /reverted/);
});
