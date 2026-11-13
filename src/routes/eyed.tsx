import { createFileRoute } from "@tanstack/react-router";
import { FanStackNFT } from "@/components/fan-stack-nft";
import { MarketHeader } from "@/components/market-header";
import { SiteFooter } from "@/components/site-footer";
import { eyed, eyedNetwork, eyedPrice } from "@/data/eyed";

export const Route = createFileRoute("/eyed")({
  component: EyedPage,
});

function EyedPage() {
  return (
    <div>
      <MarketHeader view="Eyed" />
      <main className="eyed-page">
        <FanStackNFT
          items={eyed.map((face) => ({
            id: face.id,
            title: face.name,
            image: `/art/eyed/${face.id}.jpg`,
            medium: "100 editions",
            price: eyedPrice,
            network: eyedNetwork,
          }))}
        />
      </main>
      <SiteFooter />
    </div>
  );
}
