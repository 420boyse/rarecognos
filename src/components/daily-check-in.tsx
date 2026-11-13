import { useState } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { parseEther } from "viem";
import { chain } from "@/lib/nft/config";
import { progressFor, saveProgress, utcDay } from "@/lib/member";
import { transactionError } from "@/lib/nft/transaction";

const TREASURY = "0x06e53d74751392ee4ac7139f611b8db3f98591f9";
const FEE = parseEther("0.0001");

export function DailyCheckIn({ member }: { member: string }) {
  const account = useAccount();
  const client = usePublicClient({ chainId: chain.id });
  const wallet = useWalletClient();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const done = member ? progressFor(member).checkin === utcDay() : false;
  const locked = !account.address;

  async function checkIn() {
    if (!account.address || !member || !client || !wallet.data || done || busy) return;
    setBusy(true);
    setNote("Confirm 0.0001 zkLTC in your wallet. The network fee is separate and small.");
    try {
      if ((await wallet.data.getChainId()) !== chain.id) throw Error("Switch to LiteForge first.");
      const fees = await client.estimateFeesPerGas();
      const priced =
        "maxFeePerGas" in fees
          ? { maxFeePerGas: fees.maxFeePerGas, maxPriorityFeePerGas: fees.maxPriorityFeePerGas }
          : { gasPrice: fees.gasPrice };
      const hash = await wallet.data.sendTransaction({
        account: wallet.data.account,
        chain,
        to: TREASURY,
        value: FEE,
        ...priced,
      });
      setNote("Waiting for the check-in…");
      const receipt = await client.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw Error("Check-in was not confirmed.");
      const current = progressFor(member);
      saveProgress(member, {
        ...current,
        checkin: utcDay(),
        xp: current.xp + (current.checkin === utcDay() ? 0 : 10),
      });
      setNote("Checked in for today.");
    } catch (error) {
      setNote(transactionError(error));
    } finally {
      setBusy(false);
    }
  }

  const state = done ? "done" : locked ? "locked" : "ready";
  return (
    <li className={`quest-row ${state}`}>
      <div>
        <h2>Daily check-in</h2>
        <p>{locked ? "Needs a wallet." : "0.0001 zkLTC, once a day."}</p>
        {note && <p role="status">{note}</p>}
      </div>
      <span className="xp-chip">10 XP</span>
      <button className="primary-action" disabled={locked || done || busy} onClick={() => void checkIn()}>
        {done ? "Done" : locked ? "Locked" : busy ? "Confirming…" : "Check in"}
      </button>
    </li>
  );
}
