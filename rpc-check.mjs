import { createPublicClient, http, formatEther, isAddress } from "viem";

const args = process.argv.slice(2);
if (args.length < 1) throw new Error("usage: rpc-check <rpc-url> [deployer-address]");
const RPC = args[0];
const client = createPublicClient({ transport: http(RPC, { timeout: 20000 }) });

const chainId = await client.request({ method: "eth_chainId" });
const blockNumber = await client.request({ method: "eth_blockNumber" });
const block = await client.getBlock({ blockTag: "latest", includeTransactions: false });
const gasPrice = await client.request({ method: "eth_gasPrice" });
const feeHistory = await client.request({ method: "eth_feeHistory", params: ["0x1", "latest", [50]] });
const baseFee = BigInt(feeHistory.baseFeePerGas[0]);
const reward = BigInt(feeHistory.reward?.[0]?.[0] ?? 0);
const bal = await client.getBalance({ address: "0x0000000000000000000000000000000000000000" });

const deployer = args[1];
let deployerBal, deployerNonce, deployerCode, deployerEoa;
if (deployer && isAddress(deployer)) {
  try {
    deployerBal = await client.getBalance({ address: deployer });
    deployerNonce = await client.getTransactionCount({ address: deployer });
    deployerCode = await client.getBytecode({ address: deployer });
    deployerEoa = !deployerCode || deployerCode === "0x";
  } catch (e) { console.log("deployer error:", e.message.slice(0, 120)); }
}

console.log(`RPC: ${RPC}`);
console.log(`eth_chainId=${chainId} (expected 4441)`);
console.log(`eth_blockNumber=${blockNumber}`);
console.log(`latest block ${block.number} timestamp ${block.timestamp} baseFee=${baseFee} wei reward=${reward} wei`);
console.log(`gasPrice=${gasPrice} wei (${formatEther(gasPrice)} zkLTC)`);
console.log(`eth_getBalance(0x0)=${formatEther(bal)} wei`);
if (deployer) console.log(`deployer bal=${deployerBal ? formatEther(deployerBal) : "N/A"} zkLTC nonce=${deployerNonce} eoa=${deployerEoa}`);