import { useState } from "react";
import { formatEther, type Address } from "viem";
import { useMetadata, useToken } from "@/lib/nft/data";

export type MarketplaceListing = {
  id: bigint;
  tokenId: bigint;
  seller: Address;
  price: bigint;
  valid: boolean;
};

export function MarketplaceListingCard({
  listing,
  search = "",
}: {
  listing: MarketplaceListing;
  search?: string;
}) {
  const token = useToken(listing.tokenId);
  const metadata = useMetadata(token.data?.uri);
  const [imageFailed, setImageFailed] = useState(false);
  const title = metadata.data?.name?.trim() || `Token #${String(listing.tokenId)}`;
  const searchable = `${title} token #${String(listing.tokenId)} ${listing.seller}`.toLowerCase();
  // Keep pending cards visible for a moment while their metadata resolves.
  if (search.trim() && !searchable.includes(search.trim().toLowerCase()) && !metadata.isPending) return null;
  return (
    <a
      className="rc-nft-card nft-live-card"
      href={`/#token/${String(listing.tokenId)}`}
      aria-label={`View ${title}, listed for ${formatEther(listing.price)} zkLTC`}
    >
      <div className="rc-nft-art nft-live-art">
        {metadata.data?.image && !imageFailed ? (
          <img
            src={metadata.data.image}
            alt={title}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <div className="nft-live-fallback" role="img" aria-label={metadata.isPending ? "Loading NFT image" : "NFT image unavailable"}>
            <span>{metadata.isPending ? "Loading artwork…" : "Artwork unavailable"}</span>
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
