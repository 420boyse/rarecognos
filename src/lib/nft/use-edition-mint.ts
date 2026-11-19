import { useEffect, useRef, useState } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { parseAbi, type Address, type Hash, type PublicClient, type WalletClient } from "viem";
import { chain } from "./config";
import { editionReceipt } from "./edition-receipt";
import { records, resumeTransaction, transact, transactionError } from "./transaction";

const mintAbi = parseAbi(["function MINT_PRICE() view returns (uint256)", "function mint(uint256 piece) payable"]);

export function useEditionMint(contract?: Address) {
  const account = useAccount();
  const wallet = useWalletClient();
  const client = usePublicClient({ chainId: chain.id });
  const cache = useQueryClient();
  const [receipt, setReceipt] = useState<ReturnType<typeof editionReceipt> | null>(null);
  const [notice, setNotice] = useState("");
  const [hash, setHash] = useState<Hash>();
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [history, setHistory] = useState<ReturnType<typeof records>>([]);
  useEffect(() => {
    const update = () => setHistory(records());
    update();
    window.addEventListener("nft-transactions", update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener("nft-transactions", update);
      window.removeEventListener("storage", update);
    };
  }, []);
  const pending = history.find((r) => r.status === "pending" && r.chainId === chain.id &&
    r.contract.toLowerCase() === contract?.toLowerCase() && r.wallet.toLowerCase() === account.address?.toLowerCase());
  async function run(piece: number) {
    if (lock.current || !contract || !account.address || !client || !wallet.data) return;
    lock.current = true;
    setBusy(true);
    setReceipt(null);
    setHash(pending?.hash);
    const notify = (message: string, txHash?: Hash) => {
      setNotice(message);
      if (txHash) setHash(txHash);
    };
    try {
      const rpc = client as PublicClient;
      const confirmed = pending
        ? await resumeTransaction(rpc, pending, notify)
        : await transact(rpc, wallet.data as WalletClient, {
            address: contract, abi: mintAbi, functionName: "mint", args: [BigInt(piece)],
            value: await rpc.readContract({ address: contract, abi: mintAbi, functionName: "MINT_PRICE" }),
          }, notify);
      setReceipt(editionReceipt(confirmed, contract, account.address));
      setNotice("");
      setHash(undefined);
      void cache.invalidateQueries({ queryKey: ["readContract"] });
    } catch (error) {
      setNotice(transactionError(error));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return { receipt, setReceipt, notice, hash: hash ?? pending?.hash, busy, pending, run };
}
