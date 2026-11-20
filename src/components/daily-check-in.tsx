import { useRef, useState } from "react";
import {
  usePublicClient,
  useReadContract,
  useWalletClient,
  useAccount,
  useSwitchChain,
} from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { type Address, type Hash, type PublicClient, type WalletClient, formatEther } from "viem";
import { NetworkHelp } from "./network-help";
import { chain, explorer } from "@/lib/nft/config";
import { abi } from "@/lib/nft/RareCognosCheckIn";
import deployment from "../../config/checkin.json";
import { records, resumeTransaction, transact, transactionError } from "@/lib/nft/transaction";
import { xpKey } from "@/lib/nft/use-wallet-xp";
import { xpPoints, type WalletScore } from "@/lib/nft/xp";

const target = deployment.address as Address;
export function DailyCheckIn({ wallet, score }: { wallet: Address; score?: WalletScore }) {
  const client = usePublicClient({ chainId: chain.id }),
    signer = useWalletClient(),
    account = useAccount();
  const switcher = useSwitchChain(),
    cache = useQueryClient();
  const [busy, setBusy] = useState(false),
    [note, setNote] = useState(""),
    [hash, setHash] = useState<Hash>();
  const lock = useRef(false);
  const read = { address: target, abi, chainId: chain.id };
  const last = useReadContract({
    ...read,
    functionName: "lastDay",
    args: [wallet],
    query: { refetchInterval: 30000 },
  });
  const fee = useReadContract({ ...read, functionName: "FEE", query: { staleTime: Infinity } });
  const today = Math.floor(Date.now() / 86400000);
  const done = last.data === BigInt(today) || (score?.today === today && score.checkedToday);
  const wrong = account.chainId !== chain.id;
  const pending = records().find(
    (r) =>
      r.status === "pending" &&
      r.wallet.toLowerCase() === wallet.toLowerCase() &&
      r.chainId === chain.id &&
      r.contract.toLowerCase() === target.toLowerCase() &&
      r.kind === "checkIn",
  );
  async function submit() {
    if (
      lock.current ||
      wrong ||
      !client ||
      !signer.data ||
      (!pending && (done || fee.data === undefined || last.data === undefined))
    )
      return;
    lock.current = true;
    setBusy(true);
    setNote("");
    const notify = (message: string, tx?: Hash) => {
      setNote(message);
      if (tx) setHash(tx);
    };
    try {
      const rpc = client as PublicClient;
      const receipt = pending
        ? await resumeTransaction(rpc, pending, notify)
        : await transact(
            rpc,
            signer.data as WalletClient,
            { address: target, abi, functionName: "checkIn", value: fee.data },
            notify,
          );
      if (receipt.status !== "success") throw Error("Check-in reverted.");
      setHash(receipt.transactionHash);
      setNote("Check-in confirmed. Syncing wallet XP.");
      await Promise.all([last.refetch(), cache.invalidateQueries({ queryKey: xpKey(wallet) })]);
      setNote("Check-in confirmed.");
    } catch (e) {
      setNote(transactionError(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <li className={`quest-row checkin-row ${done ? "done" : "ready"}`}>
      <div>
        <h2>Daily check-in</h2>
        <p>
          Once per UTC day.{" "}
          {fee.data !== undefined && `${formatEther(fee.data)} test zkLTC plus network gas.`}
        </p>
        {score && (
          <p>
            {score.days} recorded · {score.streak}-day streak
          </p>
        )}
        {wrong && <NetworkHelp />}
        {note && <p role="status">{note}</p>}
        {hash && explorer && <a href={`${explorer}/tx/${hash}`}>View transaction</a>}
      </div>
      <span className="xp-chip">{xpPoints.day} XP / day</span>
      {wrong ? (
        <button className="nft-button" onClick={() => switcher.switchChain({ chainId: chain.id })}>
          Switch to LiteForge
        </button>
      ) : done && !pending ? (
        <span className="checkin-recorded">Recorded today</span>
      ) : (last.isError || fee.isError) && !pending ? (
        <button
          className="nft-button"
          onClick={() => void Promise.all([last.refetch(), fee.refetch()])}
        >
          Retry check-in status
        </button>
      ) : (
        <button
          className="primary-action"
          disabled={busy || (!pending && (fee.data === undefined || last.data === undefined))}
          onClick={() => void submit()}
        >
          {busy ? "Confirming…" : pending ? "Recheck receipt" : "Check in"}
        </button>
      )}
    </li>
  );
}
