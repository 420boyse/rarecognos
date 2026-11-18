import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { MarketHeader } from "@/components/market-header";
import { SiteFooter } from "@/components/site-footer";
import { FanStackNFT } from "@/components/fan-stack-nft";
import { MarketplaceListingCard } from "@/components/marketplace-listing-card";
import { useListings } from "@/lib/nft/data";
import { eyedNetwork, eyedPrice } from "@/data/eyed";
import { halo, haloPrice } from "@/data/halo";
import { works, type Work } from "@/data/works";
import eyedDeployment from "../../config/eyed.json";
import haloDeployment from "../../config/halo.json";
import { featuredEyed } from "@/lib/nft/piece-index";
import { useDropStatus } from "@/lib/nft/use-drop-status";
import { pageMeta } from "@/lib/site-meta";

const faces = featuredEyed();
const studioIds = ["nocturne", "blue-index", "red-aperture", "second-sight"];
const featuredStudio = studioIds.flatMap((id) => works.filter((work) => work.id === id));

function DeferredArt({ src, eager = false, pixel = false }: { src: string; eager?: boolean; pixel?: boolean }) {
  const ref = useRef<HTMLImageElement>(null);
  const [shown, setShown] = useState(eager);
  useEffect(() => {
    if (eager) return;
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setShown(true);
        observer.disconnect();
      },
      { rootMargin: "240px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [eager]);
  return (
    <img
      ref={ref}
      className={pixel ? "is-pixel" : undefined}
      src={shown ? src : undefined}
      alt=""
      width="640"
      height="640"
      decoding="async"
      loading={eager ? "eager" : "lazy"}
    />
  );
}

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
  const [activeStudioWork, setActiveStudioWork] = useState<Work | null>(null);
  const studioDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (activeStudioWork && !studioDialog.current?.open) studioDialog.current?.showModal();
  }, [activeStudioWork]);
  const listings = useListings();
  const activeListings = listings.data?.pages.flatMap((page) => page.listings).filter((listing) => listing.valid) ?? [];
  const eyedDrop = useDropStatus(eyedDeployment.address);
  const haloDrop = useDropStatus(haloDeployment.address || undefined);
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
                    <DeferredArt src="/art/eyed/02.jpg" eager pixel />
                    <strong>Eyed</strong>
                    <em>8 featured of 9 · 100 editions each</em>
                    <span>Mint {eyedPrice} · {eyedNetwork}</span>
                    <span className="status-pill">{eyedDrop.label}</span>
                  </a>
                </li>
              )}
              {showHaloCollection && (
                <li>
                  <a className="catalog-card" href="/halo">
                    <DeferredArt src="/art/halo/01.png" eager />
                    <strong>Halo</strong>
                    <em>6 pieces · 100 editions each</em>
                    <span>Planned {haloPrice}</span>
                    <span className="status-pill">{haloDrop.label}</span>
                  </a>
                </li>
              )}
            </ul>
          </section>
        )}
        <section className="explore-live-listings" aria-labelledby="live-sales-title">
          <div className="section-heading">
            <div>
              <h2 id="live-sales-title">Live listings</h2>
              <p>Available NFTs listed by their current owners. Prices are read from LiteForge.</p>
            </div>
          </div>
          {listings.isPending && <p className="explore-empty" role="status">Checking active listings…</p>}
          {listings.isError && (
            <p className="explore-empty" role="alert">
              Live listings could not be loaded.{" "}
              <button className="nft-button" onClick={() => void listings.refetch()}>Retry</button>
            </p>
          )}
          {activeListings.length > 0 && (
            <div className="explore-live-grid">
              {activeListings.map((listing) => (
                <MarketplaceListingCard key={String(listing.id)} listing={listing} search={query} />
              ))}
            </div>
          )}
          {!listings.isPending && !listings.isError && activeListings.length === 0 && !listings.hasNextPage && (
            <p className="explore-empty">No active sales from the RareCognos collection yet. Minted works and studio previews are still available to explore.</p>
          )}
          {listings.hasNextPage && (
            <button
              type="button"
              className="nft-button explore-load-more"
              disabled={listings.isFetchingNextPage}
              onClick={() => void listings.fetchNextPage()}
            >
              {listings.isFetchingNextPage ? "Loading…" : "Load more listings"}
            </button>
          )}
        </section>
        {!q && (
          <FanStackNFT
            studio
            items={featuredStudio}
            onSelectWork={(id) => setActiveStudioWork(featuredStudio.find((work) => work.id === id) ?? null)}
          />
        )}
        {(showPiece || showHaloPiece || showEyedCollection || showHaloCollection) && (
          <section aria-labelledby="works-title">
            <h2 id="works-title">Works</h2>
            <ul className="catalog-grid">
              {showPiece && piece && (
                <li>
                  <a className="catalog-card" href={`/eyed?piece=${piece.id}`}>
                    <DeferredArt src={`/art/eyed/${piece.id}.jpg`} pixel />
                    <strong>{piece.name}</strong>
                    <em>Eyed</em>
                    <span>Mint {eyedPrice}</span>
                    <span className="status-pill">{eyedDrop.label}</span>
                  </a>
                </li>
              )}
              {showHaloPiece && figure && (
                <li>
                  <a className="catalog-card" href={`/halo?piece=${figure.id}`}>
                    <DeferredArt src={`/art/halo/${figure.id}.png`} />
                    <strong>{figure.name}</strong>
                    <em>Halo</em>
                    <span>Planned {haloPrice}</span>
                    <span className="status-pill">{haloDrop.label}</span>
                  </a>
                </li>
              )}
              {showEyedCollection &&
                faces.map((face) => (
                  <li key={face.id}>
                    <a className="catalog-card" href={`/eyed?piece=${face.id}`}>
                      <DeferredArt src={`/art/eyed/${face.id}.jpg`} pixel />
                      <strong>{face.name}</strong>
                      <em>Eyed</em>
                      <span>Mint {eyedPrice}</span>
                      <span className="status-pill">{eyedDrop.label}</span>
                    </a>
                  </li>
                ))}
              {showHaloCollection &&
                halo.map((item) => (
                  <li key={item.id}>
                    <a className="catalog-card" href={`/halo?piece=${item.id}`}>
                      <DeferredArt src={`/art/halo/${item.id}.png`} />
                      <strong>{item.name}</strong>
                      <em>Halo</em>
                      <span>Planned {haloPrice}</span>
                      <span className="status-pill">{haloDrop.label}</span>
                    </a>
                  </li>
                ))}
            </ul>
          </section>
        )}
      </main>
      {activeStudioWork && (
        <dialog
          ref={studioDialog}
          aria-labelledby="explore-studio-title"
          className="max-h-[85dvh] overflow-y-auto rounded-2xl p-0"
          onClose={() => setActiveStudioWork(null)}
        >
          <div className="grid md:grid-cols-2">
            <img src={activeStudioWork.image} alt="" className="max-h-80 w-full object-cover md:h-full" />
            <div className="flex flex-col gap-4 p-6">
              <div className="flex items-start justify-between gap-4">
                <h2 id="explore-studio-title" className="text-2xl">{activeStudioWork.title}</h2>
                <form method="dialog">
                  <button type="submit" className="nft-button">Close</button>
                </form>
              </div>
              <p>{activeStudioWork.medium} · {activeStudioWork.year}</p>
              <p>{activeStudioWork.description}</p>
              <p className="text-sm text-fg/60">Studio preview</p>
            </div>
          </div>
        </dialog>
      )}
      <SiteFooter exploreHref="/explore" />
    </div>
  );
}
