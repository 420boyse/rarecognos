import { createFileRoute } from "@tanstack/react-router";
import { useAccount } from "wagmi";
import { MarketHeader } from "@/components/market-header";
import { NetworkHelp } from "@/components/network-help";
import { NFTMarket } from "@/components/nft-market";
import { CreatorDashboard } from "@/components/nft-drops";
import { SiteFooter } from "@/components/site-footer";
import { OpenRelease } from "@/components/open-release";
import { useEditionFactory } from "@/lib/nft/drops";
import release from "../../config/edition-factory.json";
import { chain, contracts } from "@/lib/nft/config";

import { pageMeta } from "@/lib/site-meta";

export const Route = createFileRoute("/create")({
  validateSearch: (s: Record<string, unknown>) => ({ setup: Number(s.setup) === 1 ? 1 : undefined }),
  head: () =>
    pageMeta({
      title: "Create · RareCognos",
      description: "Prepare an image, then mint it. Uploading is not the same as minting.",
      path: "/create",
    }),
  component: CreatePage,
});

function CreatePage() {
  const account = useAccount();
  const { setup } = Route.useSearch();
  const factory = useEditionFactory();
  const needsNetwork = !account.isConnected || account.chainId !== chain.id;
  return (
    <div>
      <MarketHeader view="Create" />
      <main className="create-page">
        {needsNetwork && <NetworkHelp />}
        <NFTMarket tab="Create" onAvailability={() => {}} onViewChange={() => {}} />
        {setup && contracts.factory === release.address && !factory.data && <OpenRelease release={release} artifact="RareCognosEditionFactory" title="Open artist editions" explanation="Activate creator-owned editions on LiteForge. Each artist sets the supply and mint price." action="Activate editions" ready={factory.data === false && !factory.isError} refresh={() => void factory.refetch()} />}
        <CreatorDashboard />
      </main>
      <SiteFooter />
    </div>
  );
}
