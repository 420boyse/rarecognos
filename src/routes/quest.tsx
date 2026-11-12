import { createFileRoute } from "@tanstack/react-router";
import { MarketHeader } from "@/components/market-header";
import { Wordmark } from "@/components/wordmark";

export const Route = createFileRoute("/quest")({
  component: QuestPage,
});

function QuestPage() {
  return (
    <div>
      <MarketHeader view="Quest" />
      <main className="market-section" style={{ paddingTop: 128 }}>
        <div className="section-heading">
          <div>
            <h1>Quest</h1>
            <p>Not live. No points and no rewards on this testnet.</p>
          </div>
        </div>
      </main>
      <footer className="market-footer">
        <Wordmark />
        <p>For the way you see.</p>
        <a href="/#explore">Explore NFTs</a>
      </footer>
    </div>
  );
}
