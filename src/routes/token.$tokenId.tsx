import { createFileRoute, notFound } from "@tanstack/react-router";
import { createPublicClient, http } from "viem";
import { MarketHeader } from "@/components/market-header";
import { NFTMarket } from "@/components/nft-market";
import { SiteFooter } from "@/components/site-footer";
import { chain } from "@/lib/nft/config";
import { metadata, nftCall } from "@/lib/nft/data";
import { pageMeta } from "@/lib/site-meta";

const client = createPublicClient({ chain, transport: http(undefined, { timeout: 4000, retryCount: 0 }) });

export const Route = createFileRoute("/token/$tokenId")({
  loader: async ({ params: { tokenId } }) => {
    if (!/^[1-9][0-9]{0,77}$/.test(tokenId) || BigInt(tokenId) >= 2n ** 256n) throw notFound();
    try {
      const uri = await client.readContract({ ...nftCall, functionName: "tokenURI", args: [BigInt(tokenId)] });
      // The marketplace contract mints IPFS URIs. Fetch only through our configured gateway.
      if (uri.startsWith("ipfs://")) return await metadata(uri, { redirect: "error", timeout: 12000 });
    } catch {
      // Keep the public token link usable when the RPC or IPFS gateway is unavailable.
    }
    return null;
  },
  head: ({ params, loaderData }) => pageMeta({
    title: `${loaderData?.name || `Token #${params.tokenId}`} · RareCognos`,
    description: loaderData?.description || `Discover RareCognos token #${params.tokenId} on the LiteForge testnet.`,
    path: `/token/${params.tokenId}`,
    image: loaderData?.image ? { url: loaderData.image, alt: loaderData.name } : undefined,
  }),
  component: TokenPage,
});

function TokenPage() {
  const { tokenId } = Route.useParams();
  return (
    <>
      <MarketHeader view="Explore" />
      <main style={{ paddingTop: "var(--header-block)" }}>
        <NFTMarket tab={`Token:${tokenId}`} onAvailability={() => {}} onViewChange={() => {}} />
      </main>
      <SiteFooter />
    </>
  );
}
