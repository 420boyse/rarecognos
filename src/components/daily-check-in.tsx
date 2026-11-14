import { useEffect, useState } from "react";
import { useAccount, usePublicClient, useReadContract, useWalletClient } from "wagmi";
import { NetworkHelp } from "@/components/network-help";
import { chain } from "@/lib/nft/config";
import { checkInTreasury, readCheckInAddress, saveCheckInAddress } from "@/lib/nft/checkin-address";
import { abi } from "@/lib/nft/RareCognosCheckIn";
import { progressFor, saveProgress, utcDay } from "@/lib/member";
import { transactionError } from "@/lib/nft/transaction";
import type { Address } from "viem";

const FEE = 100_000_000_000_000n;

export function DailyCheckIn({ member }: { member: string }) {
  const account = useAccount();
  const client = usePublicClient({ chainId: chain.id });
  const wallet = useWalletClient();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [address, setAddress] = useState<Address | undefined>();
  const done = member ? progressFor(member).checkin === utcDay() : false;
  const locked = !account.address;
  const wrong = account.isConnected && account.chainId !== chain.id;
  const checked = useReadContract({
    address,
    abi,
    functionName: "lastDay",
    args: account.address ? [account.address] : undefined,
    query: { enabled: Boolean(address && account.address) },
  });

  useEffect(() => {
    const saved = readCheckInAddress();
    if (saved) setAddress(saved);
  }, []);

  async function launch() {
    if (!wallet.data || !client) return;
    setBusy(true);
    setNote("");
    try {
      const artifact = await fetch("/contracts/RareCognosCheckIn.json").then((res) => res.json());
      const hash = await wallet.data.deployContract({
        abi,
        bytecode: artifact.bytecode,
        args: [checkInTreasury],
      });
      const receipt = await client.waitForTransactionReceipt({ hash });
      if (!receipt.contractAddress) throw Error("Deployment did not return a contract.");
      saveCheckInAddress(receipt.contractAddress);
      setAddress(receipt.contractAddress);
      setNote("");
    } catch (error) {
      setNote(transactionError(error));
    } finally {
      setBusy(false);
    }
  }

  async function checkIn() {
    if (!account.address || !member || !client || !wallet.data || !address || done || busy) return;
    setBusy(true);
    setNote("");
    try {
      if ((await wallet.data.getChainId()) !== chain.id) throw Error("Switch to LiteForge first.");
      const hash = await wallet.data.writeContract({
        address,
        abi,
        functionName: "checkIn",
        args: [],
        value: FEE,
      });
      setNote("");
      const receipt = await client.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw Error("Check-in was not confirmed.");
      const current = progressFor(member);
      saveProgress(member, {
        ...current,
        checkin: utcDay(),
        xp: current.xp + (current.checkin === utcDay() ? 0 : 10),
      });
      setNote("");
    } catch (error) {
      setNote(transactionError(error));
    } finally {
      setBusy(false);
    }
  }

  const chainDone = typeof checked.data === "bigint" && Number(checked.data) === Math.floor(Date.now() / 86_400_000);
  const finished = done || chainDone;
  const label = finished ? "Done" : locked ? "Locked" : !address ? "Launch" : "Check in";

  return (
    <li className={`quest-row ${finished ? "done" : locked ? "locked" : "ready"}`}>
      <div>
        <h2>Daily check-in</h2>
        <p>{locked ? "Needs a wallet." : "Once a day."}</p>
        {(wrong || !account.isConnected) && <NetworkHelp />}
        {note && <p role="status">{note}</p>}
      </div>
      <span className="xp-chip">10 XP</span>
      <button
        className="primary-action"
        disabled={locked || finished || busy || wrong}
        onClick={() => void (address ? checkIn() : launch())}
      >
        {busy ? "Confirming…" : label}
      </button>
    </li>
  );
}
