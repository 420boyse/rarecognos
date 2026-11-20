import { createFileRoute } from "@tanstack/react-router";
import { MarketHeader } from "@/components/market-header";
import { SiteFooter } from "@/components/site-footer";
import { faucetUrl } from "@/lib/nft/network";
import { pageMeta } from "@/lib/site-meta";

export const Route = createFileRoute("/how")({
  head: () =>
    pageMeta({
      title: "How it works · RareCognos",
      description: "Connect a wallet, add LiteForge, get test zkLTC, then mint.",
      path: "/how",
      image: "/og.jpg",
    }),
  component: HowPage,
});

function HowPage() {
  return (
    <div>
      <MarketHeader view="How" />
      <main className="market-section explore-page">
        <div className="section-heading">
          <div>
            <h1>How it works</h1>
            <p>Mint and trade using test zkLTC.</p>
          </div>
        </div>
        <ol className="steps">
          <li>
            <strong>Connect a wallet.</strong> Use the wallet in your browser, or open this site inside MetaMask, Trust
            Wallet, Rainbow, or OKX.
          </li>
          <li>
            <strong>Add LiteForge.</strong> The network button is in the header. Then{" "}
            <a href={faucetUrl} target="_blank" rel="noreferrer">
              get test zkLTC
            </a>
            .
          </li>
          <li>
            <strong>Choose a work.</strong> Browse <a href="/midnight-rogues">MIDNIGHT ROGUES</a> or <a href="/eyed">Eyed</a>. Each work shows its mint status and price.
          </li>
          <li>
            <strong>Mint.</strong> The mint price and the network fee are separate. The wallet shows the fee before you
            confirm. A signature for an upload is not a mint.
          </li>
          <li><strong>List your NFT.</strong> Choose “List this NFT” on your mint receipt, or open <a href="/#my-nfts">My NFTs</a> and pick a work. Enter a price, approve the marketplace when prompted, and confirm the listing in your wallet.</li>
          <li><strong>Manage your listing.</strong> Open <a href="/network-market?mine=1">your network listings</a> to share or cancel a network sale. Buyers can find active listings on <a href="/explore">Explore</a>.</li>
        </ol>
      </main>
      <SiteFooter />
    </div>
  );
}
