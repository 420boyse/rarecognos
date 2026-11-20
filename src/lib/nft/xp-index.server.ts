import {
  createPublicClient,
  http,
  isAddress,
  padHex,
  parseAbi,
  toEventSelector,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
import checkIn from "../../../config/checkin.json" with { type: "json" };
import legacy from "../../../config/liteforge.json" with { type: "json" };
import eyed from "../../../config/eyed.json" with { type: "json" };
import rogues from "../../../config/midnight-rogues.json" with { type: "json" };
import halo from "../../../config/halo.json" with { type: "json" };
import market from "../../../config/liteforge-market.json" with { type: "json" };
import { hasHello } from "./hello.server.ts";
import { walletScore } from "./xp.ts";

const client = createPublicClient({
  transport: http("https://rpc.testnet.liteforge.zeeve.net", { timeout: 8000, retryCount: 1 }),
});
const indexUrl = "https://explorer.testnet.liteforge.zeeve.net/api";
const collections = [legacy.collection, eyed.address, rogues.address, halo.address].filter(
  (address) => isAddress(address),
);
const checkedIn = toEventSelector("CheckedIn(address,uint256,uint256)");
const transferred = toEventSelector("Transfer(address,address,uint256)");
const listed = toEventSelector("Listed(uint256,address,address,uint256,uint256)");
const purchased = toEventSelector("Purchased(uint256,address)");
const settled = toEventSelector("SaleSettled(uint256,address,address,uint256,uint256,uint256)");
type Topics = readonly (Hex | null)[];
type Entry = { address: string; blockNumber: Hex; topics: Topics };

async function readPage(
  address: string,
  topics: Topics,
  first: number,
  last: number,
  signal?: AbortSignal,
): Promise<Entry[]> {
  const url = new URL(indexUrl);
  const params = new URLSearchParams({
    module: "logs",
    action: "getLogs",
    address,
    fromBlock: String(first),
    toBlock: String(last),
  });
  topics.forEach((topic, i) => {
    if (!topic) return;
    params.set("topic" + i, topic);
    for (let j = 0; j < i; j++) if (topics[j]) params.set(`topic${j}_${i}_opr`, "and");
  });
  url.search = params.toString();
  const timeout = AbortSignal.timeout(10000);
  const response = await fetch(url, {
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  if (!response.ok) throw Error("Event index unavailable");
  const page = await response.json();
  if (
    page.status === "0" &&
    page.message === "No logs found" &&
    Array.isArray(page.result) &&
    !page.result.length
  )
    return [];
  if (page.status !== "1" || !Array.isArray(page.result))
    throw Error("Incomplete event index response");
  for (const log of page.result as Entry[]) {
    if (
      log.address?.toLowerCase() !== address.toLowerCase() ||
      !Array.isArray(log.topics) ||
      topics.some((topic, i) => topic && log.topics[i]?.toLowerCase() !== topic.toLowerCase())
    )
      throw Error("Unexpected event index response");
  }
  return page.result;
}

// Blockscout caps a result at 1,000. Split inclusive block ranges so events
// sharing the boundary block are neither lost nor counted twice.
export async function* logPages(
  read: (from: number, to: number) => Promise<Entry[]>,
  from: number,
  to: number,
): AsyncGenerator<Entry[]> {
  const page = await read(from, to);
  if (page.length < 1000) {
    yield page;
    return;
  }
  if (from === to) throw Error("Event index truncated a single block");
  const middle = Math.floor((from + to) / 2);
  yield* logPages(read, from, middle);
  yield* logPages(read, middle + 1, to);
}

export async function readWalletScore(wallet: Address, signal?: AbortSignal) {
  const [head, hello] = await Promise.all([
    client.getBlock({ blockTag: "latest" }),
    hasHello(wallet).catch(() => null),
  ]);
  const lastBlock = Number(head.number);
  const today = Number(head.timestamp / 86400n);
  const last = await client.readContract({
    address: checkIn.address as Address,
    abi: parseAbi(["function lastDay(address) view returns(uint256)"]),
    functionName: "lastDay",
    args: [wallet],
    blockNumber: head.number,
  });
  return scoreFromEvents(
    wallet,
    lastBlock,
    today,
    Number(last),
    (address, topics, from, to) => readPage(address, topics, from, to, signal),
    hello,
  );
}

export async function scoreFromEvents(
  wallet: Address,
  lastBlock: number,
  today: number,
  lastCheckIn: number,
  read: (address: string, topics: Topics, from: number, to: number) => Promise<Entry[]>,
  hello: boolean | null = false,
) {
  const who = padHex(wallet);
  const page = (address: string, topics: Topics, from = 0, to = lastBlock) =>
    read(address, topics, from, to);
  async function has(address: string, topics: Topics) {
    return (await page(address, topics)).length > 0;
  }

  async function checkIns() {
    const topics = [checkedIn, who];
    const days = new Set<number>();
    for await (const batch of logPages(
      (from, to) => page(checkIn.address, topics, from, to),
      0,
      lastBlock,
    )) {
      for (const entry of batch) {
        const value = entry.topics[2];
        if (!value) throw Error("Missing check-in day");
        days.add(Number(BigInt(value)));
      }
    }
    // Include a confirmed check-in even while the explorer catches up.
    if (lastCheckIn > 0) days.add(lastCheckIn);
    return [...days];
  }

  async function collectionMilestones() {
    const flags = await Promise.all(
      collections.map(async (address) => {
        if (!(await has(address, [transferred, null, who]))) return { held: false, minted: false };
        return { held: true, minted: await has(address, [transferred, padHex(zeroAddress), who]) };
      }),
    );
    return { held: flags.some((f) => f.held), minted: flags.some((f) => f.minted) };
  }

  async function firstSale() {
    if (await has(legacy.market, [settled, null, who])) return true;
    // The newer contract indexes the seller on Listed and emits the ID on Purchased.
    // Cancelled escrow listings have no matching purchase.
    const topics = [listed, null, who];
    const sellerIds = new Set<Hex>();
    let firstListingBlock = lastBlock;
    for await (const batch of logPages(
      (from, to) => page(market.address, topics, from, to),
      0,
      lastBlock,
    )) {
      for (const entry of batch) {
        const id = entry.topics[1];
        if (!id) throw Error("Missing listing ID");
        sellerIds.add(id);
        firstListingBlock = Math.min(firstListingBlock, Number(BigInt(entry.blockNumber)));
      }
    }
    if (sellerIds.size <= 4) {
      return (
        await Promise.all([...sellerIds].map((id) => has(market.address, [purchased, id])))
      ).some(Boolean);
    }
    // For prolific sellers, join indexed purchases in batches instead of
    // issuing a separate explorer request for every cancelled listing.
    for await (const batch of logPages(
      (from, to) => page(market.address, [purchased], from, to),
      firstListingBlock,
      lastBlock,
    )) {
      if (batch.some((entry) => entry.topics[1] && sellerIds.has(entry.topics[1]))) return true;
    }
    return false;
  }
  const [days, collection, sold] = await Promise.all([
    checkIns(),
    collectionMilestones(),
    firstSale(),
  ]);
  return walletScore(days, collection.held, collection.minted, sold, today, hello);
}
