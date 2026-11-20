import test from "node:test";
import assert from "node:assert/strict";
import { padHex, toEventSelector, zeroAddress, type Hex } from "viem";
import { logPages, scoreFromEvents } from "./xp-index.server.ts";
import { walletScore } from "./xp.ts";
import checkIn from "../../../config/checkin.json" with { type: "json" };
import legacy from "../../../config/liteforge.json" with { type: "json" };
import eyed from "../../../config/eyed.json" with { type: "json" };
import rogues from "../../../config/midnight-rogues.json" with { type: "json" };
import market from "../../../config/liteforge-market.json" with { type: "json" };

const wallet = "0x0000000000000000000000000000000000000011",
  who = padHex(wallet),
  other = padHex("0x22"),
  id = padHex("0x01");
const transfer = toEventSelector("Transfer(address,address,uint256)");
const listing = toEventSelector("Listed(uint256,address,address,uint256,uint256)");
const purchase = toEventSelector("Purchased(uint256,address)");
const settlement = toEventSelector("SaleSettled(uint256,address,address,uint256,uint256,uint256)");
const check = toEventSelector("CheckedIn(address,uint256,uint256)");
const event = (address: string, topics: Hex[], blockNumber: Hex = "0x01") => ({
  address,
  topics,
  blockNumber,
});
type Row = ReturnType<typeof event>;
const score = (rows: Row[], last = 0) =>
  scoreFromEvents(wallet, 1000, 100, last, async (address, topics, from, to) =>
    rows.filter(
      (r) =>
        r.address === address &&
        Number(r.blockNumber) >= from &&
        Number(r.blockNumber) <= to &&
        topics.every((t, i) => !t || r.topics[i] === t),
    ),
  );

test("empty wallet, repeated days, yesterday's streak, gaps and UTC rollover", () => {
  assert.equal(walletScore([], false, false, false, 100).xp, 0);
  const s = walletScore([92, 98, 99, 99], false, false, false, 100);
  assert.equal(s.days, 3);
  assert.equal(s.streak, 2);
  assert.equal(s.xp, 80);
  assert.equal(walletScore([98, 99, 100], false, false, false, 100).streak, 3);
  assert.equal(walletScore([98], false, false, false, 100).streak, 0);
});
test("check-ins backfill the full history and the last on-chain day bridges indexing delay", async () => {
  const s = await score(
    [
      event(checkIn.address, [check, who, padHex("0x62")]),
      event(checkIn.address, [check, who, padHex("0x63")]),
      event(checkIn.address, [check, other, padHex("0x59")]),
    ],
    100,
  );
  assert.equal(s.days, 3);
  assert.equal(s.checkedToday, true);
  assert.equal(s.streak, 3);
});
test("a transfer earns hold once, a real mint earns a separate milestone on each supported collection", async () => {
  for (const address of [legacy.collection, eyed.address, rogues.address]) {
    const acquired = event(address, [transfer, other, who, id]),
      sent = event(address, [transfer, who, other, id]);
    const first = await score([acquired, sent]);
    assert.equal(first.held, true);
    assert.equal(first.minted, false);
    const mint = event(address, [transfer, padHex(zeroAddress), who, id]);
    const again = await score([mint, mint, acquired, sent]);
    assert.equal(again.xp, 300);
  }
});
test("cancellation, unfilled listings and another seller's purchase earn no seller XP", async () => {
  const rows = [
    event(market.address, [listing, id, who, other]),
    event(market.address, [purchase, padHex("0x02"), other]),
  ];
  assert.equal((await score(rows)).sold, false);
  assert.equal((await score([...rows, event(market.address, [purchase, id, other])])).sold, true);
  assert.equal((await score([event(legacy.market, [settlement, id, who, other])])).sold, true);
});
test("truncated pages split by block without skipping or duplicating a boundary", async () => {
  const entries = Array.from({ length: 1004 }, (_, i) =>
    event(checkIn.address, [check, who, id], ("0x" + Math.floor(i / 2).toString(16)) as Hex),
  );
  const out: Row[][] = [];
  for await (const batch of logPages(
    async (from, to) =>
      entries
        .filter((e) => Number(e.blockNumber) >= from && Number(e.blockNumber) <= to)
        .slice(0, 1000),
    0,
    501,
  ))
    out.push(batch as Row[]);
  assert.deepEqual(out.flat(), entries);
});
test("an index outage never presents a zero wallet balance", async () => {
  await assert.rejects(
    scoreFromEvents(wallet, 10, 100, 0, async () => {
      throw Error("Unavailable");
    }),
    /Unavailable/,
  );
});
