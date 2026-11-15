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

export function CheckInBoard() {
  const account = useAccount();
  const client = usePublicClient({ chainId: chain.id });
  const [address, setAddress] = useState<Address | undefined>();
  const today = utcDayNumber();

  useEffect(() => {
    const saved = readCheckInAddress();
    if (saved) setAddress(saved);
  }, []);

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
  const windowDays = Array.from({ length: 14 }, (_, i) => today - 13 + i);
  let streak = 0;
  for (let day = days.has(today) ? today : today - 1; days.has(day); day -= 1) streak += 1;
  const checkedCount = windowDays.filter((day) => days.has(day)).length;

  if (!account.address) return null;

  return (
    <section className="checkin-board" aria-label="Check-in record">
      <div className="checkin-board-head">
        <h2>Check-in</h2>
        <p>{logs.isPending ? "Reading the chain…" : streak ? `${streak} day streak` : "No streak yet."}</p>
      </div>
      <div className="checkin-days" role="list">
        {windowDays.map((day) => {
          const hit = days.has(day);
          const state = hit ? "Checked in" : day === today ? "Open" : "Quiet";
          return (
            <span
              key={day}
              role="listitem"
              className={`checkin-day${hit ? " hit" : ""}${day === today ? " today" : ""}`}
              title={`${labelForDay(day)} · ${state}`}
              aria-label={`${labelForDay(day)}, ${state}`}
            />
          );
        })}
      </div>
      <p className="checkin-span">
        <span>{labelForDay(windowDays[0])}</span>
        <span>{checkedCount} of 14</span>
        <span>Today</span>
      </p>
    </section>
  );
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
