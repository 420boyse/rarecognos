import { useState } from "react";
import { useAccount } from "wagmi";
import { assetLink, assetKey, parseAsset, useNetworkOwned } from "@/lib/nft/network-market";
import { short } from "@/lib/nft/data";

export function NetworkInventory() {
  const { address } = useAccount();
  const inventory = useNetworkOwned(address);
  const [collection, setCollection] = useState(""),
    [id, setId] = useState(""),
    [standard, setStandard] = useState("721");
  const asset = parseAsset(`${collection.trim()}-${id.trim()}-${standard}`);
  const owned = inventory.data?.pages.flatMap((p) => p.rows) || [];
  if (!address) return null;
  return (
    <section>
      <h3 className="listings-title">Other LiteForge collections</h3>
      {inventory.isLoading && <p role="status">Reading wallet inventory…</p>}
      {inventory.isError && (
        <p role="alert">
          Wallet index unavailable.{" "}
          <button className="nft-button" onClick={() => void inventory.refetch()}>
            Retry
          </button>
        </p>
      )}
      {owned.length > 0 && (
        <ul className="catalog-grid">
          {owned.map((a) => (
            <li key={assetKey(a)}>
              <a href={assetLink(a)} className="catalog-card">
                {a.image && (
                  <img src={a.image} alt="" loading="lazy" referrerPolicy="no-referrer" />
                )}
                <strong>
                  {a.title || short(a.collection)} · #{a.id}
                </strong>
                <span>ERC-{a.multi ? "1155" : "721"} · View and list</span>
              </a>
            </li>
          ))}
        </ul>
      )}
      {inventory.isSuccess && !owned.length && !inventory.hasNextPage && (
        <p>No other indexed NFTs in this wallet.</p>
      )}
      {inventory.hasNextPage && (
        <button
          className="nft-button"
          disabled={inventory.isFetchingNextPage}
          onClick={() => void inventory.fetchNextPage()}
        >
          Load more wallet NFTs
        </button>
      )}
      <details className="market-notice">
        <summary>Find an NFT by contract and token ID</summary>
        <div className="creation-form">
          <label>
            Collection address
            <input
              value={collection}
              onChange={(e) => setCollection(e.target.value)}
              placeholder="0x…"
            />
          </label>
          <label>
            Token ID
            <input inputMode="numeric" value={id} onChange={(e) => setId(e.target.value)} />
          </label>
          <label>
            Standard
            <select value={standard} onChange={(e) => setStandard(e.target.value)}>
              <option value="721">ERC-721</option>
              <option value="1155">ERC-1155</option>
            </select>
          </label>
          {asset && (
            <a className="nft-button" href={assetLink(asset)}>
              View NFT
            </a>
          )}
        </div>
      </details>
      <a className="text-link" href="/network-market?mine=1">
        Manage your network listings
      </a>
    </section>
  );
}
