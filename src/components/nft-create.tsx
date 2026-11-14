import { useEffect, useState, useRef } from "react";
import { useAccount, useWalletClient, useReadContract, usePublicClient } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { formatEther, keccak256, parseEther, toHex, type Address, type Hash } from "viem";
import { chain, contracts, configured } from "@/lib/nft/config";
import { mediaURL, nftCall } from "@/lib/nft/data";
import { assertChain, records, resumeTransaction, transactionError, type transact } from "@/lib/nft/transaction";
import { dropsConfigured } from "@/lib/nft/config";
import { createDrop, DropCreated } from "./nft-drops";
export const uploadAPI = (import.meta.env.VITE_UPLOAD_API_URL || "/api/upload").replace(/\/$/, "");
type Prepared = {
  uri: string;
  image: string;
  name: string;
  description: string;
  creator: string;
  chainId: number;
  mode: string;
};
export function NFTCreate({
  run,
  busy,
  ready,
}: {
  run: (call: Parameters<typeof transact>[2], after?: (receipt: Awaited<ReturnType<typeof transact>>) => void) => Promise<void>;
  busy: boolean;
  ready: boolean;
}) {
  const account = useAccount(),
    wallet = useWalletClient(),
    client = usePublicClient({ chainId: chain.id });
  const [file, setFile] = useState<File>(),
    [preview, setPreview] = useState(""),
    [name, setName] = useState(""),
    [description, setDescription] = useState(""),
    [rights, setRights] = useState(false),
    [progress, setProgress] = useState(""),
    [uploading, setUploading] = useState(false),
    [prepared, setPrepared] = useState<Prepared>(),
    [kind, setKind] = useState<"single" | "edition">("single"),
    [symbol, setSymbol] = useState(""),
    [supply, setSupply] = useState("100"),
    [limit, setLimit] = useState("5"),
    [price, setPrice] = useState("0"),
    [start, setStart] = useState(""),
    [end, setEnd] = useState(""),
    [created, setCreated] = useState<{ address: Address; hash: Hash }>();
  const pending = records().find(r => r.status === "pending" && r.chainId === chain.id && r.wallet.toLowerCase() === account.address?.toLowerCase());
  const currentAccount = useRef(account.address);
  currentAccount.current = account.address;
  const fileRef = useRef<HTMLInputElement>(null);
  const key = `rarecognos.prepared.v2:${chain.id}:${contracts.collection}:${account.address?.toLowerCase()}`;
  const service = useQuery({
    queryKey: ["upload-status", uploadAPI],
    enabled: !!uploadAPI,
    queryFn: async () => {
      const r = await fetch(uploadAPI + "/status", { signal: AbortSignal.timeout(8000) });
      if (!r.ok) throw Error("Upload service unavailable");
      return r.json() as Promise<{ enabled: boolean; mode: string }>;
    },
    retry: 1,
  });
  useEffect(() => {
    try {
      setPrepared(JSON.parse(localStorage.getItem(key) || "null") || undefined);
    } catch {
      setPrepared(undefined);
    }
  }, [key]);
  useEffect(() => {
    if (!file) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function acceptFile(next?: File) {
    if (!next) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(next.type) || next.size > 3 * 1024 * 1024) {
      setProgress("Choose PNG, JPEG or WebP up to 3 MB");
      return;
    }
    setFile(next);
    setProgress("");
  }
  async function prepare() {
    if (!file || !account.address || !wallet.data || !rights || uploading) return;
    setUploading(true);
    const address = account.address;
    try {
      assertChain(await wallet.data.getChainId(), chain.id);
      setProgress("Checking artwork…");
      const bytes = await file.arrayBuffer();
      const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (x) =>
        x.toString(16).padStart(2, "0"),
      ).join("");
      const post = async (path: string, data: unknown) => {
        const r = await fetch(uploadAPI + path, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
          signal: AbortSignal.timeout(150000),
        });
        const body = await r.json();
        if (!r.ok) throw Error(body.error || "Upload failed");
        return body;
      };
      const challenge = await post("/challenge", {
        wallet: address,
        digest,
        name,
        description,
        rights,
      });
      setProgress("Confirm in your wallet. This only allows the upload. It does not send zkLTC.");
      const signature = await wallet.data.signTypedData(challenge.typed);
      const current = await wallet.data.getAddresses();
      if (current[0]?.toLowerCase() !== address.toLowerCase())
        throw Error("Account changed. Prepare again with the current wallet.");
      setProgress("Uploading image and metadata…");
      let binary = "";
      for (const n of new Uint8Array(bytes)) binary += String.fromCharCode(n);
      const result = (await post("/prepare", {
        id: challenge.id,
        signature,
        file: btoa(binary),
      })) as Prepared;
      if (result.creator.toLowerCase() !== address.toLowerCase() || result.chainId !== chain.id)
        throw Error("Prepared artwork belongs to a different wallet or chain");
      localStorage.setItem(key, JSON.stringify(result));
      if (currentAccount.current?.toLowerCase() !== address.toLowerCase()) return;
      setPrepared(result);
      setProgress("Artwork prepared. Review it before minting.");
    } catch (e) {
      setProgress(transactionError(e));
    } finally {
      setUploading(false);
    }
  }
  const minted = useReadContract({
    ...nftCall,
    functionName: "tokenForURI",
    args: [keccak256(toHex(prepared?.uri || ""))],
    chainId: chain.id,
    query: { enabled: configured && !!prepared },
  });
  const disabled = busy || uploading;
  const priceValue = (() => { try { return parseEther(price || "0"); } catch { return 0n; } })();
  const fee = priceValue * 25n / 10000n;
  const validEdition = /^\d+$/.test(supply) && /^\d+$/.test(limit) && BigInt(supply) > 0n && BigInt(limit) > 0n && BigInt(limit) <= BigInt(supply) && symbol.trim().length > 0 && symbol.trim().length <= 32 && (!start && !end || !!start && !!end && new Date(start).getTime() < new Date(end).getTime()) && /^\d+(\.\d{1,18})?$/.test(price || "0");
  return (
    <div className="creation-grid">
      <div
        className={prepared || preview ? "art-preview" : "art-preview is-empty"}
        onDragOver={(e) => {
          if (!prepared) e.preventDefault();
        }}
        onDrop={(e) => {
          if (prepared) return;
          e.preventDefault();
          acceptFile(e.dataTransfer.files?.[0]);
        }}
      >
        {prepared || preview ? (
          <img
            src={preview || mediaURL(prepared!.image)}
            alt={prepared?.name || name || "Artwork preview"}
          />
        ) : (
          <button type="button" className="preview-empty" disabled={disabled} onClick={() => fileRef.current?.click()}>
            <strong>Drop artwork here</strong>
            <span>or click to choose · PNG, JPEG, WebP · 3 MB</span>
          </button>
        )}
      </div>
      <div className="creation-form">
        <div className="kind-toggle" role="group" aria-label="Creation type"><button type="button" aria-pressed={kind === "single"} onClick={() => setKind("single")}>1/1 artwork</button>{dropsConfigured && <button type="button" aria-pressed={kind === "edition"} onClick={() => setKind("edition")}>Limited edition</button>}</div>
        <h3>{prepared ? (kind === "edition" ? "Ready to launch" : "Ready to mint") : kind === "edition" ? "Create a limited edition" : "Create a 1/1 work"}</h3>
        <p>
          {kind === "edition"
            ? "A fixed supply from one artwork. Collectors mint from that edition."
            : "One token for this record. Reusing an image does not prove originality."}
        </p>
        {prepared ? (
          <>
            {pending && <button className="nft-button" disabled={busy} onClick={async () => { if (!client) return; setProgress("Checking transaction receipt…"); try { await resumeTransaction(client, pending, setProgress); } catch (e) { setProgress(transactionError(e)); } }}>Recheck pending transaction (does not resend)</button>}
            {created && <DropCreated address={created.address} hash={created.hash} />}
            <h4>{prepared.name}</h4>
            <p>{prepared.description}</p>
            <p className="uri-text">Metadata: {prepared.uri}</p>
            <p>Creator: {prepared.creator}</p>
            <p>Edition 1/1 · Mint price 0 zkLTC + estimated network fee shown in your wallet</p>
            {kind === "edition" && <>
              <label>Collection symbol<input maxLength={32} value={symbol} disabled={disabled || !!created} onChange={e => setSymbol(e.target.value.toUpperCase())} /></label>
              <label>Max supply<input type="number" min="1" value={supply} disabled={disabled || !!created} onChange={e => setSupply(e.target.value)} /></label>
              <label>Max mints per wallet<input type="number" min="1" value={limit} disabled={disabled || !!created} onChange={e => setLimit(e.target.value)} /></label>
              <label>Mint price ({chain.nativeCurrency.symbol})<input inputMode="decimal" value={price} disabled={disabled || !!created} onChange={e => setPrice(e.target.value)} /></label>
              <label>Optional mint start<input type="datetime-local" value={start} disabled={disabled || !!created} onChange={e => setStart(e.target.value)} /></label>
              <label>Optional mint end<input type="datetime-local" value={end} disabled={disabled || !!created} onChange={e => setEnd(e.target.value)} /></label>
              <p className="market-notice">{priceValue === 0n ? "Free mint: no RareCognos platform fee. Collectors pay network gas." : <>Total paid per mint: {formatEther(priceValue)} {chain.nativeCurrency.symbol}<br />RareCognos Treasury: 0.25% ({formatEther(fee)} {chain.nativeCurrency.symbol})<br />Creator proceeds: 99.75% ({formatEther(priceValue - fee)} {chain.nativeCurrency.symbol})<br />Network gas is paid separately by the collector.</>}</p>
            </>}
            <button
              className="primary-action"
              disabled={!ready || disabled || !!pending || !!created || (kind === "single" ? !!minted.data : !validEdition || !dropsConfigured) || prepared.creator.toLowerCase() !== account.address?.toLowerCase()}
              onClick={() => kind === "single" ? void run({ ...nftCall, functionName: "mint", args: [prepared.uri] }) : void createDrop(run, { name: prepared.name, symbol: symbol.trim(), description: prepared.description, uri: prepared.uri, supply: BigInt(supply), price: priceValue, limit: BigInt(limit), start: start ? BigInt(Math.floor(new Date(start).getTime() / 1000)) : 0n, end: end ? BigInt(Math.floor(new Date(end).getTime() / 1000)) : 0n }, (address, hash) => setCreated({ address, hash }))}
            >
              {kind === "single" ? (minted.data ? "Already minted" : "Mint this work") : created ? "Drop created" : "Create collection"}
            </button>
            {kind === "edition" && !dropsConfigured && <p className="market-notice">The new drop factory is not deployed/configured on this network. Existing NFT creation remains available.</p>}
            {!!minted.data && (
              <a className="text-link" href={`/#token/${minted.data}`}>
                View minted token #{String(minted.data)}
              </a>
            )}
            <button
              className="nft-button"
              disabled={disabled}
              onClick={() => {
                localStorage.removeItem(key);
                setPrepared(undefined);
                setCreated(undefined);
              }}
            >
              Prepare another work
            </button>
            <p>
              Rejecting mint keeps this prepared record. After confirmation, the same URI cannot be
              minted twice.
            </p>
          </>
        ) : (
          <>
            <input
              ref={fileRef}
              className="preview-file"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={disabled}
              onChange={(e) => {
                acceptFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            {file && (
              <button type="button" className="nft-button" disabled={disabled} onClick={() => fileRef.current?.click()}>
                Replace image · {file.name}
              </button>
            )}
            <label>
              Work name
              <input
                maxLength={120}
                value={name}
                disabled={disabled}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label>
              Description
              <textarea
                maxLength={2000}
                rows={4}
                value={description}
                disabled={disabled}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            <label className="rights-check">
              <input
                type="checkbox"
                checked={rights}
                disabled={disabled}
                onChange={(e) => setRights(e.target.checked)}
              />
              I own this artwork or have permission to publish it as an NFT.
            </label>
            {!service.data?.enabled && (
              <div className="market-notice" role="status">
                {service.isLoading
                  ? "Checking storage…"
                  : service.isError
                    ? "Upload service could not be reached."
                    : "Permanent storage needs a Pinata key on the server (PINATA_JWT)."}
                <button type="button" className="nft-button" onClick={() => void service.refetch()}>
                  Retry
                </button>
              </div>
            )}
            {service.data?.mode === "local-demo" && (
              <p className="market-notice">Local demo storage. These files are not on public IPFS.</p>
            )}
            <button
              className="primary-action"
              disabled={
                disabled ||
                !file ||
                !name.trim() ||
                !rights ||
                !account.address ||
                account.chainId !== chain.id ||
                !service.data?.enabled
              }
              onClick={() => void prepare()}
            >
              {uploading ? "Preparing artwork…" : "Upload & prepare NFT"}
            </button>
          </>
        )}
        {!account.address && (
          <p>Use Connect wallet in the top bar to continue. Your form stays here.</p>
        )}
        <p role="status" aria-live="polite">
          {progress}
        </p>
      </div>
    </div>
  );
}
