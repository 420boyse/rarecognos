import { useEffect, useRef, useState } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { parseEventLogs, zeroAddress, type PublicClient, type WalletClient, type Hash } from "viem";
import { chain, configured, contracts, explorer } from "@/lib/nft/config";
import { useListings, useOwned } from "@/lib/nft/data";
import { abi as nft } from "@/lib/nft/RareCognos";
import {
  transact,
  transactionError,
  records,
  resumeTransaction,
  type Pending,
} from "@/lib/nft/transaction";
import { NFTCreate } from "./nft-create";
import { NFTToken } from "./nft-token";
import { DailyCheckIn } from "./daily-check-in";
export type Availability = "loading" | "available" | "empty" | "error" | "unconfigured";
export function NFTMarket({
  tab,
  onViewChange,
  onAvailability,
}: {
  tab: string;
  onViewChange: (view: string) => void;
  onAvailability: (state: Availability) => void;
}) {
  const account = useAccount(),
    client = usePublicClient({ chainId: chain.id }),
    wallet = useWalletClient(),
    cache = useQueryClient();
  const listings = useListings(tab === "My NFTs"),
    owned = useOwned(account.address),
    lock = useRef(false);
  const [busy, setBusy] = useState(false),
    [status, setStatus] = useState<{
      wallet?: string;
      message: string;
      hash?: Hash;
      token?: string;
    }>({ message: "" }),
    [history, setHistory] = useState<Pending[]>([]);
  const [query, setQuery] = useState("");
  const [queryNote, setQueryNote] = useState("");
  const address = account.address?.toLowerCase();
  const active = listings.data?.pages.flatMap((p) => p.listings).filter((l) => l.valid) || [];
  const own = owned.data?.pages.flatMap((p) => p.ids) || [];
  const state: Availability = !configured
    ? "unconfigured"
    : listings.isError
      ? "error"
      : listings.isPending
        ? "loading"
        : active.length
          ? "available"
          : listings.hasNextPage
            ? "loading"
            : "empty";
  useEffect(() => onAvailability(state), [state, onAvailability]);
  useEffect(() => {
    const update = () => setHistory(records());
    update();
    window.addEventListener("nft-transactions", update);
    return () => window.removeEventListener("nft-transactions", update);
  }, []);
  const pending = history.filter(
    (r) => r.chainId === chain.id && r.wallet.toLowerCase() === address && r.status === "pending",
  );
  const ready =
    configured &&
    account.isConnected &&
    account.chainId === chain.id &&
    !!wallet.data &&
    !busy &&
    !pending.length;
  async function refresh() {
    try {
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["nft"] }),
        cache.invalidateQueries({ queryKey: ["readContract"] }),
        cache.invalidateQueries({ queryKey: ["creator-drops"] }),
        cache.invalidateQueries({ queryKey: ["drop"] }),
      ]);
    } catch {
      /* confirmed receipt remains authoritative */
    }
  }
  async function run(call: Parameters<typeof transact>[2], after?: (receipt: Awaited<ReturnType<typeof transact>>) => void) {
    if (!ready || lock.current || !client || !wallet.data) return;
    lock.current = true;
    setBusy(true);
    const owner = wallet.data.account.address.toLowerCase();
    let confirmed = false;
    try {
      const receipt = await transact(
        client as PublicClient,
        wallet.data as WalletClient,
        call,
        (message, hash) => setStatus({ wallet: owner, message, hash }),
      );
      confirmed = true;
      after?.(receipt);
      if (call.functionName === "mint") {
        const event = parseEventLogs({ abi: nft, eventName: "Transfer", logs: receipt.logs }).find(
          (e) =>
            e.address.toLowerCase() === contracts.collection!.toLowerCase() &&
            e.args.from === zeroAddress &&
            e.args.to.toLowerCase() === owner,
        );
        if (!event)
          throw Error(
            "Receipt confirmed, but the expected mint event was not found. Check explorer.",
          );
        setStatus({
          wallet: owner,
          message: "NFT minted and confirmed on-chain",
          hash: receipt.transactionHash,
          token: String(event.args.tokenId),
        });
      } else
        setStatus({
          wallet: owner,
          message: "Transaction confirmed. Refreshing chain state…",
          hash: receipt.transactionHash,
        });
    } catch (e) {
      setStatus({
        wallet: owner,
        message:
          (confirmed ? "Confirmed transaction; verification needs attention. " : "") +
          transactionError(e),
      });
    } finally {
      lock.current = false;
      setBusy(false);
      await refresh();
    }
  }
  async function resume(r: Pending) {
    if (!client || busy) return;
    setBusy(true);
    try {
      const receipt = await resumeTransaction(client as PublicClient, r, (message, hash) =>
        setStatus({ wallet: r.wallet.toLowerCase(), message, hash }),
      );
      let token: string | undefined;
      if (r.kind === "mint" && receipt.status === "success") {
        const event = parseEventLogs({ abi: nft, eventName: "Transfer", logs: receipt.logs }).find(
          (e) =>
            e.address.toLowerCase() === r.contract.toLowerCase() &&
            e.args.from === zeroAddress &&
            e.args.to.toLowerCase() === r.wallet.toLowerCase(),
        );
        if (!event) throw Error("Mint event missing from receipt");
        token = String(event.args.tokenId);
      }
      setStatus({
        wallet: r.wallet.toLowerCase(),
        message: receipt.status === "success" ? "Confirmed on-chain" : "Transaction reverted",
        hash: receipt.transactionHash,
        token,
      });
    } catch (e) {
      setStatus({ wallet: r.wallet.toLowerCase(), message: transactionError(e) });
    } finally {
      setBusy(false);
      await refresh();
    }
  }
  const resumed = useRef(new Set<string>());
  useEffect(() => {
    const r = pending.find((p) => !p.kind.startsWith("deploy:") && !resumed.current.has(p.id));
    if (r && client && !busy) {
      resumed.current.add(r.id);
      void resume(r);
    }
  }, [address, client, history]);
  const tokenId = tab.startsWith("Token:") ? tab.slice(6) : "";
  const ownListings =
    listings.data?.pages
      .flatMap((p) => p.listings)
      .filter((l) => l.seller.toLowerCase() === address) || [];
  return (
    <section
      id={
        tokenId
          ? "token-detail"
          : tab === "Create"
            ? "create"
            : tab === "My NFTs"
              ? "my-nfts"
              : "explore"
      }
      className="market-section"
      aria-labelledby="market-title"
    >
      <div className="section-heading">
        <div>
          <h2 id="market-title">
            {tokenId
              ? "Artwork"
              : tab === "Create"
                ? "Create an NFT"
                : tab === "My NFTs"
                  ? "My NFTs"
                  : "Find a work"}
          </h2>
          <p>
            {tokenId
              ? "The artwork and its on-chain record."
              : tab === "Create"
                ? "Your image. Your name. Your work."
                : tab === "My NFTs"
                  ? "Your collection and active listings."
                  : "Search by token number. Works are not listed here on their own."}
          </p>
        </div>
      </div>
      {account.isConnected && account.chainId !== chain.id && (
        <p className="market-notice" role="alert">
          Wrong network. Switch in the top bar; your artwork and form stay here.
        </p>
      )}
      {status.wallet === address && status.message && (
        <div role="status" className="market-notice">
          <p>{status.message}</p>
          {status.hash && explorer && (
            <a
              className="text-link"
              href={`${explorer}/tx/${status.hash}`}
              target="_blank"
              rel="noreferrer"
            >
              View transaction
            </a>
          )}
          {status.token && (
            <a className="text-link" href={`/#token/${status.token}`}>
              View token #{status.token}
            </a>
          )}
        </div>
      )}
      {pending.map((r) => (
        <div key={r.id} className="market-notice">
          <p>
            Pending {r.kind} · {r.wallet.slice(0, 6)}… · chain {r.chainId}
          </p>
          <p className="uri-text">{r.hash}</p>
          <button className="nft-button" disabled={busy} onClick={() => void resume(r)}>
            Recheck receipt (does not resend)
          </button>
        </div>
      ))}
      {tab === "Create" ? (
        <NFTCreate run={run} busy={busy} ready={ready} />
      ) : tokenId ? (
        configured ? (
          <NFTToken key={tokenId} id={BigInt(tokenId)} detail ready={ready} run={run} />
        ) : (
          <p className="market-notice">
            The verified collection is not deployed on this network yet.
          </p>
        )
      ) : tab === "My NFTs" ? (
        <>
          {!address && <p>Connect your wallet in the top bar to see your collection.</p>}
          {owned.isLoading && <p role="status">Reading your NFTs…</p>}
          {owned.error && (
            <p role="alert">
              Could not read ownership.{" "}
              <button className="nft-button" onClick={() => void owned.refetch()}>
                Retry
              </button>
            </p>
          )}
          <div className="owned-grid">
            {own.map((id) => (
              <NFTToken key={String(id)} id={id} ready={ready} run={run} />
            ))}
          </div>
          {address && configured && !owned.isPending && !owned.error && !own.length && (
            <p>
              No NFTs in this wallet yet.{" "}
              <a className="text-link" href="/create">
                Create a work
              </a>
            </p>
          )}
          {owned.hasNextPage && (
            <button
              className="nft-button"
              disabled={owned.isFetchingNextPage}
              onClick={() => void owned.fetchNextPage()}
            >
              Load more owned NFTs
            </button>
          )}
          <h3 className="listings-title">Your listings</h3>
          {ownListings.map((l) => (
            <div className="own-listing" key={String(l.id)}>
              <a href={`#token/${l.tokenId}`}>
                Token #{String(l.tokenId)} · {l.valid ? "Active" : "Unavailable"}
              </a>
              <button
                className="nft-button"
                disabled={!ready}
                onClick={() =>
                  void run({
                    address: contracts.market!,
                    abi: marketABI,
                    functionName: "cancel",
                    args: [l.id],
                  })
                }
              >
                Cancel listing #{String(l.id)}
              </button>
            </div>
          ))}
          {listings.hasNextPage && (
            <button
              className="nft-button"
              disabled={listings.isFetchingNextPage}
              onClick={() => void listings.fetchNextPage()}
            >
              Load older listings
            </button>
          )}
          <p className="market-notice">
            Cancel removes a sale listing. Open an artwork to change its price or revoke its
            transfer permissions.
          </p>
        </>
      ) : (
        <div className="find-work">
          <DailyCheckIn />
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const value = query.trim();
              if (!/^[1-9]\d{0,6}$/.test(value)) {
                setQueryNote("Enter a token number.");
                return;
              }
              setQueryNote("");
              location.hash = `token/${value}`;
            }}
          >
            <label>
              Token number
              <input
                inputMode="numeric"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="2"
              />
            </label>
            <button className="primary-action" type="submit">
              Find
            </button>
          </form>
          {queryNote && <p role="status">{queryNote}</p>}
        </div>
      )}
    </section>
  );
}
import { abi as marketABI } from "@/lib/nft/RareCognosMarket";
