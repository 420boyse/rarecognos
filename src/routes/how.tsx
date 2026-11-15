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
            <p>Four steps. Test funds only.</p>
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
            <strong>Choose a work.</strong> Eyed is open. Halo is not. Studio images are previews.
          </li>
          <li>
            <strong>Mint.</strong> The mint price and the network fee are separate. The wallet shows the fee before you
            confirm. A signature for an upload is not a mint.
          </li>
        </ol>
      </main>
      <SiteFooter />
    </div>
  );
}
