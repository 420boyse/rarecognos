import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useAccount, usePublicClient, useReadContract, useSwitchChain, useWalletClient } from "wagmi";
import { formatEther, isAddress, type Address, type Hash } from "viem";
import { FanStackNFT } from "@/components/fan-stack-nft";
import { DropFacts } from "@/components/drop-facts";
import { MarketHeader } from "@/components/market-header";
import { SiteFooter } from "@/components/site-footer";
import { eyed, eyedNetwork, eyedPrice } from "@/data/eyed";
import { chain, explorer } from "@/lib/nft/config";
import { eyedTreasury, eyedUris, readEyedAddress, saveEyedAddress } from "@/lib/nft/eyed-address";
import eyedDeployment from "../../config/eyed.json";
import { availabilityLabel, dropStatus } from "@/lib/nft/availability";
import { isTimeout, phaseLabel, txFailure, type MintPhase } from "@/lib/nft/mint-phase";
import { eyedContractIndex, eyedVisible } from "@/lib/nft/piece-index";
import { abi } from "@/lib/nft/RareCognosEyed";
import { pageMeta, siteOrigin } from "@/lib/site-meta";
import { transactionError } from "@/lib/nft/transaction";

type EyedSearch = { piece?: string; setup?: "1" };

function readSearch(search: Record<string, unknown>): EyedSearch {
  const piece = typeof search.piece === "string" && eyed.some((item) => item.id === search.piece) ? search.piece : undefined;
  return { piece, setup: search.setup === "1" ? "1" : undefined };
}

export const Route = createFileRoute("/eyed")({
  validateSearch: readSearch,
  head: ({ match }) => {
    const face = eyed.find((item) => item.id === match.search.piece);
    const path = face ? `/eyed?piece=${face.id}` : "/eyed";
    return pageMeta({
      title: face ? `${face.name} · Eyed · RareCognos` : "Eyed · RareCognos",
      description: face
        ? face.story
        : "Eyed is a character collection available to discover and mint on LiteForge.",
      path,
      image: face ? `/art/eyed/${face.id}.jpg` : "/art/eyed/02.jpg",
    });
  },
  component: EyedPage,
});

function EyedPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const visible = eyedVisible(search.piece);
  const pieceId = visible.some((item) => item.id === search.piece) ? search.piece! : visible[0].id;
  const canLaunch = search.setup === "1";
  const [address, setAddress] = useState<Address | undefined>(() =>
    eyedDeployment.address && isAddress(eyedDeployment.address) ? eyedDeployment.address : undefined,
  );
  const [receipt, setReceipt] = useState<{ hash: Hash; left: number; supply: number } | null>(null);
  const [pendingHash, setPendingHash] = useState<Hash | null>(null);
  const [phase, setPhase] = useState<MintPhase>("idle");
  const [notice, setNotice] = useState("");
  const [story, setStory] = useState(false);
  const storyRef = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const lock = useRef(false);
  const holdScroll = useRef<number | null>(null);
  const account = useAccount();
  const network = useSwitchChain();
  const client = usePublicClient({ chainId: chain.id });
  const wallet = useWalletClient();
  const piece = eyedContractIndex(pieceId);
  const wrong = account.isConnected && account.chainId !== chain.id;
  const face = eyed[piece] ?? visible[0];
  const live = Boolean(address);
  const priceRead = useReadContract({
    address,
    abi,
    functionName: "MINT_PRICE",
    query: { enabled: live },
  });
  const supplyRead = useReadContract({
    address,
    abi,
    functionName: "PIECE_SUPPLY",
    query: { enabled: live },
  });
  const mintedRead = useReadContract({
    address,
    abi,
    functionName: "mintedOf",
    args: [BigInt(Math.max(0, piece))],
    query: { enabled: live && piece >= 0 },
  });
  const supply = supplyRead.data === undefined ? undefined : Number(supplyRead.data);
  const minted = mintedRead.data === undefined ? undefined : Number(mintedRead.data);
  const soldOut = supply !== undefined && minted !== undefined && minted >= supply;
  const supplyState = !live ? "unopened" : mintedRead.isError || supplyRead.isError ? "unread" : mintedRead.isPending || supplyRead.isPending ? "reading" : "read";
  const availability = dropStatus({
    live,
    price: priceRead.data,
    supply: supplyRead.data,
    minted: mintedRead.data,
    priceError: priceRead.isError,
    supplyError: supplyRead.isError,
    mintedError: mintedRead.isError,
    trackMinted: true,
  });
  const statusText = availabilityLabel(availability);
  const priceText = priceRead.data !== undefined ? `${formatEther(priceRead.data)} zkLTC` : eyedPrice;

  useEffect(() => {
    const saved = readEyedAddress();
    if (saved) setAddress(saved);
  }, []);

  const dialogOpen = story || Boolean(receipt);
  useEffect(() => {
    if (!dialogOpen) return;
    const node = storyRef.current;
    const previous = (opener.current ?? document.activeElement) as HTMLElement | null;
    node?.querySelector<HTMLElement>("button, a")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setStory(false);
        setReceipt(null);
      }
      if (event.key !== "Tab" || !node) return;
      const items = [...node.querySelectorAll<HTMLElement>("button, a, input, textarea")];
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

  const go = (id: string) => {
    if (id === pieceId) return;
    holdScroll.current = window.scrollY;
    void navigate({
      search: (prev) => ({ ...prev, piece: id }),
      replace: true,
      resetScroll: false,
    });
  };

  useEffect(() => {
    if (holdScroll.current === null) return;
    const top = holdScroll.current;
    const restore = () => {
      if (Math.abs(window.scrollY - top) > 1) window.scrollTo({ top, left: 0 });
    };
    restore();
    const frame = requestAnimationFrame(restore);
    const timer = window.setTimeout(() => {
      restore();
      holdScroll.current = null;
    }, 50);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [pieceId]);

  const launch = async () => {
    if (lock.current || !wallet.data || !client) return;
    lock.current = true;
    setPhase("awaiting-wallet");
    setNotice("");
    let hash: Hash | undefined;
    try {
      const artifact = await fetch("/contracts/RareCognosEyed.json").then((res) => res.json());
      hash = await wallet.data.deployContract({
        abi,
        bytecode: artifact.bytecode,
        args: [wallet.data.account.address, eyedTreasury, eyedUris()],
      });
      setPendingHash(hash);
      setPhase("confirming");
      const deployed = await client.waitForTransactionReceipt({ hash, timeout: 120_000 });
      if (!deployed.contractAddress || deployed.status !== "success") throw Error("Deployment did not return a contract.");
      saveEyedAddress(deployed.contractAddress);
      setAddress(deployed.contractAddress);
      setPhase("success");
      setNotice("Drop is open.");
      setPendingHash(null);
    } catch (error) {
      if (hash) {
        setPhase("unknown");
        setPendingHash(hash);
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
    if (lock.current || !wallet.data || !address || !client || piece < 0) return;
    if (pendingHash && (phase === "unknown" || phase === "confirming" || phase === "submitted")) {
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
      const taken = await client.readContract({ address, abi, functionName: "mintedOf", args: [BigInt(piece)] });
      if (taken >= cap) throw Error("This face is sold out.");
      hash = await wallet.data.writeContract({
        address,
        abi,
        functionName: "mint",
        args: [BigInt(piece)],
        value,
      });
      setPendingHash(hash);
      setPhase("submitted");
      setPhase("confirming");
      const confirmed = await client.waitForTransactionReceipt({ hash, timeout: 120_000 });
      if (confirmed.status !== "success") throw Error("The transaction was included but did not succeed.");
      const after = await client.readContract({ address, abi, functionName: "mintedOf", args: [BigInt(piece)] });
      setReceipt({ hash, left: Number(cap) - Number(after), supply: Number(cap) });
      setPhase("success");
      setPendingHash(null);
      setStory(false);
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
        setPendingHash(null);
      }
    } finally {
      lock.current = false;
    }
  };

  const onPrimary = () => {
    if (!live && !canLaunch) return;
    if (!account.isConnected) {
      setStory(false);
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
  const primaryLabel = !live
    ? canLaunch
      ? busy
        ? "Confirming…"
        : "Open the drop"
      : "Not live yet"
    : soldOut
      ? "Sold out"
      : busy
        ? phaseLabel(phase).replace(/\.$/, "…")
        : `Mint ${face.name}`;

  return (
    <div>
      <MarketHeader view="Eyed" />
      <main className="eyed-page">
        <div className="section-heading eyed-heading">
          <div>
            <h1>Eyed</h1>
            <p>Eight featured works from a set of nine. 100 editions each. Vanta remains piece 1 on the contract and is not in this row.</p>
          </div>
          <p className="status-pill" role="status">{statusText}</p>
        </div>
        <FanStackNFT
          initialId={pieceId}
          focusId={pieceId}
          onCenter={go}
          primaryLabel={primaryLabel}
          primaryDisabled={busy || soldOut || (!live && !canLaunch)}
          onPrimary={onPrimary}
          onSelectWork={() => {
            opener.current = document.activeElement as HTMLElement | null;
            setStory(true);
          }}
          items={visible.map((item) => ({
            id: item.id,
            title: item.name,
            image: `/art/eyed/${item.id}.jpg`,
            medium: "100 editions",
            price: eyedPrice,
            network: eyedNetwork,
          }))}
        />
        <p className="sr-only" aria-live="polite">
          Selected work: {face.name}
        </p>
        {(notice || (pendingHash && phase === "unknown")) && (
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
          <div className="eyed-story" role="dialog" aria-modal="true" aria-labelledby="mint-receipt-title">
            <button type="button" className="eyed-story-backdrop" aria-label="Close" onClick={() => setReceipt(null)} />
            <div className="eyed-story-card" ref={storyRef}>
              <button type="button" className="eyed-story-close" aria-label="Close" onClick={() => setReceipt(null)}>
                ×
              </button>
              <img src={`/art/eyed/${face.id}.jpg`} alt="" width="640" height="640" />
              <div>
                <h2 id="mint-receipt-title">Mint confirmed</h2>
                <p>{face.name} is in this wallet. {receipt.supply - receipt.left} of {receipt.supply} are minted. {receipt.left} remain.</p>
                <p>{priceText}</p>
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
        {story && (
          <div className="eyed-story" role="dialog" aria-modal="true" aria-labelledby="eyed-story-title">
            <button type="button" className="eyed-story-backdrop" aria-label="Close" onClick={() => setStory(false)} />
            <div className="eyed-story-card" ref={storyRef}>
              <button type="button" className="eyed-story-close" aria-label="Close" onClick={() => setStory(false)}>
                ×
              </button>
              <img src={`/art/eyed/${face.id}.jpg`} alt="" width="640" height="640" />
              <div>
                <h2 id="eyed-story-title">{face.name}</h2>
                <p>{face.story}</p>
                <DropFacts
                  maker="RareCognos"
                  collection="Eyed"
                  network="LiteForge testnet"
                  price={priceText}
                  priceState={priceRead.data !== undefined ? "read" : "unread"}
                  minted={minted}
                  supply={supply}
                  supplyState={supplyState}
                  contractUrl={address && explorer ? `${explorer}/address/${address}` : undefined}
                  metadataUrl={`${siteOrigin}/meta/eyed/${face.id}.json`}
                />
                <button className="primary-action" type="button" disabled={busy || soldOut || (!live && !canLaunch)} onClick={onPrimary}>
                  {primaryLabel}
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
