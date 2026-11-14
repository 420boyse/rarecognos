import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { MarketHeader } from "@/components/market-header";
import { SiteFooter } from "@/components/site-footer";
import { eyed, eyedNetwork, eyedPrice } from "@/data/eyed";
import { halo, haloNetwork, haloPrice } from "@/data/halo";

const faces = eyed.filter((face) => face.id !== "01");

export const Route = createFileRoute("/explore")({
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
  const showHalo = Boolean(q && figure && !haloHit);
  return (
    <div>
      <MarketHeader view="Explore" />
      <main className="market-section explore-page">
        <div className="section-heading">
          <div>
            <h1>Explore</h1>
            <p>Search a collection or a piece. One result opens that work.</p>
          </div>
        </div>
        <input
          className="explore-search"
          value={query}
          placeholder="Eyed, Halo, a piece name"
          onChange={(event) => setQuery(event.target.value)}
        />
        <ul className="explore-list">
          {showPiece && piece && (
            <li>
              <a href={`/eyed?piece=${piece.id}`}>
                <img src={`/art/eyed/${piece.id}.jpg`} alt="" />
                <span>
                  <strong>{piece.name}</strong>
                  <em>Eyed</em>
                </span>
                <span>{eyedPrice}</span>
                <span>{eyedNetwork}</span>
              </a>
            </li>
          )}
          {!showPiece && !showHalo && haloHit && (
            <li>
              <a href="/halo">
                <img src="/art/halo/01.png" alt="" />
                <span>
                  <strong>Halo</strong>
                  <em>6 pieces</em>
                </span>
                <span>{haloPrice}</span>
                <span>{haloNetwork}</span>
              </a>
            </li>
          )}
          {showHalo && figure && (
            <li>
              <a href={`/halo?piece=${figure.id}`}>
                <img src={`/art/halo/${figure.id}.png`} alt="" />
                <span>
                  <strong>{figure.name}</strong>
                  <em>Halo</em>
                </span>
                <span>{haloPrice}</span>
                <span>{haloNetwork}</span>
              </a>
            </li>
          )}
          {!showPiece && collectionHit && (
            <li>
              <a href="/eyed">
                <img src="/art/eyed/02.jpg" alt="" />
                <span>
                  <strong>Eyed</strong>
                  <em>8 pieces · 100 each</em>
                </span>
                <span>{eyedPrice}</span>
                <span>{eyedNetwork}</span>
              </a>
            </li>
          )}
          {!showPiece && collectionHit && (
            <li>
              <ul className="eyed-set">
                {faces.map((face) => (
                  <li key={face.id}>
                    <a href={`/eyed?piece=${face.id}`}>
                      <img src={`/art/eyed/${face.id}.jpg`} alt="" />
                      <span>{face.name}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </li>
          )}
          {!showPiece && !showHalo && !collectionHit && !haloHit && <li className="explore-empty">Nothing matches.</li>}
        </ul>
      </main>
      <SiteFooter exploreHref="/explore" />
    </div>
  );
}
