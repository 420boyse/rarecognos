import { createFileRoute } from "@tanstack/react-router";
import { MarketHeader } from "@/components/market-header";
import { SiteFooter } from "@/components/site-footer";
import { eyed } from "@/data/eyed";

export const Route = createFileRoute("/eyed")({
  component: EyedPage,
});

function EyedPage() {
  return (
    <div>
      <MarketHeader view="Eyed" />
      <main className="market-section eyed-page">
        <div className="section-heading">
          <div>
            <h1>Eyed</h1>
            <p>Nine faces. 100 editions each, once the set is on testnet.</p>
          </div>
        </div>
        <ul className="eyed-set">
          {eyed.map((face) => (
            <li key={face.id}>
              <img src={`/art/eyed/${face.id}.jpg`} alt={face.name} />
              <span>{face.name}</span>
            </li>
          ))}
        </ul>
        <p className="market-notice">
          The drop factory is not on LiteForge yet. A wallet has to sign the launch. This chat cannot sign for you.
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
