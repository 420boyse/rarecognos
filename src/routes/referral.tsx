import { createFileRoute } from "@tanstack/react-router";
import { MarketHeader } from "@/components/market-header";
import { SiteFooter } from "@/components/site-footer";

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
      <SiteFooter />
    </div>
  );
}
