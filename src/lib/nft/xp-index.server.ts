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
import expansion from "../../../config/midnight-rogues-expansion.json" with { type: "json" };
import rogues from "../../../config/midnight-rogues.json" with { type: "json" };
import halo from "../../../config/halo.json" with { type: "json" };
import market from "../../../config/liteforge-market.json" with { type: "json" };
import { redisCommand, redisConfig } from "./redis.server.ts";
import { hasHello } from "./hello.server.ts";
import { walletScore } from "./xp.ts";

const client = createPublicClient({
  transport: http("https://rpc.testnet.liteforge.zeeve.net", { timeout: 8000, retryCount: 1 }),
});
const indexUrl = "https://explorer.testnet.liteforge.zeeve.net/api";
const collections = [legacy.collection, eyed.address, expansion.address, rogues.address, halo.address].filter(
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

type History = { days: number[]; held: boolean; minted: boolean; sold: boolean; listings: Hex[] };
type Checkpoint = { block: number; hash: Hex; history: History };
type ReadLogs = (address: string, topics: Topics, from: number, to: number) => Promise<Entry[]>;
const emptyHistory: History = { days: [], held: false, minted: false, sold: false, listings: [] };
const recent = new Map<string, Checkpoint>();

export async function advanceHistory(
  wallet: Address,
  from: number,
  to: number,
  read: ReadLogs,
  prior = emptyHistory,
): Promise<History> {
  if (from > to) return prior;
  const who = padHex(wallet);
  const page = (address: string, topics: Topics) => read(address, topics, from, to);
  const has = async (address: string, topics: Topics) => (await page(address, topics)).length > 0;
  async function checkIns() {
    const days = new Set(prior.days);
    for await (const batch of logPages(
      (a, b) => read(checkIn.address, [checkedIn, who], a, b),
      from,
      to,
    )) {
      for (const entry of batch) {
        if (!entry.topics[2]) throw Error("Missing check-in day");
        days.add(Number(BigInt(entry.topics[2])));
      }
    }
    return [...days];
  }
  async function milestones() {
    if (prior.minted) return { held: true, minted: true };
    const flags = await Promise.all(
      collections.map(async (address) => {
        if (!prior.held && !(await has(address, [transferred, null, who])))
          return { held: false, minted: false };
        return { held: true, minted: await has(address, [transferred, padHex(zeroAddress), who]) };
      }),
    );
    return { held: prior.held || flags.some((f) => f.held), minted: flags.some((f) => f.minted) };
  }
  async function sales() {
    if (prior.sold || (await has(legacy.market, [settled, null, who])))
      return { sold: true, listings: [] };
    const ids = new Set(prior.listings);
    for await (const batch of logPages(
      (a, b) => read(market.address, [listed, null, who], a, b),
      from,
      to,
    )) {
      for (const entry of batch) {
        if (!entry.topics[1]) throw Error("Missing listing ID");
        ids.add(entry.topics[1]);
      }
    }
    if (ids.size <= 4) {
      if (
        (await Promise.all([...ids].map((id) => has(market.address, [purchased, id])))).some(
          Boolean,
        )
      )
        return { sold: true, listings: [] };
    } else {
      for await (const batch of logPages(
        (a, b) => read(market.address, [purchased], a, b),
        from,
        to,
      )) {
        if (batch.some((e) => e.topics[1] && ids.has(e.topics[1])))
          return { sold: true, listings: [] };
      }
    }
    return { sold: false, listings: [...ids] };
  }
  const [days, assets, sale] = await Promise.all([checkIns(), milestones(), sales()]);
  return { days, ...assets, ...sale };
}

function scored(history: History, lastDay: number, today: number, hello: boolean | null) {
  const days = lastDay > 0 ? [...history.days, lastDay] : history.days;
  return walletScore(days, history.held, history.minted, history.sold, today, hello);
}

export async function scoreFromEvents(
  wallet: Address,
  block: number,
  today: number,
  lastDay: number,
  read: ReadLogs,
  hello: boolean | null = false,
) {
  return scored(await advanceHistory(wallet, 0, block, read), lastDay, today, hello);
}

async function loadCheckpoint(key: string) {
  const local = recent.get(key);
  if (local) return local;
  if (redisConfig()) {
    try {
      const json = await redisCommand<string | null>(["GET", key]);
      if (json) return JSON.parse(json) as Checkpoint;
    } catch {
      /* Read the chain if storage is unavailable. */
    }
  }
}

export async function readWalletScore(wallet: Address, signal?: AbortSignal) {
  const key = "rarecognos:xp:4441:v2:" + wallet.toLowerCase();
  const read: ReadLogs = (address, topics, from, to) => readPage(address, topics, from, to, signal);
  const [head, hello, previous] = await Promise.all([
    client.getBlock({ blockTag: "latest" }),
    hasHello(wallet).catch(() => null),
    loadCheckpoint(key),
  ]);
  const block = Number(head.number);
  const lastDay = await client.readContract({
    address: checkIn.address as Address,
    abi: parseAbi(["function lastDay(address) view returns(uint256)"]),
    functionName: "lastDay",
    args: [wallet],
    blockNumber: head.number,
  });
  let checkpoint = previous;
  if (
    checkpoint &&
    (checkpoint.block > block ||
      (await client.getBlock({ blockNumber: BigInt(checkpoint.block) })).hash !== checkpoint.hash)
  )
    checkpoint = undefined;
  // Keep recent events outside the checkpoint while the explorer catches up.
  const boundary = Math.floor(block / 2048) * 2048 - 2048;
  if (boundary > (checkpoint?.block ?? -1)) {
    const indexed = await fetch(indexUrl.replace(/\/api$/, "/api/v2/blocks/") + boundary, {
      signal: AbortSignal.timeout(4000),
    })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    const anchor = await client.getBlock({ blockNumber: BigInt(boundary) });
    if (indexed?.hash === anchor.hash) {
      const history = await advanceHistory(
        wallet,
        (checkpoint?.block ?? -1) + 1,
        boundary,
        read,
        checkpoint?.history,
      );
      checkpoint = { block: boundary, hash: anchor.hash, history };
      recent.set(key, checkpoint);
      if (recent.size > 256) recent.delete(recent.keys().next().value!);
      if (redisConfig())
        await redisCommand(["SET", key, JSON.stringify(checkpoint), "EX", 604800]).catch(() => {});
    }
  }
  const current = await advanceHistory(
    wallet,
    (checkpoint?.block ?? -1) + 1,
    block,
    read,
    checkpoint?.history,
  );
  return scored(current, Number(lastDay), Number(head.timestamp / 86400n), hello);
}
