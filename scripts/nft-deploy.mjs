// LiteForge testnet deployer — sends REAL transactions. Gated behind two env controls and never
// executed automatically. The private key is read from the environment only, never printed, never
// written to disk, and is redacted from every error message.
//
// Usage:
//   export NFT_DEPLOYER_KEY=<funded testnet private key>
//   export LITEFORGE_DEPLOY_CONFIRM=YES
//   npm run nft:deploy [-- --dry-run | -- --write-config] [-- --collection 0x.. for verify-prep]
//
//   --dry-run       simulate + estimate both deployments, send nothing (requires the key env to
//                   rehearse the exact flow, but not the confirm env)
//   --write-config  after success, record addresses + tx hashes in config/liteforge.json
//                   (verified stays false until explorer verification)
import fs from "node:fs";
import {
  createPublicClient,
  createWalletClient,
  http,
  defineChain,
  encodeDeployData,
  formatEther,
  isAddress,
  zeroAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const RPC = "https://rpc.testnet.liteforge.zeeve.net";
const CHAIN_ID = 4441;
const chain = defineChain({
  id: CHAIN_ID,
  name: "LitVM LiteForge",
  nativeCurrency: { name: "zkLTC", symbol: "zkLTC", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
  blockExplorers: {
    default: { name: "LiteForge Explorer", url: "https://explorer.testnet.liteforge.zeeve.net" },
  },
});
const dryRun = process.argv.includes("--dry-run");
const writeConfig = process.argv.includes("--write-config");
const key = process.env.NFT_DEPLOYER_KEY?.trim();
const confirmed = process.env.LITEFORGE_DEPLOY_CONFIRM === "YES";

if (!key || (!confirmed && !dryRun)) {
  console.error(`This script sends REAL transactions on LiteForge testnet (chain ${CHAIN_ID}).
It is deliberately gated behind two controls:

  1. export NFT_DEPLOYER_KEY=<funded testnet private key>   # env only; never commit, never print
  2. export LITEFORGE_DEPLOY_CONFIRM=YES                    # explicit confirmation
  3. npm run nft:deploy [--write-config]                    # add --dry-run to send nothing

Pre-send safety is built in: chain-id check, deployment simulation, gas + balance
estimates, and a balance margin warning before each transaction.`);
  process.exit(1);
}

const clean = (m) => (key ? String(m).split(key).join("<redacted>") : String(m));

const main = async () => {
  const treasury = process.env.TREASURY_ADDRESS?.trim();
  if (!treasury || !isAddress(treasury) || treasury.toLowerCase() === zeroAddress)
    throw Error('Set TREASURY_ADDRESS to a valid nonzero public treasury address');
  const nft = JSON.parse(fs.readFileSync("artifacts/RareCognos.json", "utf8"));
  const market = JSON.parse(fs.readFileSync("artifacts/RareCognosMarket.json", "utf8"));
  const account = privateKeyToAccount(key);
  const client = createPublicClient({ chain, transport: http(RPC, { timeout: 60000 }) });
  const wallet = createWalletClient({ account, chain, transport: http(RPC, { timeout: 60000 }) });

  const remote = parseInt(await client.request({ method: "eth_chainId" }), 16);
  if (remote !== CHAIN_ID) throw Error(`RPC chain id ${remote} != ${CHAIN_ID} — aborting`);
  console.log(`network: LiteForge ${CHAIN_ID} (${RPC})`);
  console.log(`deployer: ${account.address}`);
  console.log(`mode: ${dryRun ? "DRY RUN (no transactions will be sent)" : "LIVE DEPLOY"}`);

  const deployed = {};
  const deploy = async (name, artifact, args) => {
    const data = encodeDeployData({ ...artifact, args });
    await client.call({ account, data }); // simulate the creation
    const gas = await client.estimateGas({ account, data });
    const gasPrice = await client.getGasPrice();
    const cost = gas * gasPrice;
    const balance = await client.getBalance({ address: account.address });
    console.log(
      `${name}: estimate ${gas} gas @ ${gasPrice} wei = ${formatEther(cost)} zkLTC (balance ${formatEther(balance)})`,
    );
    if (balance < cost)
      throw Error(
        `balance ${formatEther(balance)} zkLTC < estimated cost ${formatEther(cost)} zkLTC for ${name}`,
      );
    if (balance < cost * 2n) console.log(`${name}: WARN balance margin below 2x estimated cost`);
    if (dryRun) return null;
    const hash = await wallet.deployContract({ ...artifact, args, account });
    console.log(`${name}: tx ${hash}`);
    const receipt = await client.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw Error(`${name} deploy reverted (tx ${hash})`);
    console.log(`${name}: deployed at ${receipt.contractAddress} (gas used ${receipt.gasUsed})`);
    deployed[name] = { address: receipt.contractAddress, tx: hash };
    return receipt.contractAddress;
  };

  const collection = await deploy("RareCognos", nft, []);
  const marketTarget = collection || "0x0000000000000000000000000000000000000001"; // dry-run placeholder for the constructor arg
  const marketAddress = await deploy("RareCognosMarket", market, [marketTarget, treasury]);
  const explorer = chain.blockExplorers.default.url;

  if (dryRun) {
    console.log("\nDRY RUN complete — no transactions were sent.");
    console.log(
      "Both deployment simulations and estimates passed; addresses appear on a live run.",
    );
    return;
  }

  const [name, version, marketCollection] = await Promise.all([
    client.readContract({ address: collection, abi: nft.abi, functionName: "name" }),
    client.readContract({ address: collection, abi: nft.abi, functionName: "version" }),
    client.readContract({ address: marketAddress, abi: market.abi, functionName: "collection" }),
  ]);
  if (String(marketCollection).toLowerCase() !== collection.toLowerCase())
    throw Error("market.collection() does not match the deployed collection");
  console.log(`sanity: name=${name} version=${version} market.collection ok`);

  if (writeConfig) {
    const path = "config/liteforge.json";
    const dep = JSON.parse(fs.readFileSync(path, "utf8"));
    dep.collection = collection;
    dep.market = marketAddress;
    dep.collectionDeploymentTx = deployed.RareCognos.tx;
    dep.marketDeploymentTx = deployed.RareCognosMarket.tx;
    dep.verificationUrls = dep.verificationUrls || [];
    fs.writeFileSync(path, JSON.stringify(dep, null, 2) + "\n");
    console.log("config/liteforge.json updated — verified stays false until explorer verification");
  }

  console.log("\nNEXT STEPS");
  console.log(`1. npm run nft:verify-prep -- --collection ${collection} --treasury ${treasury}`);
  console.log(`2. Verify both contracts (paths in artifacts/verification/README.md):`);
  console.log(`   collection tx ${explorer}/tx/${deployed.RareCognos.tx}`);
  console.log(`   market tx     ${explorer}/tx/${deployed.RareCognosMarket.tx}`);
  console.log("3. Set verified:true in config/liteforge.json once verified.");
  console.log("4. npm run testnet:acceptance (qa/testnet-acceptance.plan.md).");
};

main().catch((e) => {
  console.error(clean(e?.message ?? e));
  process.exit(1);
});
