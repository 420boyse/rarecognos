import { createPublicClient, http } from "viem";

const RPC = "https://rpc.testnet.liteforge.zeeve.net";
const EXPLORER = "https://explorer.testnet.liteforge.zeeve.net";
const client = createPublicClient({ transport: http(RPC, { timeout: 30000 }) });

console.log("=== Zeeve LiteForge Testnet Verification ===");
try {
  const [chainId, blockNum, gasPrice] = await Promise.all([
    client.request({ method: "eth_chainId" }),
    client.request({ method: "eth_blockNumber" }),
    client.request({ method: "eth_gasPrice" }),
  ]);
  console.log(`chainId: ${chainId} (${parseInt(chainId,16)})`);
  console.log(`blockNumber: ${blockNum} (${parseInt(blockNum,16)})`);
  console.log(`gasPrice: ${gasPrice}`);

  const block = await client.getBlock({ blockTag: "latest", includeTransactions: false });
  console.log(`latest: number=${block.number} timestamp=${block.timestamp} hash=${block.hash.slice(0,18)}...`);
  console.log(`miner=${block.miner} difficulty=${block.difficulty} totalDifficulty=${block.totalDifficulty}`);

  const explorerApi = `${EXPLORER}/api/v1/blocks?sort=-number&limit=1`;
  const resp = await fetch(explorerApi, { headers: { "Accept": "application/json" } });
  console.log(`explorer API status: ${resp.status}`);
  if (resp.ok) {
    const data = await resp.json();
    console.log("explorer block count field:", Object.keys(data).slice(0,5));
  }
} catch (e) {
  console.log("ERROR:", e.message.slice(0, 200));
}