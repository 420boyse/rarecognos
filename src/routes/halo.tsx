import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useAccount, usePublicClient, useReadContract, useSwitchChain, useWalletClient } from "wagmi";
import { formatEther, isAddress, type Address, type Hash } from "viem";
import { DropFacts } from "@/components/drop-facts";
import { MarketHeader } from "@/components/market-header";
import { SiteFooter } from "@/components/site-footer";
import { halo, haloNetwork, haloPrice } from "@/data/halo";
import { chain, explorer } from "@/lib/nft/config";
import { haloTreasury, haloUris, readHaloAddress, saveHaloAddress } from "@/lib/nft/halo-address";
import haloDeployment from "../../config/halo.json";
import { isTimeout, phaseLabel, txFailure, type MintPhase } from "@/lib/nft/mint-phase";
import { abi } from "@/lib/nft/RareCognosHalo";
import { pageMeta, siteOrigin } from "@/lib/site-meta";
import { transactionError } from "@/lib/nft/transaction";

type HaloSearch = { piece?: string; setup?: "1" };

function readSearch(search: Record<string, unknown>): HaloSearch {
  const piece = typeof search.piece === "string" && halo.some((item) => item.id === search.piece) ? search.piece : undefined;
  return { piece, setup: search.setup === "1" ? "1" : undefined };
}

export const Route = createFileRoute("/halo")({
  validateSearch: readSearch,
  head: ({ match }) => {
    const figure = halo.find((item) => item.id === match.search.piece);
    const path = figure ? `/halo?piece=${figure.id}` : "/halo";
    return pageMeta({
      title: figure ? `${figure.name} · Halo · RareCognos` : "Halo · RareCognos",
      description: figure ? figure.story : "Halo is a set of six figures. The drop is not open yet.",
      path,
      image: figure ? `/art/halo/${figure.id}.png` : "/art/halo/01.png",
    });
  },
  component: HaloPage,
});

function HaloPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const canLaunch = search.setup === "1";
  const [open, setOpen] = useState(search.piece || "");
  const [address, setAddress] = useState<Address | undefined>(() =>
    haloDeployment.address && isAddress(haloDeployment.address) ? haloDeployment.address : undefined,
  );
  const [receipt, setReceipt] = useState<{ hash: Hash; left: number; supply: number; name: string; id: string } | null>(null);
  const [pendingHash, setPendingHash] = useState<Hash | null>(null);
  const [phase, setPhase] = useState<MintPhase>("idle");
  const [notice, setNotice] = useState("");
  const cardRef = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const lock = useRef(false);
  const account = useAccount();
  const network = useSwitchChain();
  const client = usePublicClient({ chainId: chain.id });
  const wallet = useWalletClient();
  const piece = halo.find((item) => item.id === (open || search.piece)) || halo[0];
  const index = Math.max(0, halo.findIndex((item) => item.id === piece.id));
  const wrong = account.isConnected && account.chainId !== chain.id;
  const live = Boolean(address);
  const priceRead = useReadContract({ address, abi, functionName: "MINT_PRICE", query: { enabled: live } });
  const supplyRead = useReadContract({ address, abi, functionName: "PIECE_SUPPLY", query: { enabled: live } });
  const mintedRead = useReadContract({
    address,
    abi,
    functionName: "mintedOf",
    args: [BigInt(index)],
    query: { enabled: live },
  });
  const supply = supplyRead.data === undefined ? undefined : Number(supplyRead.data);
  const minted = mintedRead.data === undefined ? undefined : Number(mintedRead.data);
  const soldOut = supply !== undefined && minted !== undefined && minted >= supply;
  const supplyState = !live ? "unopened" : mintedRead.isError || supplyRead.isError ? "unread" : mintedRead.isPending ? "reading" : "read";
  const priceText = priceRead.data !== undefined ? `${formatEther(priceRead.data)} zkLTC` : haloPrice;
  const dialogOpen = Boolean(open || receipt);

  useEffect(() => {
    const saved = readHaloAddress();
    if (saved) setAddress(saved);
  }, []);

  useEffect(() => {
    if (search.piece) setOpen(search.piece);
  }, [search.piece]);

  useEffect(() => {
    if (!dialogOpen) return;
    const node = cardRef.current;
    const previous = (opener.current ?? document.activeElement) as HTMLElement | null;
    node?.querySelector<HTMLElement>("button, a")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen("");
        setReceipt(null);
      }
      if (event.key !== "Tab" || !node) return;
      const items = [...node.querySelectorAll<HTMLElement>("button, a")];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [dialogOpen]);

  const launch = async () => {
    if (lock.current || !wallet.data || !client) return;
    lock.current = true;
    setPhase("awaiting-wallet");
    setNotice("");
    let hash: Hash | undefined;
    try {
      const artifact = await fetch("/contracts/RareCognosHalo.json").then((res) => res.json());
      hash = await wallet.data.deployContract({
        abi,
        bytecode: artifact.bytecode,
        args: [wallet.data.account.address, haloTreasury, haloUris()],
      });
      setPendingHash(hash);
      setPhase("confirming");
      const deployed = await client.waitForTransactionReceipt({ hash, timeout: 120_000 });
      if (!deployed.contractAddress || deployed.status !== "success") throw Error("Deployment did not return a contract.");
      saveHaloAddress(deployed.contractAddress);
      setAddress(deployed.contractAddress);
      setPhase("success");
      setNotice("Drop is open.");
      setPendingHash(null);
    } catch (error) {
      if (hash) {
        setPhase("unknown");
        setNotice(`${transactionError(error)} The deployment was not sent again.`);
      } else {
        setPhase(txFailure(error));
        setNotice(transactionError(error));
      }
    } finally {
      lock.current = false;
    }
  };

  const mint = async () => {
    if (lock.current || !wallet.data || !address || !client) return;
    if (pendingHash && (phase === "unknown" || phase === "confirming")) {
      setNotice("A transaction was already sent. Check it before minting again.");
      return;
    }
    lock.current = true;
    setNotice("");
    setReceipt(null);
    let hash: Hash | undefined;
    try {
      setPhase("awaiting-wallet");
      if ((await wallet.data.getChainId()) !== chain.id) throw Error("Wrong network. Switch to LiteForge, then mint again.");
      const value = await client.readContract({ address, abi, functionName: "MINT_PRICE" });
      const cap = await client.readContract({ address, abi, functionName: "PIECE_SUPPLY" });
      const taken = await client.readContract({ address, abi, functionName: "mintedOf", args: [BigInt(index)] });
      if (taken >= cap) throw Error("This figure is sold out.");
      hash = await wallet.data.writeContract({
        address,
        abi,
        functionName: "mint",
        args: [BigInt(index)],
        value,
      });
      setPendingHash(hash);
      setPhase("confirming");
      const confirmed = await client.waitForTransactionReceipt({ hash, timeout: 120_000 });
      if (confirmed.status !== "success") throw Error("The transaction was included but did not succeed.");
      const after = await client.readContract({ address, abi, functionName: "mintedOf", args: [BigInt(index)] });
      setReceipt({ hash, left: Number(cap) - Number(after), supply: Number(cap), name: piece.name, id: piece.id });
      setPhase("success");
      setPendingHash(null);
      setOpen("");
    } catch (error) {
      if (hash) {
        setPhase("unknown");
        setPendingHash(hash);
        setNotice(
          isTimeout(error)
            ? "The transaction was sent, but confirmation did not arrive. Check the explorer. It was not sent again."
            : `${transactionError(error)} It was not sent again.`,
        );
      } else {
        setPhase(txFailure(error));
        setNotice(transactionError(error));
      }
    } finally {
      lock.current = false;
    }
  };

  const onPrimary = () => {
    if (!live && !canLaunch) return;
    if (!account.isConnected) {
      setOpen("");
      setNotice("Connect a wallet. Mint does not start until you choose it again.");
      window.dispatchEvent(new Event("rarecognos-login"));
      return;
    }
    if (wrong) {
      setNotice("Wrong network. Switch to LiteForge, then press mint again.");
      return;
    }
    if (!live) void launch();
    else void mint();
  };

  const busy = phase === "awaiting-wallet" || phase === "submitted" || phase === "confirming";
  const actionLabel = !live ? (canLaunch ? (busy ? "Confirming…" : "Open the drop") : "Not live yet") : soldOut ? "Sold out" : busy ? phaseLabel(phase) : `Mint ${piece.name}`;

  return (
    <div>
      <MarketHeader view="Halo" />
      <main className="market-section explore-page">
        <div className="section-heading">
          <div>
            <h1>Halo</h1>
            <p>Six figures. 100 editions each when the drop opens.</p>
          </div>
          <p className="status-pill">{live ? (soldOut ? "Sold out" : "Mint open") : "Coming soon"}</p>
        </div>
        {!live && <p className="market-notice">Coming soon. Planned mint price {haloPrice}. No opening date is set.</p>}
        {canLaunch && !live && (
          <button className="primary-action" type="button" disabled={busy} onClick={onPrimary}>
            {busy ? "Confirming…" : "Open the drop"}
          </button>
        )}
        <ul className="catalog-grid">
          {halo.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="catalog-card"
                onClick={() => {
                  opener.current = document.activeElement as HTMLElement | null;
                  setOpen(item.id);
                  void navigate({ search: (prev) => ({ ...prev, piece: item.id }), replace: true, resetScroll: false });
                }}
              >
                <img src={`/art/halo/${item.id}.png`} alt="" width="640" height="640" />
                <strong>{item.name}</strong>
                <em>Halo</em>
                <span>{live ? priceText : `Planned ${haloPrice}`}</span>
                <span className="status-pill">{live ? "Mint open" : "Coming soon"}</span>
              </button>
            </li>
          ))}
        </ul>
        {(notice || phase === "unknown") && (
          <p className="eyed-note" role="status">
            {notice || phaseLabel(phase)}
            {pendingHash && explorer && (
              <>
                {" "}
                <a href={`${explorer}/tx/${pendingHash}`} target="_blank" rel="noreferrer">
                  View transaction
                </a>
              </>
            )}
          </p>
        )}
        {wrong && (
          <p className="eyed-note">
            <button className="nft-button" type="button" disabled={network.isPending} onClick={() => void network.switchChainAsync({ chainId: chain.id })}>
              {network.isPending ? "Switching…" : "Switch to LiteForge"}
            </button>
          </p>
        )}
        {receipt && (
          <div className="eyed-story" role="dialog" aria-modal="true" aria-labelledby="halo-receipt-title">
            <button type="button" className="eyed-story-backdrop" aria-label="Close" onClick={() => setReceipt(null)} />
            <div className="eyed-story-card" ref={cardRef}>
              <button type="button" className="eyed-story-close" aria-label="Close" onClick={() => setReceipt(null)}>
                ×
              </button>
              <img src={`/art/halo/${receipt.id}.png`} alt="" width="640" height="640" />
              <div>
                <h2 id="halo-receipt-title">Mint confirmed</h2>
                <p>{receipt.name} is in this wallet. {receipt.supply - receipt.left} of {receipt.supply} are minted.</p>
                <p>{haloPrice} · {haloNetwork}</p>
                {explorer && (
                  <a href={`${explorer}/tx/${receipt.hash}`} target="_blank" rel="noreferrer">
                    View transaction
                  </a>
                )}
                <p>
                  <a href="/#my-nfts">View in this wallet</a>
                </p>
              </div>
            </div>
          </div>
        )}
        {open && (
          <div className="eyed-story" role="dialog" aria-modal="true" aria-labelledby="halo-story-title">
            <button type="button" className="eyed-story-backdrop" aria-label="Close" onClick={() => setOpen("")} />
            <div className="eyed-story-card" ref={cardRef}>
              <button type="button" className="eyed-story-close" aria-label="Close" onClick={() => setOpen("")}>
                ×
              </button>
              <img src={`/art/halo/${piece.id}.png`} alt="" width="640" height="640" />
              <div>
                <h2 id="halo-story-title">{piece.name}</h2>
                <p>{piece.story}</p>
                <DropFacts
                  maker="RareCognos"
                  collection="Halo"
                  network="LiteForge testnet"
                  price={priceText}
                  priceState={live ? (priceRead.data !== undefined ? "read" : "unread") : "planned"}
                  minted={minted}
                  supply={supply}
                  supplyState={supplyState}
                  contractUrl={address && explorer ? `${explorer}/address/${address}` : undefined}
                  metadataUrl={`${siteOrigin}/meta/halo/${piece.id}.json`}
                />
                <button className="primary-action" type="button" disabled={busy || soldOut || (!live && !canLaunch)} onClick={onPrimary}>
                  {actionLabel}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
      <SiteFooter exploreHref="/explore" />
    </div>
  );
}
