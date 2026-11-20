import { createFileRoute } from "@tanstack/react-router";
import { useAccount } from "wagmi";
import { MarketHeader } from "@/components/market-header";
import { SiteFooter } from "@/components/site-footer";
import { DailyCheckIn } from "@/components/daily-check-in";
import { xpPoints } from "@/lib/nft/xp";
import { useWalletXp } from "@/lib/nft/use-wallet-xp";
import { pageMeta } from "@/lib/site-meta";

export const Route = createFileRoute("/quest")({
  head: () =>
    pageMeta({
      title: "Wallet XP · RareCognos",
      description: "Track your LiteForge quests, daily streak and collector milestones.",
      path: "/quest",
      image: "/og.jpg",
    }),
  component: QuestPage,
});

function QuestPage() {
  const { address } = useAccount();
  const progress = useWalletXp(address);
  const score = progress.data;
  const tasks = [
    {
      name: "Welcome to RareCognos",
      points: xpPoints.hello,
      earned: score?.hello,
      detail: "Awarded once with your first verified quest.",
    },
    {
      name: "Collect a work",
      points: xpPoints.hold,
      earned: score?.held,
      detail:
        "Receive a RareCognos, Eyed or MIDNIGHT ROGUES NFT. You keep the XP after transferring it.",
      href: "/explore",
      link: "Explore collections",
    },
    {
      name: "First mint",
      points: xpPoints.mint,
      earned: score?.minted,
      detail: "Mint your first NFT from one of these collections.",
      href: "/midnight-rogues",
      link: "Browse the mint",
    },
    {
      name: "First completed sale",
      points: xpPoints.sale,
      earned: score?.sold,
      detail: "Sell an NFT to another wallet through either RareCognos marketplace.",
      href: "/#my-nfts",
      link: "View wallet NFTs",
    },
  ];
  return (
    <>
      <MarketHeader view="Quest" />
      <main className="market-section quest-page">
        <div className="section-heading">
          <div>
            <h1>Wallet XP</h1>
            <p>Collector milestones and daily check-ins on LiteForge testnet.</p>
          </div>
        </div>
        {!address ? (
          <div className="market-notice">
            <p>Connect your wallet to see your XP on any device.</p>
            <button
              className="primary-action"
              onClick={() => window.dispatchEvent(new Event("rarecognos-login"))}
            >
              Connect wallet for quests
            </button>
          </div>
        ) : (
          <>
            <section className="xp-total" aria-label="Total XP">
              <div>
                <p className="checkin-kicker">Total XP</p>
                <p className="xp-figure">{score?.xp ?? "—"}</p>
              </div>
              <dl className="xp-ledger">
                {tasks.map((task) => (
                  <div key={task.name}>
                    <dt>{task.name}</dt>
                    <dd>{score ? (task.earned ? task.points : 0) : "—"}</dd>
                  </div>
                ))}
                <div>
                  <dt>Daily check-ins</dt>
                  <dd>{score ? score.days * xpPoints.day : "—"}</dd>
                </div>
              </dl>
            </section>
            {progress.isPending && <p role="status">Reading wallet history…</p>}
            {progress.isError && (
              <p className="market-notice" role="alert">
                Wallet history is temporarily unavailable.{" "}
                <button className="nft-button" onClick={() => void progress.refetch()}>
                  Retry
                </button>
              </p>
            )}
            <ul className="quest-list">
              <DailyCheckIn key={address} wallet={address} score={score} />
              {tasks.map((task) => (
                <li className={`quest-row ${task.earned ? "done" : "ready"}`} key={task.name}>
                  <div>
                    <h2>{task.name}</h2>
                    <p>{task.detail}</p>
                  </div>
                  <span className="xp-chip">{task.points} XP</span>
                  {task.earned ? (
                    <span className="checkin-recorded">Earned</span>
                  ) : (
                    task.href && (
                      <a className="nft-button" href={task.href}>
                        {task.link}
                      </a>
                    )
                  )}
                </li>
              ))}
            </ul>
            <p className="quest-disclaimer">
              XP includes your earlier confirmed transactions. Browser-only demo points have been
              retired. Testnet XP has no cash value or guaranteed rewards.
            </p>
          </>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
