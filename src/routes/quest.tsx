import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAccount } from "wagmi";
import { MarketHeader } from "@/components/market-header";
import { SiteFooter } from "@/components/site-footer";
import { memberKey, saveProgress, useGmail, useProgress } from "@/lib/member";

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

  useEffect(() => {
    if (!pending && !allowed) location.replace("/");
  }, [pending, allowed]);

  return (
    <div>
      <MarketHeader view="Quest" />
      <main className="market-section" style={{ paddingTop: 128 }}>
        {allowed && (
          <div className="section-heading">
            <div>
              <h1>Quest</h1>
              <p>{progress.xp} XP</p>
            </div>
          </div>
        )}
        {allowed && (
          <article className="quest-card">
            <div>
              <h2>Say hello to Cognos</h2>
              <p>One click. 50 XP.</p>
            </div>
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
          </article>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
