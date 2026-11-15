import { createFileRoute } from "@tanstack/react-router";
import { MarketHeader } from "@/components/market-header";
import { SiteFooter } from "@/components/site-footer";
import { pageMeta } from "@/lib/site-meta";

export const Route = createFileRoute("/about")({
  head: () =>
    pageMeta({
      title: "About · RareCognos",
      description: "RareCognos is a small testnet studio for minting digital work on LiteForge.",
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
            RareCognos is a studio front for digital work on the LiteForge testnet. It is not a secondary market. You
            connect a wallet, mint a published work, or prepare one of your own.
          </p>
          <p>
            Eyed is the open drop: nine faces in the contract, eight featured on the site, 100 editions each. Halo is
            on the site and not open yet. Studio works on the home page are previews, not listings.
          </p>
          <p>
            There is no company address, registration number, or support inbox published here. The public account is{" "}
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
