import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { MarketHeader } from "@/components/market-header";
import { SiteFooter } from "@/components/site-footer";
import { FanStackNFT } from "@/components/fan-stack-nft";
import { useMarketResults } from "@/lib/nft/network-market";
import { MarketplaceListingCard } from "@/components/marketplace-listing-card";
import { useListings, useListingSearch } from "@/lib/nft/data";
import { eyedNetwork, eyedPrice } from "@/data/eyed";
import { haloPrice } from "@/data/halo";
import { works, type Work } from "@/data/works";
import eyedDeployment from "../../config/eyed.json";
import haloDeployment from "../../config/halo.json";
import { rogueImage, roguePage, useRoguesRelease } from "@/lib/nft/midnight-rogues";
import { searchCatalog, searchParams } from "@/lib/nft/catalog";
import { useDropStatus } from "@/lib/nft/use-drop-status";
import { pageMeta } from "@/lib/site-meta";


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
  validateSearch: searchParams,
  head: () =>
    pageMeta({
      title: "Explore · RareCognos",
      description: "Discover MIDNIGHT ROGUES, Eyed, Halo and works listed on LiteForge.",
      path: "/explore",
      image: "/art/eyed/02.jpg",
    }),
  component: ExplorePage,
});

function ExplorePage() {
  const { q: query = "" } = Route.useSearch();
  const navigate = Route.useNavigate();
  const setQuery = (q: string) => void navigate({ search: { q }, replace: true, resetScroll: false });
  const [activeStudioWork, setActiveStudioWork] = useState<Work | null>(null);
  const studioDialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (activeStudioWork && !studioDialog.current?.open) studioDialog.current?.showModal();
  }, [activeStudioWork]);
  const release = useRoguesRelease();
  const listings = useListings();
  const activeListings = listings.data?.pages.flatMap((page) => page.listings).filter((listing) => listing.valid) ?? [];
  const eyedDrop = useDropStatus(eyedDeployment.address);
  const haloDrop = useDropStatus(haloDeployment.address || undefined);
  const q = query.trim().toLowerCase();
  const local = useListingSearch(activeListings, q);
  const network = useMarketResults(q);
  const matches = [...local.matches.map(card => ({...card, href: `/token/${card.listing.tokenId}`})), ...network.matches];
  const searching = local.searching || !network.settled;
  const showRogues = "midnight rogues".includes(q);
  const showEyedCollection = "eyed".includes(q);
  const showHaloCollection = "halo".includes(q);
  const { rogues: shownRogues, faces: shownFaces, figures: shownFigures, studio } = searchCatalog(q);
  const shownStudio = q ? studio : featuredStudio;
  const nothing = q && !shownRogues.length && !shownStudio.length && !shownFaces.length && !shownFigures.length && !matches.length &&
    listings.isSuccess && !listings.hasNextPage && !searching;

  return (
    <div>
      <MarketHeader view="Explore" />
      <main className="market-section explore-page">
        <div className="section-heading">
          <div>
            <h1>Explore</h1>
            <p>Search collections, works, or a creator’s wallet address.</p>
          </div>
        </div>
        <label className="explore-search-label" htmlFor="explore-q">
          Search
          <input
            id="explore-q"
            className="explore-search"
            value={query}
            maxLength={120} placeholder="AURIC, Eyed, Spire…"
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
        {(showRogues || showEyedCollection || showHaloCollection) && (
          <section aria-labelledby="collections-title">
            <h2 id="collections-title">Collections</h2>
            <ul className="catalog-grid catalog-grid--collections">
              {showRogues && <li><a className="catalog-card" href="/midnight-rogues">
                <DeferredArt src={rogueImage("001")} eager />
                <strong>MIDNIGHT ROGUES</strong><em>10 characters · 10 editions each</em>
                <span>0.001 test zkLTC</span><span className="status-pill">{release.label}</span>
              </a></li>}
              {showEyedCollection && (
                <li>
                  <a className="catalog-card" href="/eyed">
                    <DeferredArt src="/art/eyed/02.jpg" eager pixel />
                    <strong>Eyed</strong>
                    <em>Featured digital works</em>
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
                    <em>Digital artwork collection</em>
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
              <p>Secondary sales across LiteForge collections. Prices are read on-chain.</p>
              <a className="text-link" href="/#my-nfts">List an NFT</a>
            </div>
          </div>
          {listings.isPending && <p className="explore-empty" role="status">Checking active listings…</p>}
          {listings.isError && (
            <p className="explore-empty" role="alert">
              Live listings could not be loaded.{" "}
              <button className="nft-button" onClick={() => void listings.refetch()}>Retry</button>
            </p>
          )}
          {matches.length > 0 && (
            <div className="explore-live-grid">
              {matches.map((card) => (
                <MarketplaceListingCard key={card.href} {...card} />
              ))}
            </div>
          )}
          {!q && !listings.isPending && !listings.isError && !matches.length && network.settled && !network.sales.hasNextPage && !listings.hasNextPage && (
            <p className="explore-empty">No active sales yet. Minted works and studio previews are still available to explore.</p>
          )}
          {network.sales.hasNextPage && <button className="nft-button" disabled={network.sales.isFetchingNextPage} onClick={()=>void network.sales.fetchNextPage()}>Load more network listings</button>}
          {network.error && <p role="status">Network listings are temporarily unavailable.</p>}
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
        {shownStudio.length > 0 && (
          <FanStackNFT
            studio
            key={shownStudio.map((work) => work.id).join(",")}
            items={shownStudio}
            onSelectWork={(id) => setActiveStudioWork(shownStudio.find((work) => work.id === id) ?? null)}
          />
        )}
        {(shownRogues.length > 0 || shownFaces.length > 0 || shownFigures.length > 0) && (
          <section aria-labelledby="works-title">
            <h2 id="works-title">Works</h2>
            <ul className="catalog-grid">
              {shownRogues.map((r) => <li key={r.name}><a className="catalog-card" href={roguePage(r.id)}>
                <DeferredArt src={rogueImage(r.id)} /><strong>#{r.id} — {r.name}</strong><em>{r.title}</em><span>MIDNIGHT ROGUES</span>
              </a></li>)}
              {shownFaces.map((face) => (
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
              {shownFigures.map((item) => (
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
