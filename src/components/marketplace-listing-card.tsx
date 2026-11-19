import { useState } from "react";
import { formatEther } from "viem";
import type { MarketplaceListing } from "@/lib/nft/data";

export function MarketplaceListingCard({ listing, title, image, loading, href }: {
  listing: MarketplaceListing;
  href?: string;
  title: string;
  image?: string;
  loading: boolean;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  return (
    <a
      className="rc-nft-card nft-live-card"
      href={href || `/token/${String(listing.tokenId)}`}
      aria-label={`View ${title}, listed for ${formatEther(listing.price)} zkLTC`}
    >
      <div className="rc-nft-art nft-live-art">
        {image && !imageFailed ? (
          <img
            src={image}
            alt={title}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <div className="nft-live-fallback" role="img" aria-label={loading ? "Loading NFT image" : "NFT image unavailable"}>
            <span>{loading ? "Loading artwork…" : "Artwork unavailable"}</span>
            <strong>#{String(listing.tokenId)}</strong>
          </div>
        )}
      </div>
      <div className="rc-nft-info nft-live-info">
        <strong>{title}</strong>
        <span>{formatEther(listing.price)} zkLTC · Listed</span>
      </div>
    </a>
  );
}
