import {
  encodeFunctionData,
  type Address,
  type Hash,
  type PublicClient,
  type WalletClient,
  type Abi,
  type TransactionReceipt,
} from "viem";
export type Pending = {
  id: string;
  chainId: number;
  contract: Address;
  wallet: Address;
  kind: string;
  hash: Hash;
  data: Hash;
  value: string;
  block: string;
  nonce?: number;
  status: "pending" | "confirmed" | "failed" | "replaced";
  error?: string;
};
const KEY = "rarecognos.transactions.v2";
export function records(): Pending[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}
export function saveRecord(r: Pending) {
  if (typeof localStorage === "undefined") return;
  const all = records().filter((x) => x.id !== r.id);
  localStorage.setItem(KEY, JSON.stringify([...all.slice(-49), r]));
  window.dispatchEvent(new Event("nft-transactions"));
}
export function assertChain(actual: number, expected: number) {
  if (actual !== expected) throw Error("Wrong network. Switch network before continuing.");
}
export function sameTransaction(r: Pending, t: { to: Address | null; input: Hash; value: bigint }) {
  return (
    (t.to?.toLowerCase() ?? "0x0000000000000000000000000000000000000000") ===
      r.contract.toLowerCase() &&
    t.input === r.data &&
    t.value.toString() === r.value
  );
}
export async function followReceipt(
  client: PublicClient,
  r: Pending,
  notify: (s: string, h?: Hash) => void,
): Promise<TransactionReceipt> {
  let changed = false;
  const receipt = await client.waitForTransactionReceipt({
    hash: r.hash,
    timeout: 180000,
    onReplaced: ({ reason, transaction }) => {
      if (reason === "repriced" && sameTransaction(r, transaction)) {
        r.hash = transaction.hash;
        saveRecord(r);
        notify("Transaction accelerated. Waiting for receipt…", r.hash);
      } else {
        changed = true;
        r.status = "replaced";
        r.error = "Transaction cancelled or replaced by another action";
        saveRecord(r);
      }
    },
  });
  if (changed) throw Error(r.error);
  if (receipt.status !== "success") {
    r.status = "failed";
    r.error = "Transaction reverted";
    saveRecord(r);
    throw Error(r.error);
  }
  r.status = "confirmed";
  r.hash = receipt.transactionHash;
  saveRecord(r);
  notify("Confirmed on-chain", r.hash);
  return receipt;
}
export async function resumeTransaction(
  client: PublicClient,
  r: Pending,
  notify: (s: string, h?: Hash) => void,
) {
  assertChain(client.chain!.id, r.chainId);
  try {
    const receipt = await client.getTransactionReceipt({ hash: r.hash });
    if (receipt) {
      r.status = receipt.status === "success" ? "confirmed" : "failed";
      saveRecord(r);
      return receipt;
    }
  } catch {
    /* A pending receipt is not failure. */
  }
  if (r.nonce !== undefined) {
    const count = await client.getTransactionCount({ address: r.wallet, blockTag: "latest" });
    if (count > r.nonce) {
      const latest = await client.getBlockNumber(),
        start = BigInt(r.block) > latest - 2000n ? BigInt(r.block) : latest - 2000n;
      for (let n = latest; n >= start && n >= 0n; n--) {
        const block = await client.getBlock({ blockNumber: n, includeTransactions: true });
        const tx = block.transactions.find(
          (t) => t.from.toLowerCase() === r.wallet.toLowerCase() && t.nonce === r.nonce,
        );
        if (tx) {
          if (!sameTransaction(r, tx)) {
            r.status = "replaced";
            r.error = "Original action was cancelled or replaced";
            saveRecord(r);
            throw Error(r.error);
          }
          r.hash = tx.hash;
          saveRecord(r);
          return followReceipt(client, r, notify);
        }
      }
      throw Error(
        "Nonce used; replacement not found in the recent 2,000 blocks. Check explorer. Resending is blocked.",
      );
    }
  }
  return followReceipt(client, r, notify);
}
export async function transact(
  publicClient: PublicClient,
  wallet: WalletClient,
  call: {
    address: Address;
    abi: Abi;
    functionName: string;
    args?: readonly unknown[];
    value?: bigint;
  },
  notify: (s: string, hash?: Hash) => void,
) {
  if (!wallet.account || !publicClient.chain) throw Error("Connect a wallet");
  const address = wallet.account.address,
    chainId = publicClient.chain.id;
  assertChain(await wallet.getChainId(), chainId);
  if (
    records().some(
      (r) =>
        r.status === "pending" &&
        r.wallet.toLowerCase() === address.toLowerCase() &&
        r.chainId === chainId,
    )
  )
    throw Error("A transaction is still pending. Resume receipt tracking before sending another.");
  notify("Simulating transaction…");
  const { request } = await publicClient.simulateContract({ ...call, account: wallet.account });
  const fees = await publicClient.estimateFeesPerGas();
  const priced =
    "maxFeePerGas" in fees
      ? { maxFeePerGas: fees.maxFeePerGas, maxPriorityFeePerGas: fees.maxPriorityFeePerGas }
      : { gasPrice: fees.gasPrice };
  assertChain(await wallet.getChainId(), chainId);
  const addresses = await wallet.getAddresses();
  if (addresses[0]?.toLowerCase() !== address.toLowerCase())
    throw Error("Wallet account changed. Review the action again.");
  const block = await publicClient.getBlockNumber();
  notify("Confirm in your wallet");
  const hash = await wallet.writeContract({
    ...request,
    ...priced,
    chain: publicClient.chain,
  });
  const r: Pending = {
    id: hash,
    chainId,
    contract: call.address,
    wallet: address,
    kind: call.functionName,
    hash,
    data: encodeFunctionData(call),
    value: String(call.value || 0n),
    block: String(block),
    status: "pending",
  };
  saveRecord(r);
  notify("Waiting for receipt…", hash);
  try {
    r.nonce = (await publicClient.getTransaction({ hash })).nonce;
    saveRecord(r);
  } catch {
    /* Hash is already persisted. */
  }
  return followReceipt(publicClient, r, notify);
}
export function transactionError(error: unknown): string {
  let e = error as { code?: number; cause?: unknown; shortMessage?: string; message?: string };
  for (let i = 0; i < 8 && e; i++, e = e.cause as typeof e)
    if (e.code === 4001) return "Rejected in wallet. No transaction was confirmed.";
  const raw =
    (error as { shortMessage?: string; message?: string })?.shortMessage ||
    (error as Error)?.message ||
    "Request failed";
  if (/failed to fetch/i.test(raw))
    return "The wallet could not load its own fee service for LiteForge. The site now sets the network fee. Approve again. If it still fails, set the wallet RPC to https://rpc.testnet.liteforge.zeeve.net.";
  return raw;
}
