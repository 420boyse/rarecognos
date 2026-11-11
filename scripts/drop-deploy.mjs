// Optional LiteForge TESTNET factory deployer. Never deploys or changes the existing collection/market.
// Explicit operator-controlled command; requires NFT_DEPLOYER_KEY, TREASURY_ADDRESS and LITEFORGE_DEPLOY_CONFIRM=YES.
import fs from 'node:fs';
import { createPublicClient, createWalletClient, http, defineChain, encodeDeployData, formatEther, isAddress, zeroAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
const RPC = process.env.LITEFORGE_RPC_URL || 'https://rpc.testnet.liteforge.zeeve.net';
const chain = defineChain({ id: 4441, name: 'LitVM LiteForge Testnet', nativeCurrency: { name: 'zkLTC', symbol: 'zkLTC', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const key = process.env.NFT_DEPLOYER_KEY?.trim(), dry = process.argv.includes('--dry-run');
const treasury = process.env.TREASURY_ADDRESS?.trim();
if (!key || !isAddress(treasury || '') || treasury === zeroAddress || (!dry && process.env.LITEFORGE_DEPLOY_CONFIRM !== 'YES')) {
  console.error('Testnet-only. Set NFT_DEPLOYER_KEY and TREASURY_ADDRESS in the environment, then explicitly run npm run drop:deploy. --dry-run sends nothing. Live deployment also requires LITEFORGE_DEPLOY_CONFIRM=YES.'); process.exit(1);
}
try {
  const artifact = JSON.parse(fs.readFileSync('artifacts/RareCognosDropFactory.json'));
  const account = privateKeyToAccount(key), client = createPublicClient({ chain, transport: http(RPC, { timeout: 60000 }) }), wallet = createWalletClient({ chain, account, transport: http(RPC, { timeout: 60000 }) });
  if (parseInt(await client.request({ method: 'eth_chainId' }), 16) !== 4441) throw Error('RPC chain is not LiteForge testnet 4441; aborting.');
  const data = encodeDeployData({ ...artifact, args: [treasury] });
  await client.call({ account, data });
  const gas = await client.estimateGas({ account, data }), cost = gas * await client.getGasPrice(), balance = await client.getBalance({ account });
  console.log(`Factory testnet estimate: ${gas} gas / ${formatEther(cost)} zkLTC; deployer balance ${formatEther(balance)} zkLTC.`);
  if (balance < cost) throw Error('Insufficient testnet funds; no transaction sent.');
  if (dry) { console.log('Dry run succeeded. No transaction sent.'); process.exit(0); }
  const hash = await wallet.deployContract({ ...artifact, args: [treasury], account });
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') throw Error(`Factory deployment failed: ${hash}`);
  const onchain = await client.readContract({ address: receipt.contractAddress, abi: artifact.abi, functionName: 'treasury' });
  if (onchain.toLowerCase() !== treasury.toLowerCase()) throw Error('Deployed treasury mismatch.');
  const record = { network: 'LiteForge testnet', chainId: 4441, contract: 'RareCognosDropFactory', address: receipt.contractAddress, deploymentTx: hash, treasury, deployedAt: new Date().toISOString(), verified: false, compiler: '0.8.36 viaIR=true optimizerRuns=200 evm=shanghai', note: 'TESTNET ONLY. New independent factory; existing contracts untouched.' };
  fs.mkdirSync('deployments', { recursive: true });
  fs.writeFileSync('deployments/drop-liteforge.json', JSON.stringify(record, null, 2) + '\n');
  console.log(`TESTNET factory deployed at ${receipt.contractAddress}; tx ${hash}. Verify it, then set VITE_DROP_FACTORY for the testnet build.`);
} catch (e) { console.error(key ? String(e?.message || e).split(key).join('<redacted>') : e?.message || e); process.exit(1); }
