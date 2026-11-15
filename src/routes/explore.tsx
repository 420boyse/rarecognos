import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { MarketHeader } from "@/components/market-header";
import { SiteFooter } from "@/components/site-footer";
import { eyedNetwork, eyedPrice } from "@/data/eyed";
import { halo, haloPrice } from "@/data/halo";
import eyedDeployment from "../../config/eyed.json";
import haloDeployment from "../../config/halo.json";
import { isAddress } from "viem";
import { featuredEyed } from "@/lib/nft/piece-index";
import { pageMeta } from "@/lib/site-meta";

const faces = featuredEyed();
const eyedLive = Boolean(eyedDeployment.address && isAddress(eyedDeployment.address));
const haloLive = Boolean(haloDeployment.address && isAddress(haloDeployment.address));

export const Route = createFileRoute("/explore")({
  head: () =>
    pageMeta({
      title: "Explore · RareCognos",
      description: "Search Eyed and Halo. One result opens that work.",
      path: "/explore",
      image: "/art/eyed/02.jpg",
    }),
  component: ExplorePage,
});

function ExplorePage() {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const collectionHit = !q || "eyed".includes(q) || q.includes("eyed");
  const haloHit = !q || "halo".includes(q) || q.includes("halo");
  const piece = faces.find((face) => face.name.toLowerCase().includes(q));
  const figure = halo.find((item) => item.name.toLowerCase().includes(q));
  const showPiece = Boolean(q && piece && !collectionHit);
  const showHaloPiece = Boolean(q && figure && !haloHit);
  const showEyedCollection = !showPiece && collectionHit;
  const showHaloCollection = !showPiece && !showHaloPiece && haloHit;
  const nothing = Boolean(q) && !showPiece && !showHaloPiece && !showEyedCollection && !showHaloCollection;

  return (
    <div>
      <MarketHeader view="Explore" />
      <main className="market-section explore-page">
        <div className="section-heading">
          <div>
            <h1>Explore</h1>
            <p>Search a collection or a work. One result opens that work.</p>
          </div>
        </div>
        <label className="explore-search-label" htmlFor="explore-q">
          Search
          <input
            id="explore-q"
            className="explore-search"
            value={query}
            placeholder="Eyed, Halo, Spire"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        {nothing && (
          <p className="explore-empty" role="status">
            Nothing matches “{query.trim()}”.{" "}
            <button type="button" className="nft-button" onClick={() => setQuery("")}>
              Clear search
            </button>
          </p>
        )}
        {(showEyedCollection || showHaloCollection) && (
          <section aria-labelledby="collections-title">
            <h2 id="collections-title">Collections</h2>
            <ul className="catalog-grid catalog-grid--collections">
              {showEyedCollection && (
                <li>
                  <a className="catalog-card" href="/eyed">
                    <img className="is-pixel" src="/art/eyed/02.jpg" alt="" width="640" height="640" />
                    <strong>Eyed</strong>
                    <em>8 featured of 9 · 100 editions each</em>
                    <span>Mint {eyedPrice} · {eyedNetwork}</span>
                    <span className="status-pill">{eyedLive ? "Mint open" : "Coming soon"}</span>
                  </a>
                </li>
              )}
              {showHaloCollection && (
                <li>
                  <a className="catalog-card" href="/halo">
                    <img src="/art/halo/01.png" alt="" width="640" height="640" />
                    <strong>Halo</strong>
                    <em>6 pieces · 100 editions each</em>
                    <span>Planned {haloPrice}</span>
                    <span className="status-pill">{haloLive ? "Mint open" : "Coming soon"}</span>
                  </a>
                </li>
              )}
            </ul>
          </section>
        )}
        {(showPiece || showHaloPiece || showEyedCollection || showHaloCollection) && (
          <section aria-labelledby="works-title">
            <h2 id="works-title">Works</h2>
            <ul className="catalog-grid">
              {showPiece && piece && (
                <li>
                  <a className="catalog-card" href={`/eyed?piece=${piece.id}`}>
                    <img className="is-pixel" src={`/art/eyed/${piece.id}.jpg`} alt="" width="640" height="640" />
                    <strong>{piece.name}</strong>
                    <em>Eyed</em>
                    <span>Mint {eyedPrice}</span>
                    <span className="status-pill">{eyedLive ? "Mint open" : "Coming soon"}</span>
                  </a>
                </li>
              )}
              {showHaloPiece && figure && (
                <li>
                  <a className="catalog-card" href={`/halo?piece=${figure.id}`}>
                    <img src={`/art/halo/${figure.id}.png`} alt="" width="640" height="640" />
                    <strong>{figure.name}</strong>
                    <em>Halo</em>
                    <span>Planned {haloPrice}</span>
                    <span className="status-pill">{haloLive ? "Mint open" : "Coming soon"}</span>
                  </a>
                </li>
              )}
              {showEyedCollection &&
                faces.map((face) => (
                  <li key={face.id}>
                    <a className="catalog-card" href={`/eyed?piece=${face.id}`}>
                      <img className="is-pixel" src={`/art/eyed/${face.id}.jpg`} alt="" width="640" height="640" />
                      <strong>{face.name}</strong>
                      <em>Eyed</em>
                      <span>Mint {eyedPrice}</span>
                      <span className="status-pill">{eyedLive ? "Mint open" : "Coming soon"}</span>
                    </a>
                  </li>
                ))}
              {showHaloCollection &&
                halo.map((item) => (
                  <li key={item.id}>
                    <a className="catalog-card" href={`/halo?piece=${item.id}`}>
                      <img src={`/art/halo/${item.id}.png`} alt="" width="640" height="640" />
                      <strong>{item.name}</strong>
                      <em>Halo</em>
                      <span>Planned {haloPrice}</span>
                      <span className="status-pill">{haloLive ? "Mint open" : "Coming soon"}</span>
                    </a>
                  </li>
                ))}
            </ul>
          </section>
        )}
      </main>
      <SiteFooter exploreHref="/explore" />
    </div>
  );
}
