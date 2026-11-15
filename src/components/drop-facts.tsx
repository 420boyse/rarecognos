export function DropFacts({
  maker,
  collection,
  network,
  price,
  priceState,
  minted,
  supply,
  supplyState,
  contractUrl,
  metadataUrl,
}: {
  maker: string;
  collection: string;
  network: string;
  price: string;
  priceState: "read" | "unread" | "planned";
  minted?: number;
  supply?: number;
  supplyState: "reading" | "read" | "unread" | "unopened";
  contractUrl?: string;
  metadataUrl: string;
}) {
  const mintedText =
    supplyState === "unopened"
      ? "Not on chain yet"
      : supplyState === "reading"
        ? "Reading…"
        : supplyState === "read" && minted !== undefined && supply !== undefined
          ? `${minted} of ${supply}`
          : "Could not read chain data";
  return (
    <>
      <dl className="token-facts">
        <dt>Maker</dt>
        <dd>{maker}</dd>
        <dt>Collection</dt>
        <dd>{collection}</dd>
        <dt>Network</dt>
        <dd>{network}</dd>
        <dt>Mint price</dt>
        <dd>
          {price}
          {priceState === "read" ? " · read from the contract" : priceState === "planned" ? " · planned, not open" : " · not read from the contract yet"}
        </dd>
        <dt>Minted</dt>
        <dd>{mintedText}</dd>
        {contractUrl && (
          <>
            <dt>Contract</dt>
            <dd>
              <a href={contractUrl} target="_blank" rel="noreferrer">
                View contract
              </a>
            </dd>
          </>
        )}
        <dt>Metadata</dt>
        <dd>
          <a href={metadataUrl}>View metadata</a>
        </dd>
      </dl>
      <p>
        The network fee is separate from the mint price. The wallet shows that fee before you confirm. Owning the token
        does not transfer copyright.
      </p>
    </>
  );
}
