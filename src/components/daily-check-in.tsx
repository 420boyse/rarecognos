import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccount, usePublicClient, useReadContract, useWalletClient } from "wagmi";
import { NetworkHelp } from "@/components/network-help";
import { chain } from "@/lib/nft/config";
import { checkInTreasury, readCheckInAddress, saveCheckInAddress } from "@/lib/nft/checkin-address";
import { abi } from "@/lib/nft/RareCognosCheckIn";
import { progressFor, saveProgress, utcDay } from "@/lib/member";
import { transactionError } from "@/lib/nft/transaction";
import type { Address } from "viem";

const FEE = 100_000_000_000_000n;
const DAY = 86_400_000;

function utcDayNumber(date = Date.now()) {
  return Math.floor(date / DAY);
}

function labelForDay(day: number) {
  return new Date(day * DAY).toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" });
}

export function DailyCheckIn({ member }: { member: string }) {
  const account = useAccount();
  const client = usePublicClient({ chainId: chain.id });
  const wallet = useWalletClient();
  const cache = useQueryClient();
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
      await cache.invalidateQueries({ queryKey: ["checkin-board", address, account.address] });
      await checked.refetch();
      setNote("");
    } catch (error) {
      setNote(transactionError(error));
    } finally {
      setBusy(false);
    }
  }

  const chainDone = typeof checked.data === "bigint" && Number(checked.data) === Math.floor(Date.now() / 86_400_000);
  const finished = done || chainDone;
  const label = finished ? "Recorded" : locked ? "Locked" : !address ? "Launch" : "Check in";
  const today = utcDayNumber();
  const last = typeof checked.data === "bigint" ? Number(checked.data) : 0;
  const logs = useQuery({
    queryKey: ["checkin-board", address, account.address],
    enabled: Boolean(client && address && account.address),
    queryFn: async () => {
      const latest = await client!.getBlockNumber();
      const fromBlock = latest > 750_000n ? latest - 750_000n : 0n;
      return client!.getLogs({
        address,
        event: {
          type: "event",
          name: "CheckedIn",
          inputs: [
            { type: "address", name: "account", indexed: true },
            { type: "uint256", name: "day", indexed: true },
            { type: "uint256", name: "fee", indexed: false },
          ],
        },
        args: { account: account.address },
        fromBlock,
      });
    },
  });
  const days = new Set(
    (logs.data || [])
      .map((log) => (log.args as { day?: bigint }).day)
      .filter((day): day is bigint => typeof day === "bigint")
      .map(Number),
  );
  if (last > 0) days.add(last);
  let streak = 0;
  for (let day = days.has(today) ? today : today - 1; days.has(day); day -= 1) streak += 1;
  const detail = finished
    ? `${labelForDay(today)}${streak > 1 ? ` · ${streak} days` : ""}`
    : last > 0
      ? `Last recorded ${labelForDay(last)}`
      : "Once a day. 0.0001 zkLTC.";

  return (
    <li className={`quest-row checkin-row ${finished ? "done" : locked ? "locked" : "ready"}`}>
      <div>
        <p className="checkin-kicker">Daily check-in</p>
        <h2>{finished ? "Recorded today" : "Open today"}</h2>
        <p>{detail}</p>
        {(wrong || !account.isConnected) && <NetworkHelp />}
        {note && <p role="status">{note}</p>}
      </div>
      <span className="xp-chip">10 XP</span>
      {finished ? (
        <span className="checkin-recorded">Recorded</span>
      ) : (
        <button
          className="primary-action"
          disabled={locked || busy || wrong}
          onClick={() => void (address ? checkIn() : launch())}
        >
          {busy ? "Confirming…" : label}
        </button>
      )}
    </li>
  );
}
