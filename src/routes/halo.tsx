import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { MarketHeader } from "@/components/market-header";
import { SiteFooter } from "@/components/site-footer";
import { halo, haloNetwork, haloPrice } from "@/data/halo";
import { chain, explorer } from "@/lib/nft/config";
import { haloTreasury, haloUris, readHaloAddress, saveHaloAddress } from "@/lib/nft/halo-address";
import { abi } from "@/lib/nft/RareCognosHalo";
import { transactionError } from "@/lib/nft/transaction";
import type { Address } from "viem";

export const Route = createFileRoute("/halo")({
  component: HaloPage,
});

function HaloPage() {
  const params = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
  const pieceId = params.get("piece") || halo[0].id;
  const canLaunch = params.get("setup") === "1";
  const [open, setOpen] = useState(params.get("piece") || "");
  const [address, setAddress] = useState<Address | undefined>();
  const [receipt, setReceipt] = useState<{ hash: string; left: number; name: string; id: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const account = useAccount();
  const client = usePublicClient({ chainId: chain.id });
  const wallet = useWalletClient();
  const piece = halo.find((item) => item.id === (open || pieceId)) || halo[0];
  const index = Math.max(0, halo.findIndex((item) => item.id === piece.id));
  const wrong = account.isConnected && account.chainId !== chain.id;

  useEffect(() => {
    const saved = readHaloAddress();
    if (saved) setAddress(saved);
  }, []);

  useEffect(() => {
    if (!open) return;
    const node = cardRef.current;
    const previous = document.activeElement as HTMLElement | null;
    node?.querySelector<HTMLElement>("button")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen("");
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
  }, [open]);

  const launch = async () => {
    if (!wallet.data || !client) return;
    setBusy(true);
    setStatus("");
    try {
      const artifact = await fetch("/contracts/RareCognosHalo.json").then((res) => res.json());
      const hash = await wallet.data.deployContract({
        abi,
        bytecode: artifact.bytecode,
        args: [wallet.data.account.address, haloTreasury, haloUris()],
      });
      const receipt = await client.waitForTransactionReceipt({ hash });
      if (!receipt.contractAddress) throw Error("Deployment did not return a contract.");
      saveHaloAddress(receipt.contractAddress);
      setAddress(receipt.contractAddress);
    } catch (error) {
      setStatus(transactionError(error));
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
        args: [BigInt(index)],
        value: 10_000_000_000_000_000n,
      });
      const confirmed = await client.waitForTransactionReceipt({ hash });
      if (confirmed.status !== "success") throw Error("Mint was not confirmed.");
      const minted = await client.readContract({ address, abi, functionName: "mintedOf", args: [BigInt(index)] });
      setReceipt({ hash, left: 100 - Number(minted), name: piece.name, id: piece.id });
      setOpen("");
    } catch (error) {
      setStatus(transactionError(error));
    } finally {
      setBusy(false);
    }
  };

  const onPrimary = () => {
    if (!address && !canLaunch) return;
    if (!account.isConnected || wrong) {
      setOpen("");
      window.dispatchEvent(new Event("rarecognos-login"));
      return;
    }
    if (!address) void launch();
    else void mint();
  };

  return (
    <div>
      <MarketHeader view="Halo" />
      <main className="market-section explore-page">
        <div className="section-heading">
          <div>
            <h1>Halo</h1>
            <p>Six figures. 100 each. 0.01 zkLTC.</p>
          </div>
          {canLaunch && !address && (
            <button className="primary-action" type="button" disabled={busy} onClick={onPrimary}>
              {busy ? "Confirming…" : "Open the drop"}
            </button>
          )}
        </div>
        <ul className="halo-set">
          {halo.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => {
                  setOpen(item.id);
                  const next = new URLSearchParams(window.location.search);
                  next.set("piece", item.id);
                  history.replaceState(null, "", `${window.location.pathname}?${next}`);
                }}
              >
                <img src={`/art/halo/${item.id}.png`} alt="" />
                <span>{item.name}</span>
              </button>
            </li>
          ))}
        </ul>
        {status && <p className="eyed-note" role="status">{status}</p>}
        {receipt && (
          <div className="eyed-story" role="dialog" aria-modal="true" aria-labelledby="halo-receipt-title">
            <button type="button" className="eyed-story-backdrop" aria-label="Close" onClick={() => setReceipt(null)} />
            <div className="eyed-story-card">
              <button type="button" className="eyed-story-close" aria-label="Close" onClick={() => setReceipt(null)}>
                ×
              </button>
              <img src={`/art/halo/${receipt.id}.png`} alt="" />
              <div>
                <h2 id="halo-receipt-title">Minted</h2>
                <p>{receipt.name} is in this wallet.</p>
                <p>{haloPrice} · {receipt.left} left of 100</p>
                {explorer && (
                  <a href={`${explorer}/tx/${receipt.hash}`} target="_blank" rel="noreferrer">
                    View transaction
                  </a>
                )}
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
              <img src={`/art/halo/${piece.id}.png`} alt="" />
              <div>
                <h2 id="halo-story-title">{piece.name}</h2>
                <p>{piece.story}</p>
                <p>
                  {haloPrice} · {haloNetwork}
                </p>
                <button
                  className="primary-action"
                  type="button"
                  disabled={busy || (!address && !canLaunch)}
                  onClick={onPrimary}
                >
                  {busy ? "Confirming…" : !address ? (canLaunch ? "Open the drop" : "Not live yet") : `Mint ${piece.name}`}
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
