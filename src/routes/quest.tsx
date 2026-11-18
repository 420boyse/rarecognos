import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAccount, useReadContract } from "wagmi";
import { MarketHeader } from "@/components/market-header";
import { SiteFooter } from "@/components/site-footer";
import { DailyCheckIn } from "@/components/daily-check-in";
import { memberKey, saveProgress, useGmail, useProgress } from "@/lib/member";
import { configured } from "@/lib/nft/config";
import { nftCall } from "@/lib/nft/data";

export const Route = createFileRoute("/quest")({
  component: QuestPage,
});

function QuestPage() {
  const account = useAccount();
  const gmail = useGmail();
  const pending = account.status === "connecting" || account.status === "reconnecting";
  const key = memberKey(account.address, gmail?.email);
  const progress = useProgress(key);
  const allowed = Boolean(account.address || gmail);
  const balance = useReadContract({
    ...nftCall,
    functionName: "balanceOf",
    args: account.address ? [account.address] : undefined,
    query: { enabled: configured && !!account.address && !!nftCall.address },
  });
  const holds = typeof balance.data === "bigint" && balance.data > 0n;

  useEffect(() => {
    if (!pending && !allowed) location.replace("/");
  }, [pending, allowed]);

  const helloXp = progress.hello ? 50 : 0;
  const heldXp = progress.held ? 150 : 0;
  const checkinXp = Math.max(0, progress.xp - helloXp - heldXp);
  const lines = [
    ["Say hello", helloXp],
    ["Daily check-in", checkinXp],
    ["Hold a work", heldXp],
  ] as const;

  return (
    <div>
      <MarketHeader view="Quest" />
      <main className="market-section quest-page">
        {allowed && (
          <>
            <div className="section-heading">
              <div>
                <h1>Quest</h1>
              </div>
            </div>
            <p className="quest-disclaimer" role="note">Testnet demo progress: XP is saved in this browser, not as an on-chain reward balance. It does not guarantee any airdrop or future rewards.</p>
            <section className="xp-total" aria-label="Total XP">
              <div>
                <p className="checkin-kicker">Total XP</p>
                <p className="xp-figure">{progress.xp}</p>
              </div>
              <dl className="xp-ledger">
                {lines.map(([name, amount]) => (
                  <div key={name}>
                    <dt>{name}</dt>
                    <dd>{amount || "—"}</dd>
                  </div>
                ))}
                <div className="xp-sum">
                  <dt>Total</dt>
                  <dd>{progress.xp}</dd>
                </div>
              </dl>
            </section>
            <ul className="quest-list">
              <li className={`quest-row ${progress.hello ? "done" : "ready"}`}>
                <div>
                  <h2>Say hello to Cognos</h2>
                  <p>One click.</p>
                </div>
                <span className="xp-chip">50 XP</span>
                <button
                  className="primary-action"
                  disabled={progress.hello}
                  onClick={() => {
                    if (!key || progress.hello) return;
                    saveProgress(key, { ...progress, hello: true, xp: progress.xp + 50 });
                  }}
                >
                  {progress.hello ? "Done" : "Say hello"}
                </button>
              </li>
              <DailyCheckIn member={key} />
              <li className={`quest-row ${progress.held ? "done" : holds ? "ready" : "locked"}`}>
                <div>
                  <h2>Hold a work</h2>
                  <p>{holds ? "A work is in this wallet." : "Mint or collect one first."}</p>
                </div>
                <span className="xp-chip">150 XP</span>
                <button
                  className="primary-action"
                  disabled={!holds || !!progress.held}
                  onClick={() => {
                    if (!key || progress.held || !holds) return;
                    saveProgress(key, { ...progress, held: true, xp: progress.xp + 150 });
                  }}
                >
                  {progress.held ? "Done" : holds ? "Claim" : "Locked"}
                </button>
              </li>
            </ul>
          </>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
