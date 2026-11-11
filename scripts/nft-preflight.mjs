// LiteForge testnet preflight — KEYLESS dry-run. Reads chain state and local build inputs only.
// Signs nothing, spends nothing, never touches private keys.
// Exit codes: 0 = ready to deploy, 1 = not ready. Verdict written to qa/preflight-verdict.json.
import fs from "node:fs";
import {
  createPublicClient,
  http,
  formatEther,
  isAddress,
  encodeDeployData,
  getContractAddress,
  zeroAddress,
} from "viem";

const RPC = "https://rpc.testnet.liteforge.zeeve.net";
const CHAIN_ID = 4441;
const DEPLOY_CONFIG = "config/liteforge.json";
// This mode accepts only a public address and uses eth_call / eth_estimateGas; it never signs.
const walletReadiness = process.argv.includes("--wallet-readiness");
const GENESIS_HASH = "0x81df94cf6403fe935f6ef464f3e38c45510eefbfbab137c288a9b660be0b7fda";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pad = (s) => ({ pass: "PASS ", warn: "WARN ", fail: "FAIL ", info: "INFO " })[s] || "     ";
const checks = [];
const add = (id, title, status, detail) => {
  checks.push({ id, title, status, detail });
  console.log(`${pad(status)}${title} — ${detail}`);
};

const client = createPublicClient({ transport: http(RPC, { timeout: 20000 }) });

// 1. Chain identity over RPC
let chainId = null;
try {
  chainId = parseInt(await client.request({ method: "eth_chainId" }), 16);
  add(
    "chain-id",
    "RPC chain id matches config",
    chainId === CHAIN_ID ? "pass" : "fail",
    `eth_chainId=${chainId} (expected ${CHAIN_ID})`,
  );
} catch (e) {
  add(
    "chain-id",
    "RPC chain id matches config",
    "fail",
    `RPC unreachable: ${String(e.message).slice(0, 140)}`,
  );
}

if (chainId === CHAIN_ID) {
  if (walletReadiness) {
    try {
      const genesis = await client.getBlock({ blockNumber: 0n });
      add(
        "genesis",
        "Genesis hash matches known LiteForge history",
        genesis.hash === GENESIS_HASH ? "pass" : "fail",
        `hash=${genesis.hash}`,
      );
    } catch (e) {
      add(
        "genesis",
        "Genesis hash matches known LiteForge history",
        "fail",
        String(e.message).slice(0, 140),
      );
    }
  }
  // 2. Chain is alive and producing blocks
  try {
    const a = parseInt(await client.request({ method: "eth_blockNumber" }), 16);
    await sleep(4000);
    const b = parseInt(await client.request({ method: "eth_blockNumber" }), 16);
    add(
      "block-advance",
      "Chain head liveness",
      b > a ? "pass" : "warn",
      b > a
        ? `block ${a} → ${b}`
        : `head stable at ${b} during sampling (idle/lazy block production possible; RPC responsive)`,
    );
  } catch (e) {
    add("block-advance", "Chain is producing blocks", "fail", String(e.message).slice(0, 140));
  }
  // 3. Fees are deployable
  try {
    const gp = BigInt(await client.request({ method: "eth_gasPrice" }));
    const fh = await client.request({ method: "eth_feeHistory", params: ["0x3", "latest", [50]] });
    const base = BigInt(fh.baseFeePerGas[0]);
    const reward = BigInt(fh.reward?.[0]?.[0] ?? 0);
    add(
      "fees",
      "Gas price sane for testnet deploy",
      gp > 0n && gp <= 20000000000n ? "pass" : "warn",
      `gasPrice=${gp} wei (${formatEther(gp)} zkLTC), baseFee=${base} wei, 50% reward=${reward} wei`,
    );
  } catch (e) {
    add("fees", "Gas price sane for testnet deploy", "warn", String(e.message).slice(0, 140));
  }
}

// 4. Deployer account (optional, keyless)
const deployer = process.env.DEPLOYER_ADDRESS?.trim();
if (deployer && isAddress(deployer)) {
  try {
    const bal = await client.getBalance({ address: deployer });
    const nonce = await client.getTransactionCount({ address: deployer });
    const code = await client.getBytecode({ address: deployer });
    const eoa = !code || code === "0x";
    add(
      "deployer-balance",
      "Deployer balance funded",
      bal > 0n ? "pass" : "fail",
      `${formatEther(bal)} zkLTC at ${deployer}`,
    );
    add(
      "deployer-eoa",
      "Deployer is an EOA",
      eoa ? "pass" : "fail",
      `code=${(code || "0x").slice(0, 10)}, nonce=${nonce}`,
    );
  } catch (e) {
    add("deployer-balance", "Deployer balance funded", "fail", String(e.message).slice(0, 140));
  }
} else {
  add(
    "deployer",
    "Deployer address provided (DEPLOYER_ADDRESS)",
    deployer || walletReadiness ? "fail" : "warn",
    deployer
      ? "invalid public address"
      : "not set — balance check skipped; provide a public DEPLOYER_ADDRESS before deploying",
  );
}

if (walletReadiness && chainId === CHAIN_ID && deployer && isAddress(deployer)) {
  try {
    const treasury = process.env.TREASURY_ADDRESS?.trim();
    if (!treasury || !isAddress(treasury) || treasury.toLowerCase() === zeroAddress)
      throw Error('Provide a valid nonzero public TREASURY_ADDRESS for market deployment simulation');
    const [nft, market, nonce, balance, gasPrice] = await Promise.all([
      fs.promises.readFile("artifacts/RareCognos.json", "utf8").then(JSON.parse),
      fs.promises.readFile("artifacts/RareCognosMarket.json", "utf8").then(JSON.parse),
      client.getTransactionCount({ address: deployer, blockTag: "pending" }),
      client.getBalance({ address: deployer }),
      client.getGasPrice(),
    ]);
    const predictedCollection = getContractAddress({ from: deployer, nonce: BigInt(nonce) });
    const nftData = encodeDeployData({ abi: nft.abi, bytecode: nft.bytecode, args: [] });
    const marketData = encodeDeployData({
      abi: market.abi,
      bytecode: market.bytecode,
      args: [predictedCollection, treasury],
    });
    // The collection is not deployed yet; the constructor only stores its predicted address.
    await client.call({ account: deployer, data: nftData });
    await client.call({ account: deployer, data: marketData });
    const nftGas = await client.estimateGas({ account: deployer, data: nftData });
    const marketGas = await client.estimateGas({ account: deployer, data: marketData });
    const estimated = (nftGas + marketGas) * gasPrice;
    const enough = balance >= estimated;
    add(
      "deploy-simulation",
      "Keyless creation simulations and estimates",
      "pass",
      `collection=${nftGas} gas, market=${marketGas} gas, predicted collection=${predictedCollection}; prediction assumes unchanged nonce`,
    );
    add(
      "deploy-funding",
      "Balance covers both estimated deployments",
      enough ? "pass" : "fail",
      `balance=${formatEther(balance)} zkLTC, estimated=${formatEther(estimated)} zkLTC at ${gasPrice} wei/gas; 2x margin=${balance >= estimated * 2n ? "yes" : "no"}`,
    );
    if (enough && balance < estimated * 2n)
      add(
        "funding-margin",
        "Two-times funding margin",
        "warn",
        "balance is below twice the current estimate",
      );
  } catch (e) {
    add(
      "deploy-simulation",
      "Keyless creation simulations and estimates",
      "fail",
      `could not complete: ${String(e.shortMessage || e.message).slice(0, 200)}`,
    );
  }
}

// 5. Compiled artifacts + standard-json compiler input
try {
  const nft = JSON.parse(fs.readFileSync("artifacts/RareCognos.json", "utf8"));
  const market = JSON.parse(fs.readFileSync("artifacts/RareCognosMarket.json", "utf8"));
  const okNft =
    typeof nft.bytecode === "string" &&
    nft.bytecode.length > 2 &&
    nft.abi?.some((f) => f.name === "mint");
  const okMkt =
    typeof market.bytecode === "string" &&
    market.bytecode.length > 2 &&
    ["list", "buy", "cancel"].every((f) => market.abi?.some((x) => x.name === f));
  add(
    "artifacts",
    "Compiled artifacts present (npm run nft:compile)",
    okNft && okMkt ? "pass" : "fail",
    `RareCognos.bytecode ${(nft.bytecode?.length ?? 0) / 2 - 1} bytes, market abi list/buy/cancel ${okMkt ? "found" : "MISSING"}`,
  );
  const ci = JSON.parse(fs.readFileSync("artifacts/compiler-input.json", "utf8"));
  add(
    "compiler-input",
    "Standard-json compiler input available (verification prep)",
    ci.sources?.["RareCognos.sol"] ? "pass" : "fail",
    `sources=${Object.keys(ci.sources || {}).length}, evmVersion=${ci.settings?.evmVersion}, optimizerRuns=${ci.settings?.optimizer?.runs}`,
  );
} catch (e) {
  add(
    "artifacts",
    "Compiled artifacts present (npm run nft:compile)",
    "fail",
    `missing or invalid — run "npm run nft:compile" first (${String(e.message).slice(0, 110)})`,
  );
}

// 6. Deployment config state
try {
  const dep = JSON.parse(fs.readFileSync(DEPLOY_CONFIG, "utf8"));
  if (dep.chainId !== CHAIN_ID) {
    add("config-chain", `${DEPLOY_CONFIG} chainId`, "fail", `${dep.chainId} != ${CHAIN_ID}`);
  } else {
    const have = !!dep.collection && !!dep.market;
    add(
      "config-chain",
      `${DEPLOY_CONFIG} chainId`,
      "pass",
      `chainId=${dep.chainId}, schemaVersion=${dep.schemaVersion}`,
    );
    add(
      "config-deployed",
      `${DEPLOY_CONFIG} deployment state`,
      "info",
      have
        ? `collection=${dep.collection}, market=${dep.market}, verified=${dep.verified}`
        : "collection/market are null — expected before the first deployment",
    );
    if (have && !dep.verified) {
      add(
        "config-verified",
        "Explorer verification flag",
        "warn",
        "addresses recorded but verified=false — complete contract verification, then set verified=true",
      );
    }
  }
} catch (e) {
  add("config-chain", `${DEPLOY_CONFIG} readable`, "fail", String(e.message).slice(0, 110));
}

// 7. App-side chain config agrees with the network
try {
  const src = fs.readFileSync("src/lib/nft/config.ts", "utf8");
  const hasChain = /id:\s*4441/.test(src);
  const hasGate = /deployment\.verified/.test(src);
  const hasRpc = src.includes(RPC);
  add(
    "app-gate",
    "App chain config matches the network",
    hasChain && hasGate && hasRpc ? "pass" : "fail",
    `chain 4441:${hasChain}, verified gate:${hasGate}, rpc url match:${hasRpc}`,
  );
} catch (e) {
  add("app-gate", "App chain config matches the network", "fail", String(e.message).slice(0, 110));
}

const ready = !checks.some((c) => c.status === "fail");
const verdict = {
  generatedAt: new Date().toISOString(),
  rpc: RPC,
  chainId,
  mode: walletReadiness ? "wallet-readiness" : "network-preflight",
  treasuryAddress: walletReadiness ? process.env.TREASURY_ADDRESS?.trim() || null : null,
  ready,
  checks,
};
const verdictPath = walletReadiness
  ? "qa/wallet-readiness-verdict.json"
  : "qa/preflight-verdict.json";
fs.mkdirSync("qa", { recursive: true });
fs.writeFileSync(verdictPath, JSON.stringify(verdict, null, 2));
console.log(`\nverdict written to ${verdictPath}`);
if (!walletReadiness && !deployer)
  console.log("Network-only result: deployer funding and deployment simulation were not checked.");
if (walletReadiness)
  console.log(
    "Read-only estimates only; live deployment and explorer verification remain untested.",
  );
console.log(ready ? "\nPREFLIGHT RESULT: READY" : "\nPREFLIGHT RESULT: NOT READY");
process.exit(ready ? 0 : 1);
