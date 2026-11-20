import {
  createPublicClient,
  parseAbi,
  hashMessage,
  http,
  isAddress,
  verifyMessage,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
import { helloMessage, helloQuest } from "./hello.ts";

function receipt(wallet: Address) {
  const owner = wallet.toLowerCase();
  return { name: `${helloQuest}-${owner}.json`, keyvalues: { quest: helloQuest, wallet: owner } };
}

async function pinata(path: string, init?: RequestInit) {
  const jwt = process.env.PINATA_JWT?.trim();
  if (!jwt) throw Error("Greeting storage unavailable");
  const result = await fetch("https://api.pinata.cloud" + path, {
    ...init,
    headers: { Authorization: "Bearer " + jwt },
    signal: AbortSignal.timeout(10000),
  });
  if (!result.ok) throw Error("Greeting storage unavailable");
  return result.json();
}

export async function hasHello(wallet: Address) {
  const { name, keyvalues } = receipt(wallet);
  const query = new URLSearchParams({
    status: "pinned",
    pageLimit: "1",
    "metadata[name]": name,
    "metadata[keyvalues]": JSON.stringify({
      quest: { value: keyvalues.quest, op: "eq" },
      wallet: { value: keyvalues.wallet, op: "eq" },
    }),
  });
  const result = await pinata("/data/pinList?" + query);
  if (!Array.isArray(result.rows)) throw Error("Invalid greeting storage response");
  if (!result.rows.length) return false;
  const meta = result.rows[0]?.metadata;
  if (
    meta?.name !== name ||
    meta.keyvalues?.quest !== helloQuest ||
    meta.keyvalues.wallet !== keyvalues.wallet
  )
    throw Error("Unexpected greeting receipt");
  return true;
}

async function saveHello(wallet: Address) {
  const meta = receipt(wallet);
  // Every successful claim for this wallet pins identical bytes, including concurrent retries.
  const form = new FormData();
  form.set(
    "file",
    new Blob([JSON.stringify(meta.keyvalues)], { type: "application/json" }),
    meta.name,
  );
  form.set("pinataMetadata", JSON.stringify(meta));
  form.set("pinataOptions", JSON.stringify({ cidVersion: 1 }));
  const result = await pinata("/pinning/pinFileToIPFS", { method: "POST", body: form });
  if (typeof result.IpfsHash !== "string" || !result.IpfsHash)
    throw Error("Missing greeting receipt");
}

const publicClient = createPublicClient({
  transport: http("https://rpc.testnet.liteforge.zeeve.net", { timeout: 8000, retryCount: 1 }),
});

async function contractGreeting(wallet: Address, message: string, signature: Hex) {
  if (!(await publicClient.getCode({ address: wallet }))) return false;
  try {
    const magic = await publicClient.readContract({
      address: wallet,
      abi: parseAbi([
        "function isValidSignature(bytes32 hash, bytes signature) view returns (bytes4)",
      ]),
      functionName: "isValidSignature",
      args: [hashMessage(message), signature],
    });
    return magic === "0x1626ba7e";
  } catch (error) {
    if (error instanceof Error && /reverted|returned no data/i.test(error.message)) return false;
    throw error;
  }
}

export async function claimHello(
  wallet: string,
  signature: unknown,
  store = { has: hasHello, save: saveHello },
  verifyContract = contractGreeting,
) {
  const owner = wallet.toLowerCase();
  if (
    !isAddress(owner) ||
    owner === zeroAddress ||
    typeof signature !== "string" ||
    signature.length > 8194 ||
    !/^0x(?:[a-fA-F0-9]{2})+$/.test(signature)
  )
    return false;
  const message = helloMessage(owner);
  const valid = await verifyMessage({
    address: owner,
    message,
    signature: signature as `0x${string}`,
  }).catch(() => false);
  if (!valid && !(await verifyContract(owner, message, signature as Hex))) return false;
  if (!(await store.has(owner))) await store.save(owner);
  return true;
}
