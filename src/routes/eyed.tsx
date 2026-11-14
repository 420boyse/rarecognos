import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAccount, usePublicClient, useReadContract, useWalletClient } from "wagmi";
import { FanStackNFT } from "@/components/fan-stack-nft";
import { MarketHeader } from "@/components/market-header";
import { NetworkHelp } from "@/components/network-help";
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
  const [center, setCenter] = useState(pieceId);
  const [address, setAddress] = useState<Address | undefined>();
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const saved = readEyedAddress();
    if (saved) setAddress(saved);
  }, []);
  const account = useAccount();
  const client = usePublicClient({ chainId: chain.id });
  const wallet = useWalletClient();
  const piece = Math.max(0, eyed.findIndex((face) => face.id === center));
  const minted = useReadContract({
    address,
    abi,
    functionName: "mintedOf",
    args: [BigInt(piece)],
    query: { enabled: Boolean(address) },
  });
  const wrong = account.isConnected && account.chainId !== chain.id;
  const left = minted.data === undefined ? null : 100 - Number(minted.data);

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
      setStatus(`Eyed is live at ${receipt.contractAddress}`);
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
      setStatus(`Mint sent. ${hash}`);
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
          onCenter={setCenter}
          items={eyed.map((face) => ({
            id: face.id,
            title: face.name,
            image: `/art/eyed/${face.id}.jpg`,
            medium: "100 editions",
            price: eyedPrice,
            network: eyedNetwork,
          }))}
        />
        <div className="eyed-mint">
          {!address && <p>Not on testnet yet. Your wallet launches the collection once.</p>}
          {address && <p>{left === null ? "Reading supply…" : `${left} of 100 left`} · {eyedPrice} · {eyedNetwork}</p>}
          {wrong || !account.isConnected ? (
            <NetworkHelp />
          ) : !address ? (
            <button className="primary-action" type="button" disabled={busy} onClick={() => void launch()}>
              {busy ? "Launching…" : "Launch Eyed"}
            </button>
          ) : (
            <button className="primary-action" type="button" disabled={busy || left === 0} onClick={() => void mint()}>
              {busy ? "Minting…" : `Mint ${eyed[piece]?.name || "this piece"}`}
            </button>
          )}
          {status && <p role="status">{status}</p>}
        </div>
      </main>
      <SiteFooter exploreHref="/explore" />
    </div>
  );
}
