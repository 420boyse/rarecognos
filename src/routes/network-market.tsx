import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { formatEther, parseEther, parseAbiItem, parseEventLogs, type Hash, type PublicClient, type WalletClient } from "viem";
import {
  useAccount,
  usePublicClient,
  useReadContract,
  useSwitchChain,
  useWalletClient,
} from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { MarketHeader } from "@/components/market-header";
import { SiteFooter } from "@/components/site-footer";
import { OpenRelease } from "@/components/open-release";
import { MarketplaceListingCard } from "@/components/marketplace-listing-card";
import {
  assetAbi,
  assetKey,
  saleLink,
  marketAbi,
  networkMarket,
  parseAsset,
  useAssetAccess,
  useMarketRelease,
  useMarketResults,
  useNetworkArt,
  type Asset,
} from "@/lib/nft/network-market";
import { chain, explorer } from "@/lib/nft/config";
import { records, resumeTransaction, transact, transactionError } from "@/lib/nft/transaction";
import { matchesMarketPending } from "@/lib/nft/pending-market";
import { marketPreview } from "@/lib/nft/market-preview";
import release from "../../config/liteforge-market.json";

export const Route = createFileRoute("/network-market")({
  validateSearch: (s: Record<string, unknown>) => ({
    asset: parseAsset(s.asset) ? String(s.asset) : undefined,
    sale: typeof s.sale === "string" && /^L[1-9]\d{0,76}$/.test(s.sale) ? s.sale : undefined,
    mine: Number(s.mine) === 1 ? 1 : undefined,
    setup: Number(s.setup) === 1 ? 1 : undefined,
  }),
  loaderDeps: ({ search }) => ({ asset: search.asset, sale: search.sale }),
  loader: ({ deps }) => marketPreview(deps.asset, deps.sale),
  head: ({ loaderData }) => loaderData ?? {},
  component: NetworkMarket,
});
function NetworkMarket() {
  const { asset, sale, mine, setup } = Route.useSearch(),
    account = useAccount(),
    state = useMarketRelease();
  const item = parseAsset(asset);
  const live = state.data === true && !state.isError;
  return (
    <>
      <MarketHeader view="Explore" />
      <main className="market-section explore-page">
        <div className="section-heading">
          <div>
            <h1>LiteForge NFT market</h1>
            <p>List and collect ERC-721 and ERC-1155 NFTs across LiteForge collections.</p>
          </div>
        </div>
        <a className="text-link" href="/#my-nfts">
          View wallet NFTs
        </a>
        {setup && !live && (
          <OpenRelease
            release={release}
            artifact="LiteForgeMarket"
            title="Open network trading"
            action="Deploy marketplace"
            explanation="Deploy the LiteForge escrow contract. Its platform fee is 0.25% per completed sale."
            ready={state.data === false && !state.isError}
            refresh={() => void state.refetch()}
          />
        )}
        {!live && (
          <p className="market-notice" role="status">
            {state.isError
              ? "Could not verify marketplace status."
              : state.data === false
                ? "Network trading opens after the marketplace contract is deployed."
                : "Checking marketplace…"}
          </p>
        )}
        {item ? (
          <TradeAsset key={assetKey(item) + (account.address || "")} asset={item} live={live} />
        ) : sale ? (
          <SaleDetail id={BigInt(sale.slice(1))} live={live} />
        ) : (
          <SaleGrid mine={!!mine} />
        )}
      </main>
      <SiteFooter />
    </>
  );
}

function SaleGrid({ mine }: { mine: boolean }) {
  const { address } = useAccount(),
    result = useMarketResults("");
  const rows = result.matches.filter(
    (r) => !mine || r.listing.seller.toLowerCase() === address?.toLowerCase(),
  );
  return (
    <section>
      <h2>{mine ? "Your network listings" : "Network listings"}</h2>
      {mine && !address ? (
        <Connect />
      ) : (
        <>
          <div className="explore-live-grid">
            {rows.map((r) => (
              <MarketplaceListingCard key={r.href} {...r} />
            ))}
          </div>
          {!rows.length && result.settled && !result.error && !result.sales.hasNextPage && (
            <div className="market-empty">
              <p>{mine ? "You have no active listings yet." : "The next listing could be yours."}</p>
              <p>{mine ? "Choose an NFT from your wallet to set a price." : "Explore open mints or choose an NFT from your wallet to list."}</p>
              <div className="market-empty-actions">
                <a className="primary-action" href="/explore">Explore open mints</a>
                <a className="nft-button" href="/#my-nfts">List from my wallet</a>
              </div>
            </div>
          )}
          {result.sales.isError && (
            <button className="nft-button" onClick={() => void result.sales.refetch()}>
              Retry listings
            </button>
          )}
          {result.sales.hasNextPage && (
            <button
              className="nft-button"
              disabled={result.sales.isFetchingNextPage}
              onClick={() => void result.sales.fetchNextPage()}
            >
              Load older network listings
            </button>
          )}
        </>
      )}
    </section>
  );
}

function Connect() {
  return (
    <button
      className="nft-button"
      onClick={() => window.dispatchEvent(new Event("rarecognos-login"))}
    >
      Connect wallet
    </button>
  );
}
function Switch() {
  const net = useSwitchChain();
  return (
    <button className="nft-button" onClick={() => net.switchChain({ chainId: chain.id })}>
      Switch to LiteForge
    </button>
  );
}
type Call = Parameters<typeof transact>[2];

function useTrade(asset: Asset, saleId?: bigint) {
  const client = usePublicClient({ chainId: chain.id }),
    wallet = useWalletClient(),
    cache = useQueryClient(),
    account = useAccount();
  const lock = useRef(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [hash, setHash] = useState<Hash>(),
    [listing, setListing] = useState<bigint>();
  const [history, setHistory] = useState<ReturnType<typeof records>>([]);
  useEffect(() => {
    const refresh = () => setHistory(records());
    refresh();
    window.addEventListener("nft-transactions", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("nft-transactions", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  const pending = history.find(
    (r) =>
      r.status === "pending" &&
      r.chainId === chain.id &&
      r.wallet.toLowerCase() === account.address?.toLowerCase() &&
      matchesMarketPending(r, networkMarket, { ...asset, saleId }),
  );
  async function run(call?: Call) {
    if (lock.current || !wallet.data || !client || account.chainId !== chain.id) return;
    lock.current = true;
    setBusy(true);
    setHash(undefined);
    setListing(undefined);
    const update = (message: string, h?: Hash) => {
      setNotice(message);
      if (h) setHash(h);
    };
    try {
      const rpc = client as PublicClient;
      const receipt = pending
        ? await resumeTransaction(rpc, pending, update)
        : call && (await transact(rpc, wallet.data as WalletClient, call, update));
      if (receipt?.status === "success") {
        const listed = parseEventLogs({ abi: [parseAbiItem("event Listed(uint256 indexed id,address indexed seller,address indexed collection,uint256 tokenId,uint256 price)")], logs: receipt.logs })
          .find(log => log.address.toLowerCase() === networkMarket.toLowerCase() && log.args.seller.toLowerCase() === account.address?.toLowerCase());
        if (listed) setListing(listed.args.id);
      }
      if (receipt)
        update(
          receipt.status === "success" ? "Confirmed on LiteForge." : "Transaction reverted.",
          receipt.transactionHash,
        );
      await Promise.all(
        ["network-sales", "network-assets", "network-access", "readContract"].map((key) =>
          cache.invalidateQueries({ queryKey: [key] }),
        ),
      );
    } catch (e) {
      setNotice(transactionError(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return {
    busy,
    run,
    pending,
    feedback: (
      <>
        {notice && <p role="status">{notice}</p>}
        {listing !== undefined && <a className="primary-action" href={saleLink(listing)}>Open your listing</a>}
        {hash && explorer && <a href={`${explorer}/tx/${hash}`}>View transaction</a>}
      </>
    ),
  };
}
function TradeAsset({
  asset,
  live,
  sale,
}: {
  asset: Asset;
  live: boolean;
  sale?: { id: bigint; seller: string; price: bigint; active: boolean };
}) {
  const account = useAccount(),
    access = useAssetAccess(asset, account.address),
    [art] = useNetworkArt([asset]),
    trade = useTrade(asset, sale?.id),
    [input, setInput] = useState("");
  const title = art.data?.title || "NFT";
  let price = 0n;
  if (/^\d{1,60}(?:\.\d{1,18})?$/.test(input)) price = parseEther(input);
  const token = BigInt(asset.id);
  const list: Call = {
    address: networkMarket,
    abi: marketAbi,
    functionName: "list",
    args: [asset.collection, token, asset.multi, price],
  };
  const approve: Call = {
    address: asset.collection,
    abi: assetAbi,
    functionName: asset.multi ? "setApprovalForAll" : "approve",
    args: [networkMarket, asset.multi ? true : token],
  };
  const isSeller = account.address?.toLowerCase() === sale?.seller.toLowerCase();
  return (
    <div className="creation-grid">
      <div className="art-preview">
        {art.data?.image ? (
          <img src={art.data.image} alt={title} referrerPolicy="no-referrer" />
        ) : (
          <p>Artwork preview unavailable</p>
        )}
      </div>
      <section className="creation-form">
        <h2>
          {title} · #{asset.id}
        </h2>
        <p>ERC-{asset.multi ? "1155" : "721"} · One token per listing</p>
        <a className="uri-text" href={`${explorer}/token/${asset.collection}/instance/${asset.id}`}>
          {asset.collection}
        </a>
        {sale && (
          <p>
            {formatEther(sale.price)} test zkLTC · {sale.active ? "Listed" : "Listing closed"}
          </p>
        )}
        {!account.isConnected ? (
          <Connect />
        ) : account.chainId !== chain.id ? (
          <Switch />
        ) : trade.pending ? (
          <button className="nft-button" disabled={trade.busy} onClick={() => void trade.run()}>
            Recheck transaction
          </button>
        ) : sale ? (
          sale.active &&
          live && (
            <button
              className="primary-action"
              disabled={trade.busy}
              onClick={() =>
                void trade.run({
                  address: networkMarket,
                  abi: marketAbi,
                  functionName: isSeller ? "cancel" : "buy",
                  args: [sale.id],
                  value: isSeller ? 0n : sale.price,
                })
              }
            >
              {isSeller ? "Cancel listing" : `Buy for ${formatEther(sale.price)} test zkLTC`}
            </button>
          )
        ) : access.isPending ? (
          <p>Checking ownership…</p>
        ) : access.isError ? (
          <button className="nft-button" onClick={() => void access.refetch()}>
            Retry ownership check
          </button>
        ) : !access.data?.owns ? (
          <p>This wallet does not hold this NFT.</p>
        ) : (
          <>
            <label>
              Listing price (test zkLTC)
              <input
                inputMode="decimal"
                placeholder="0.001"
                value={input}
                onChange={(e) => setInput(e.target.value)}
              />
            </label>
            <p>
              The marketplace holds one token until purchase or cancellation. The platform fee is
              0.25% of the sale price.
            </p>
            {!access.data.approved && asset.multi && (
              <p>
                ERC-1155 approval allows the marketplace to transfer tokens from this collection.
                Listing deposits one unit.
              </p>
            )}
            <button
              className="primary-action"
              disabled={!live || trade.busy || price <= 0n}
              onClick={() => void trade.run(access.data.approved ? list : approve)}
            >
              {access.data.approved
                ? "List one NFT"
                : asset.multi
                  ? "Approve collection"
                  : "Approve this NFT"}
            </button>
          </>
        )}
        {trade.feedback}
      </section>
    </div>
  );
}
function SaleDetail({ id, live }: { id: bigint; live: boolean }) {
  const sale = useReadContract({
      chainId: chain.id,
      address: networkMarket,
      abi: marketAbi,
      functionName: "sales",
      args: [id],
      query: { enabled: live, refetchInterval: 15000 },
    }),
    account = useAccount();
  if (!live) return null;
  if (sale.isError)
    return (
      <button className="nft-button" onClick={() => void sale.refetch()}>
        Retry listing
      </button>
    );
  if (!sale.data) return <p>Reading listing…</p>;
  const [seller, collection, tokenId, price, multi, active] = sale.data;
  if (!price) return <p>Listing not found.</p>;
  return (
    <TradeAsset
      key={String(id) + (account.address || "")}
      live={live}
      asset={{ collection, id: String(tokenId), multi }}
      sale={{ id, seller, price, active }}
    />
  );
}
