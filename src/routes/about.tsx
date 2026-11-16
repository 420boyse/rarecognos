import { createFileRoute } from "@tanstack/react-router";
import { MarketHeader } from "@/components/market-header";
import { SiteFooter } from "@/components/site-footer";
import { pageMeta } from "@/lib/site-meta";

export const Route = createFileRoute("/about")({
  head: () =>
    pageMeta({
      title: "About · RareCognos",
      description: "Discover, create, collect and trade digital art on the LiteForge testnet.",
      path: "/about",
      image: "/og.jpg",
    }),
  component: AboutPage,
});

function AboutPage() {
  return (
    <div>
      <MarketHeader view="About" />
      <main className="market-section explore-page">
        <div className="section-heading">
          <div>
            <h1>About</h1>
            <p>An eye for the rare.</p>
          </div>
        </div>
        <div className="prose-block">
          <p>
            RareCognos is a space to discover, create, collect, and trade digital art on the LiteForge testnet.
            Connect your wallet to mint a published work, create your own, or list and collect supported NFTs.
          </p>
          <p>
            Discover drops like Eyed and Halo alongside work from the RareCognos studio. Availability varies by
            collection, and studio previews are marked separately from works available to collect.
          </p>
          <p>
            Follow{" "}
            <a href="https://x.com/RareCognos" target="_blank" rel="noreferrer">
              RareCognos on X
            </a>
            .
          </p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
