import { useState } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { formatEther, parseEther, zeroAddress } from "viem";
import { useToken, useMetadata, nftCall, marketCall, short } from "@/lib/nft/data";
import { chain, contracts, explorer } from "@/lib/nft/config";
import { transactionError, type transact } from "@/lib/nft/transaction";
type Props = {
  id: bigint;
  detail?: boolean;
  ready: boolean;
  run: (call: Parameters<typeof transact>[2], before?: () => Promise<void>) => Promise<void>;
};
export function NFTToken({ id, detail = false, ready, run }: Props) {
  const token = useToken(id),
    meta = useMetadata(token.data?.uri),
    account = useAccount(),
    client = usePublicClient({ chainId: chain.id });
  const [price, setPrice] = useState(""),
    [confirmAll, setConfirmAll] = useState(false),
    [imageFailed, setImageFailed] = useState(false);
  const t = token.data,
    isOwner = account.address?.toLowerCase() === t?.owner.toLowerCase();
  const salePrice = t?.listing?.[2];
  const fee = useQuery({
    queryKey: [
      "nft",
      "fee",
      chain.id,
      account.address,
      String(id),
      String(t?.listingId),
      String(salePrice),
    ],
    enabled: detail && !!account.address && !!t?.active && !isOwner && account.chainId === chain.id,
    staleTime: 10000,
    queryFn: async () => {
      const call = {
        ...marketCall,
        functionName: "buy" as const,
        args: [t!.listingId!, salePrice!] as const,
        value: salePrice!,
        account: account.address!,
      };
      await client!.simulateContract(call);
      const [gas, gasPrice] = await Promise.all([
        client!.estimateContractGas(call),
        client!.getGasPrice(),
      ]);
      return gas * gasPrice;
    },
  });
  if (token.isPending)
    return (
      <article className="token-loading" role="status">
        Reading token #{String(id)}…
      </article>
    );
  if (token.error)
    return (
      <article className="token-loading" role="alert">
        Token #{String(id)} unavailable.{" "}
        <button className="nft-button" onClick={() => void token.refetch()}>
          Retry
        </button>
      </article>
    );
  if (!t) return null;
  let amount = 0n;
  try {
    if (/^\d+(\.\d{1,18})?$/.test(price)) amount = parseEther(price);
  } catch {
    /* invalid */
  }
  const artwork = (
    <>
      {meta.data && !imageFailed ? (
        <img
          src={meta.data.image}
          alt={meta.data.name}
          onError={() => setImageFailed(true)}
          referrerPolicy="no-referrer"
          loading={detail ? "eager" : "lazy"}
        />
      ) : (
        <div className="art-fallback">
          {meta.isPending ? "Loading artwork…" : "Artwork unavailable"}
          <span>Token #{String(id)}</span>
        </div>
      )}
    </>
  );
  const buy = () =>
    run(
      { ...marketCall, functionName: "buy", args: [t.listingId!, salePrice!], value: salePrice! },
      async () => {
        const [seller, tokenId, value, active, nonce] = await client!.readContract({
          ...marketCall,
          functionName: "listings",
          args: [t.listingId!],
        });
        const [owner, approved, version] = await Promise.all([
          client!.readContract({ ...nftCall, functionName: "ownerOf", args: [id] }),
          client!.readContract({ ...marketCall, functionName: "approved", args: [id, seller] }),
          client!.readContract({ ...nftCall, functionName: "transferVersion", args: [id] }),
        ]);
        if (
          !active ||
          tokenId !== id ||
          value !== salePrice ||
          owner.toLowerCase() !== seller.toLowerCase() ||
          !approved ||
          nonce !== version
        )
          throw Error("Listing changed. Refresh and review the current price.");
      },
    );
  return (
    <article className={detail ? "token-detail" : "listing-card"}>
      <div className="listing-art">
        {detail ? (
          artwork
        ) : (
          <a href={`#token/${id}`} aria-label={`View ${meta.data?.name || "token " + id}`}>
            {artwork}
          </a>
        )}
      </div>
      <div className="token-content">
        <h3>{meta.data?.name || `Token #${id}`}</h3>
        <p>
          {t.creator !== zeroAddress ? "1/1" : "Legacy studio edition"} · #{String(id)}
        </p>
        {meta.error && (
          <p role="alert">
            Metadata could not be loaded.{" "}
            <button
              className="nft-button"
              onClick={() => {
                setImageFailed(false);
                void meta.refetch();
              }}
            >
              Retry metadata
            </button>
          </p>
        )}
        {!t.saleReady ? (
          <p className="sale-state">Checking listing…</p>
        ) : t.active ? (
          <p className="sale-price">{formatEther(salePrice!)} zkLTC</p>
        ) : (
          <p className="sale-state">
            {t.listing?.[3]
              ? "Listing unavailable — ownership or permission changed."
              : "Not currently for sale"}
          </p>
        )}
        {!detail ? (
          <a className="secondary-action" href={`#token/${id}`}>
            View artwork
          </a>
        ) : (
          <>
            <p className="token-description">{meta.data?.description}</p>
            <dl className="token-facts">
              <dt>Creator</dt>
              <dd>{t.creator === zeroAddress ? "Not recorded by V1" : t.creator}</dd>
              <dt>Current owner</dt>
              <dd>{t.owner}</dd>
              <dt>Network</dt>
              <dd>
                {chain.name} ({chain.id})
              </dd>
              <dt>Collection</dt>
              <dd>{contracts.collection}</dd>
              <dt>Metadata URI</dt>
              <dd>{t.uri}</dd>
            </dl>
            {explorer && (
              <a
                href={`${explorer}/token/${contracts.collection}/instance/${id}`}
                target="_blank"
                rel="noreferrer"
                className="text-link"
              >
                View token on explorer
              </a>
            )}
            {!account.address && (
              <p className="market-notice">
                Connect your wallet in the top bar to{" "}
                {t.active ? "buy this work" : "manage this work"}. You will stay on this artwork.
              </p>
            )}
            {isOwner && t.saleReady ? (
              <div className="token-actions">
                <label>
                  Price in zkLTC
                  <input
                    inputMode="decimal"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="0.01"
                  />
                </label>
                {!(t.tokenApproved || t.allApproval) ? (
                  <button
                    className="primary-action"
                    disabled={!ready}
                    onClick={() =>
                      void run({
                        ...nftCall,
                        functionName: "approve",
                        args: [contracts.market!, id],
                      })
                    }
                  >
                    Approve this token
                  </button>
                ) : (
                  <button
                    className="primary-action"
                    disabled={!ready || amount <= 0n}
                    onClick={() =>
                      void run({ ...marketCall, functionName: "list", args: [id, amount] })
                    }
                  >
                    {t.active ? "Replace listing" : "List artwork"}
                    {amount > 0n ? ` · ${price} zkLTC` : ""}
                  </button>
                )}
                <details className="token-more">
                  <summary>More</summary>
                  {amount > 0n && (
                    <p>
                      Fee 0.25%. You receive {formatEther(amount - (amount * 25n) / 10000n)} zkLTC
                      on a sale.
                    </p>
                  )}
                  {t.listing?.[3] && t.listing[0].toLowerCase() === account.address?.toLowerCase() && (
                    <button
                      className="nft-button"
                      disabled={!ready}
                      onClick={() =>
                        void run({ ...marketCall, functionName: "cancel", args: [t.listingId!] })
                      }
                    >
                      Cancel listing
                    </button>
                  )}
                  {t.tokenApproved && (
                    <button
                      className="nft-button"
                      disabled={!ready}
                      onClick={() =>
                        void run({ ...nftCall, functionName: "approve", args: [zeroAddress, id] })
                      }
                    >
                      Revoke this token’s permission
                    </button>
                  )}
                  {t.allApproval && (
                    <button className="nft-button" disabled={!ready} onClick={() => setConfirmAll(true)}>
                      Revoke collection-wide permission
                    </button>
                  )}
                  {confirmAll && t.allApproval && (
                    <div className="permission-confirm">
                      <p>This removes marketplace permission for every NFT you own here.</p>
                      <button
                        className="nft-button"
                        disabled={!ready}
                        onClick={() => {
                          setConfirmAll(false);
                          void run({
                            ...nftCall,
                            functionName: "setApprovalForAll",
                            args: [contracts.market!, false],
                          });
                        }}
                      >
                        Confirm revoke
                      </button>
                      <button className="nft-button" onClick={() => setConfirmAll(false)}>
                        Keep permission
                      </button>
                    </div>
                  )}
                </details>
              </div>
            ) : (
              t.active && (
                <div className="token-actions">
                  <button
                    className="primary-action"
                    disabled={!ready || fee.data === undefined}
                    onClick={() => void buy()}
                  >
                    Buy for {formatEther(salePrice!)} zkLTC
                  </button>
                  <details className="token-more">
                    <summary>More</summary>
                    <p>
                      Includes a 0.25% fee. Network fee
                      {fee.data !== undefined ? `: ${formatEther(fee.data)} zkLTC` : " estimated in your wallet"}.
                    </p>
                  </details>
                </div>
              )
            )}
          </>
        )}
      </div>
    </article>
  );
}
