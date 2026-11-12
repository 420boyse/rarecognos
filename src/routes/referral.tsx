import { createFileRoute } from "@tanstack/react-router";
import { MarketHeader } from "@/components/market-header";
import { Wordmark } from "@/components/wordmark";

export const Route = createFileRoute("/referral")({
  component: ReferralPage,
});

function ReferralPage() {
  return (
    <div>
      <MarketHeader view="Referral" />
      <main className="market-section" style={{ paddingTop: 128 }}>
        <div className="section-heading">
          <div>
            <h1>Referral</h1>
            <p>Not live. Invites do not pay out.</p>
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
