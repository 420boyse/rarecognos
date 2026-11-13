import { createFileRoute } from "@tanstack/react-router";
import { MarketHeader } from "@/components/market-header";
import { NFTMarket } from "@/components/nft-market";
import { CreatorDashboard } from "@/components/nft-drops";
import { SiteFooter } from "@/components/site-footer";

export const Route = createFileRoute("/create")({
  component: CreatePage,
});

function CreatePage() {
  return (
    <div>
      <MarketHeader view="Create" />
      <main className="create-page">
        <NFTMarket tab="Create" onAvailability={() => {}} onViewChange={() => {}} />
        <CreatorDashboard />
      </main>
      <SiteFooter />
    </div>
  );
}
