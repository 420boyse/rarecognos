import { useState } from "react";
import { formatEther } from "viem";
import { useListings, useMetadata, useToken } from "@/lib/nft/data";
import { configured } from "@/lib/nft/config";
import { useDropStatus } from "@/lib/nft/use-drop-status";
import eyedDeployment from "../../config/eyed.json";
import haloDeployment from "../../config/halo.json";

type Filter = "All" | "Mint" | "Listings";

function ListingCard({ id }: { id: bigint }) {
  const token = useToken(id);
  const meta = useMetadata(token.data?.uri);
  const [imageFailed, setImageFailed] = useState(false);
  const data = token.data;
  return (
    <article className="home-nft-card">
      <a href={`/#token/${id}`} aria-label={`View ${meta.data?.name || "token " + id}`}>
        <div className="home-nft-image">
          {meta.data && !imageFailed ? <img src={meta.data.image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setImageFailed(true)} /> : <span>{meta.isPending ? "Loading artwork…" : "Artwork unavailable"}</span>}
        </div>
        <div className="home-nft-info">
          <strong>{meta.data?.name || `Token #${id}`}</strong>
          <span>{!data?.saleReady ? "Checking listing…" : data.active && data.listing ? `${formatEther(data.listing[2])} zkLTC` : "Unavailable"}</span>
        </div>
      </a>
    </article>
  );
}

export function HomeMarketplace() {
  const [filter, setFilter] = useState<Filter>("All");
  const listings = useListings();
  const eyed = useDropStatus(eyedDeployment.address);
  const halo = useDropStatus(haloDeployment.address || undefined);
  const active = listings.data?.pages.flatMap((page) => page.listings).filter((item) => item.valid) || [];
  const showListings = filter !== "Mint";
  const showMint = filter !== "Listings";
  return (
    <section className="home-marketplace studio-section" id="marketplace" aria-labelledby="home-market-title">
      <div className="section-heading">
        <div><h2 id="home-market-title">Explore NFTs</h2><p>Discover mints and listings on LiteForge Testnet.</p></div>
      </div>
      <div className="home-market-tabs" role="group" aria-label="Filter NFTs">
        {(["All", "Mint", "Listings"] as const).map((item) => (
          <button type="button" key={item} aria-pressed={filter === item} onClick={() => setFilter(item)}>{item}</button>
        ))}
      </div>
      {showListings && <div className="home-market-group">
        <h3>Listings</h3>
        {!configured ? <p>Marketplace is unavailable on this network.</p> : listings.isPending ? <p role="status">Checking listings…</p> : listings.isError ? <p role="alert">Could not load listings. <button type="button" className="nft-button" onClick={() => void listings.refetch()}>Try again</button></p> : <>
          {active.length > 0 ? <div className="home-nft-grid">{active.map((item) => <ListingCard key={String(item.id)} id={item.tokenId} />)}</div> : <p>No active listings found in the loaded results.</p>}
          {listings.hasNextPage && <button className="secondary-action" type="button" disabled={listings.isFetchingNextPage} onClick={() => void listings.fetchNextPage()}>{listings.isFetchingNextPage ? "Loading…" : "Load older listings"}</button>}
        </>}
      </div>}
      {showMint && <div className="home-market-group">
        <h3>Mint</h3>
        <div className="home-nft-grid">
          <article className="home-nft-card"><a href="/eyed"><div className="home-nft-image"><img src="/art/eyed/04.jpg" alt="" loading="lazy" /></div><div className="home-nft-info"><strong>Eyed</strong><span>{eyed.label}</span></div></a></article>
          <article className="home-nft-card"><a href="/halo"><div className="home-nft-image"><img src="/art/halo/01.png" alt="" loading="lazy" /></div><div className="home-nft-info"><strong>Halo</strong><span>{halo.label}</span></div></a></article>
        </div>
      </div>}
    </section>
  );
}
