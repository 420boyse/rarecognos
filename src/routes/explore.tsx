import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { MarketHeader } from "@/components/market-header";
import { SiteFooter } from "@/components/site-footer";
import { eyed, eyedNetwork, eyedPrice } from "@/data/eyed";

export const Route = createFileRoute("/explore")({
  component: ExplorePage,
});

function ExplorePage() {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const collectionHit = !q || "eyed".includes(q) || q.includes("eyed");
  const piece = eyed.find((face) => face.name.toLowerCase().includes(q));
  const showPiece = Boolean(q && piece && !collectionHit);
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
          placeholder="Eyed, Vanta, a collection name"
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
          {!showPiece && collectionHit && (
            <li>
              <a href="/eyed">
                <img src="/art/eyed/01.jpg" alt="" />
                <span>
                  <strong>Eyed</strong>
                  <em>9 pieces · 100 each</em>
                </span>
                <span>{eyedPrice}</span>
                <span>{eyedNetwork}</span>
              </a>
            </li>
          )}
          {!showPiece && collectionHit && (
            <li>
              <ul className="eyed-set">
                {eyed.map((face) => (
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
          {!showPiece && !collectionHit && <li className="explore-empty">Nothing matches.</li>}
        </ul>
      </main>
      <SiteFooter exploreHref="/explore" />
    </div>
  );
}
