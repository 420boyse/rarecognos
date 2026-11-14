import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { FanStackNFT } from "@/components/fan-stack-nft";
import { MarketHeader } from "@/components/market-header";
import { SiteFooter } from "@/components/site-footer";
import { eyed, eyedNetwork, eyedPrice } from "@/data/eyed";
import { chain } from "@/lib/nft/config";
import { eyedTreasury, eyedUris, readEyedAddress, saveEyedAddress } from "@/lib/nft/eyed-address";
import { abi } from "@/lib/nft/RareCognosEyed";
import { transactionError } from "@/lib/nft/transaction";
import type { Address } from "viem";

export const Route = createFileRoute("/eyed")({
  component: EyedPage,
});

function EyedPage() {
  const params = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
  const pieceId = params.get("piece") || eyed[0].id;
  const canLaunch = params.get("setup") === "1";
  const [center, setCenter] = useState(pieceId);
  const [address, setAddress] = useState<Address | undefined>();
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [story, setStory] = useState(false);
  useEffect(() => {
    const saved = readEyedAddress();
    if (saved) setAddress(saved);
  }, []);
  useEffect(() => {
    if (!story) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setStory(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
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
    if (!wallet.data || !address) return;
    setBusy(true);
    setStatus("");
    try {
      const hash = await wallet.data.writeContract({
        address,
        abi,
        functionName: "mint",
        args: [BigInt(piece)],
        value: 10_000_000_000_000_000n,
      });
      setStatus("Mint sent.");
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
          items={eyed.map((item) => ({
            id: item.id,
            title: item.name,
            image: `/art/eyed/${item.id}.jpg`,
            medium: "100 editions",
            price: eyedPrice,
            network: eyedNetwork,
          }))}
        />
        {status && <p className="eyed-note" role="status">{status}</p>}
        {story && face && (
          <div className="eyed-story" role="dialog" aria-modal="true" aria-labelledby="eyed-story-title">
            <button type="button" className="eyed-story-backdrop" aria-label="Close" onClick={() => setStory(false)} />
            <div className="eyed-story-card">
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
