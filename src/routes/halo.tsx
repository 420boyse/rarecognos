import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { MarketHeader } from "@/components/market-header";
import { SiteFooter } from "@/components/site-footer";
import { halo, haloNetwork, haloPrice } from "@/data/halo";

export const Route = createFileRoute("/halo")({
  component: HaloPage,
});

function HaloPage() {
  const params = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
  const pieceId = params.get("piece") || "";
  const [open, setOpen] = useState(pieceId);
  const cardRef = useRef<HTMLDivElement>(null);
  const piece = halo.find((item) => item.id === open);

  useEffect(() => {
    if (!piece) return;
    const node = cardRef.current;
    const previous = document.activeElement as HTMLElement | null;
    node?.querySelector<HTMLElement>("button")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen("");
      if (event.key !== "Tab" || !node) return;
      const items = [...node.querySelectorAll<HTMLElement>("button, a")];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [piece]);

  return (
    <div>
      <MarketHeader view="Halo" />
      <main className="market-section explore-page">
        <div className="section-heading">
          <div>
            <h1>Halo</h1>
            <p>Six figures. One set. Not live yet.</p>
          </div>
        </div>
        <ul className="halo-set">
          {halo.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => {
                  setOpen(item.id);
                  const next = new URLSearchParams(window.location.search);
                  next.set("piece", item.id);
                  history.replaceState(null, "", `${window.location.pathname}?${next}`);
                }}
              >
                <img src={`/art/halo/${item.id}.png`} alt="" />
                <span>{item.name}</span>
              </button>
            </li>
          ))}
        </ul>
        {piece && (
          <div className="eyed-story" role="dialog" aria-modal="true" aria-labelledby="halo-story-title">
            <button type="button" className="eyed-story-backdrop" aria-label="Close" onClick={() => setOpen("")} />
            <div className="eyed-story-card" ref={cardRef}>
              <button type="button" className="eyed-story-close" aria-label="Close" onClick={() => setOpen("")}>
                ×
              </button>
              <img src={`/art/halo/${piece.id}.png`} alt="" />
              <div>
                <h2 id="halo-story-title">{piece.name}</h2>
                <p>{piece.story}</p>
                <p>
                  {haloPrice} · {haloNetwork}
                </p>
                <button className="primary-action" type="button" disabled>
                  Not live yet
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
      <SiteFooter exploreHref="/explore" />
    </div>
  );
}
