import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { FanStackNFT } from "@/components/fan-stack-nft";
import { MarketHeader } from "@/components/market-header";
import { SiteFooter } from "@/components/site-footer";
import { eyed, eyedNetwork, eyedPrice } from "@/data/eyed";

const faces = eyed.filter((item) => item.id !== "01");
import { chain, explorer } from "@/lib/nft/config";
import { eyedTreasury, eyedUris, readEyedAddress, saveEyedAddress } from "@/lib/nft/eyed-address";
import { abi } from "@/lib/nft/RareCognosEyed";
import { transactionError } from "@/lib/nft/transaction";
import type { Address } from "viem";

export const Route = createFileRoute("/eyed")({
  component: EyedPage,
});

function EyedPage() {
  const params = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
  const pieceId = faces.some((item) => item.id === params.get("piece")) ? params.get("piece")! : faces[0].id;
  const canLaunch = params.get("setup") === "1";
  const [center, setCenter] = useState(pieceId);
  const [address, setAddress] = useState<Address | undefined>();
  const [receipt, setReceipt] = useState<{ hash: string; left: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [story, setStory] = useState(false);
  const storyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const saved = readEyedAddress();
    if (saved) setAddress(saved);
  }, []);
  useEffect(() => {
    if (!story) return;
    const node = storyRef.current;
    const previous = document.activeElement as HTMLElement | null;
    node?.querySelector<HTMLElement>("button")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setStory(false);
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
  }, [story]);
  const account = useAccount();
  const client = usePublicClient({ chainId: chain.id });
  const wallet = useWalletClient();
  const piece = Math.max(0, eyed.findIndex((item) => item.id === center));
  const wrong = account.isConnected && account.chainId !== chain.id;
  const face = eyed[piece];

  const launch = async () => {
    if (!wallet.data || !client) return;
    setBusy(true);
    setStatus("");
    try {
      const artifact = await fetch("/contracts/RareCognosEyed.json").then((res) => res.json());
      const hash = await wallet.data.deployContract({
        abi,
        bytecode: artifact.bytecode,
        args: [wallet.data.account.address, eyedTreasury, eyedUris()],
      });
      const receipt = await client.waitForTransactionReceipt({ hash });
      if (!receipt.contractAddress) throw Error("Deployment did not return a contract.");
      saveEyedAddress(receipt.contractAddress);
      setAddress(receipt.contractAddress);
      setStatus("");
    } catch (e) {
      setStatus(transactionError(e));
    } finally {
      setBusy(false);
    }
  };

  const mint = async () => {
    if (!wallet.data || !address || !client) return;
    setBusy(true);
    setStatus("");
    setReceipt(null);
    try {
      const hash = await wallet.data.writeContract({
        address,
        abi,
        functionName: "mint",
        args: [BigInt(piece)],
        value: 10_000_000_000_000_000n,
      });
      const confirmed = await client.waitForTransactionReceipt({ hash });
      if (confirmed.status !== "success") throw Error("Mint was not confirmed.");
      const minted = await client.readContract({ address, abi, functionName: "mintedOf", args: [BigInt(piece)] });
      const left = 100 - Number(minted);
      setReceipt({ hash, left });
      setStory(false);
    } catch (e) {
      setStatus(transactionError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <MarketHeader view="Eyed" />
      <main className="eyed-page">
        <FanStackNFT
          initialId={pieceId}
          onCenter={(id) => {
            setCenter(id);
            setStory(false);
            const next = new URLSearchParams(window.location.search);
            next.set("piece", id);
            history.replaceState(null, "", `${window.location.pathname}?${next}`);
          }}
          primaryLabel={busy ? "Confirming…" : !address ? (canLaunch ? "Open the drop" : "Not live yet") : `Mint ${face?.name || ""}`}
          onPrimary={() => {
            if (!address && !canLaunch) return;
            if (!account.isConnected || wrong) {
              setStory(false);
              window.dispatchEvent(new Event("rarecognos-login"));
              return;
            }
            if (!address) void launch();
            else void mint();
          }}
          onSelectWork={() => setStory(true)}
          items={faces.map((item) => ({
            id: item.id,
            title: item.name,
            image: `/art/eyed/${item.id}.jpg`,
            medium: "100 editions",
            price: eyedPrice,
            network: eyedNetwork,
          }))}
        />
        {status && <p className="eyed-note" role="status">{status}</p>}
        {receipt && face && (
          <div className="eyed-story" role="dialog" aria-modal="true" aria-labelledby="mint-receipt-title">
            <button type="button" className="eyed-story-backdrop" aria-label="Close" onClick={() => setReceipt(null)} />
            <div className="eyed-story-card">
              <button type="button" className="eyed-story-close" aria-label="Close" onClick={() => setReceipt(null)}>
                ×
              </button>
              <img src={`/art/eyed/${face.id}.jpg`} alt="" />
              <div>
                <h2 id="mint-receipt-title">Minted</h2>
                <p>{face.name} is in this wallet.</p>
                <p>{eyedPrice} · {receipt.left} left of 100</p>
                {explorer && (
                  <a href={`${explorer}/tx/${receipt.hash}`} target="_blank" rel="noreferrer">
                    View transaction
                  </a>
                )}
              </div>
            </div>
          </div>
        )}
        {story && face && (
          <div className="eyed-story" role="dialog" aria-modal="true" aria-labelledby="eyed-story-title">
            <button type="button" className="eyed-story-backdrop" aria-label="Close" onClick={() => setStory(false)} />
            <div className="eyed-story-card" ref={storyRef}>
              <button type="button" className="eyed-story-close" aria-label="Close" onClick={() => setStory(false)}>
                ×
              </button>
              <img src={`/art/eyed/${face.id}.jpg`} alt="" />
              <div>
                <h2 id="eyed-story-title">{face.name}</h2>
                <p>{face.story}</p>
                <button
                  className="primary-action"
                  type="button"
                  disabled={busy || (!address && !canLaunch)}
                  onClick={() => {
                    if (!address && !canLaunch) return;
                    if (!account.isConnected || wrong) {
                      setStory(false);
                      window.dispatchEvent(new Event("rarecognos-login"));
                      return;
                    }
                    if (!address) void launch();
                    else void mint();
                  }}
                >
                  {busy ? "Confirming…" : !address ? "Not live yet" : `Mint ${face.name}`}
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
