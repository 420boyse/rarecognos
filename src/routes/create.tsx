import { createFileRoute } from "@tanstack/react-router";
import { useAccount } from "wagmi";
import { MarketHeader } from "@/components/market-header";
import { NetworkHelp } from "@/components/network-help";
import { NFTMarket } from "@/components/nft-market";
import { CreatorDashboard } from "@/components/nft-drops";
import { SiteFooter } from "@/components/site-footer";
import { chain } from "@/lib/nft/config";

import { pageMeta } from "@/lib/site-meta";

export const Route = createFileRoute("/create")({
  head: () =>
    pageMeta({
      title: "Create · RareCognos",
      description: "Prepare an image, then mint it. Uploading is not the same as minting.",
      path: "/create",
      image: "/og.jpg",
    }),
  component: CreatePage,
});

function CreatePage() {
  const account = useAccount();
  const needsNetwork = !account.isConnected || account.chainId !== chain.id;
  return (
    <div>
      <MarketHeader view="Create" />
      <main className="create-page">
        {needsNetwork && <NetworkHelp />}
        <NFTMarket tab="Create" onAvailability={() => {}} onViewChange={() => {}} />
        <CreatorDashboard />
      </main>
      <SiteFooter />
    </div>
  );
}
