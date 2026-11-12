import { useState } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { parseEther } from "viem";
import { chain } from "@/lib/nft/config";
import { memberKey, progressFor, saveProgress, utcDay } from "@/lib/member";
import { transactionError } from "@/lib/nft/transaction";

const TREASURY = "0x06e53d74751392ee4ac7139f611b8db3f98591f9";
const FEE = parseEther("0.0001");

export function DailyCheckIn() {
  const account = useAccount();
  const client = usePublicClient({ chainId: chain.id });
  const wallet = useWalletClient();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const key = memberKey(account.address);
  const done = key ? progressFor(key).checkin === utcDay() : false;

  async function checkIn() {
    if (!account.address || !client || !wallet.data || done || busy) return;
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
      const current = progressFor(key);
      saveProgress(key, { ...current, checkin: utcDay() });
      setNote("Checked in for today.");
    } catch (error) {
      setNote(transactionError(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="check-in">
      <div>
        <h3>Daily check-in</h3>
        <p>0.0001 zkLTC, once a day. Your wallet also shows the network fee.</p>
      </div>
      <button className="nft-button" disabled={!account.address || done || busy} onClick={() => void checkIn()}>
        {!account.address ? "Connect a wallet" : done ? "Checked in today" : busy ? "Confirming…" : "Check in"}
      </button>
      {note && <p role="status">{note}</p>}
    </div>
  );
}
