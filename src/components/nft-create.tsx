import { useEffect, useState, useRef } from "react";
import { useAccount, useWalletClient, useReadContract } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { formatEther, keccak256, parseEther, toHex, type Address, type Hash } from "viem";
import { chain, contracts, configured } from "@/lib/nft/config";
import { mediaURL, nftCall } from "@/lib/nft/data";
import { assertChain, records, transactionError, type transact } from "@/lib/nft/transaction";
import { useEditionFactory } from "@/lib/nft/drops";
import { createDrop, DropCreated } from "./nft-drops";
export const uploadAPI = (import.meta.env.VITE_UPLOAD_API_URL || "/api/upload").replace(/\/$/, "");
type Prepared = {
  kind?: "edition" | "single";
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
  const factory = useEditionFactory();
  const dropsConfigured = factory.data === true && !factory.isError;
  const account = useAccount(),
    wallet = useWalletClient();
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
  const draftReady = useRef(false);
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
    setCreated(undefined);
    setProgress("");
    try {
      const saved = JSON.parse(localStorage.getItem(key) || "null") as Prepared | null;
      setPrepared(saved || undefined);
      setKind(saved?.kind ?? "single");
    } catch {
      setPrepared(undefined);
    }
  }, [key]);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("rarecognos.create.draft") || "null");
      if (saved) {
        if (saved.name) setName(saved.name);
        if (saved.description) setDescription(saved.description);
        if (saved.rights) setRights(true);
        if (saved.file && saved.fileName && saved.file.length < 1_800_000) {
          fetch(saved.file)
            .then((res) => res.blob())
            .then((blob) => setFile(new File([blob], saved.fileName, { type: saved.type || blob.type })))
            .catch(() => {});
        }
      }
    } catch {
      /* ignore a broken draft */
    }
    draftReady.current = true;
  }, []);
  useEffect(() => {
    if (!draftReady.current) return;
    const write = (fileData?: string) => {
      localStorage.setItem(
        "rarecognos.create.draft",
        JSON.stringify({
          name,
          description,
          rights,
          file: fileData,
          fileName: file?.name,
          type: file?.type,
        }),
      );
    };
    if (!file || file.size > 1_200_000) {
      write();
      return;
    }
    const reader = new FileReader();
    reader.onload = () => write(typeof reader.result === "string" ? reader.result : undefined);
    reader.readAsDataURL(file);
  }, [name, description, rights, file]);
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
    void (async () => {
      const buf = new Uint8Array(await next.slice(0, 12).arrayBuffer());
      const png = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
      const jpg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
      const webp = buf[0] === 0x52 && buf[1] === 0x49 && buf[8] === 0x57 && buf[9] === 0x45;
      if ((!png && !jpg && !webp) || next.size > 3 * 1024 * 1024) {
        setFile(undefined);
        setProgress("Choose a real PNG, JPEG, or WebP file up to 3 MB.");
        return;
      }
      setFile(next);
      setProgress("");
    })();
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
        kind,
        name,
        description,
        rights,
      });
      setProgress("Approve the upload in your wallet. This signature is free.");
      const signature = await wallet.data.signTypedData(challenge.typed);
      const current = await wallet.data.getAddresses();
      if (current[0]?.toLowerCase() !== address.toLowerCase())
        throw Error("Account changed. Prepare again with the current wallet.");
      setProgress("Uploading artwork…");
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
      setProgress("");
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
    query: { enabled: configured && !!prepared && kind === "single" },
  });
  const mintedId = kind === "single" && minted.data ? minted.data : undefined;
  const finished = !!mintedId || !!created;
  const checkingMint = kind === "single" && minted.isPending;
  const actionLabel = busy ? (kind === "single" ? "Minting…" : "Creating collection…") : kind === "single" ? "Mint NFT" : "Create collection";
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
        {dropsConfigured && !prepared && <div className="kind-toggle" role="group" aria-label="Creation type"><button type="button" disabled={uploading} aria-pressed={kind === "single"} onClick={() => setKind("single")}>1/1 artwork</button><button type="button" disabled={uploading} aria-pressed={kind === "edition"} onClick={() => setKind("edition")}>Limited edition</button></div>}
        {!created && <h3 aria-live="polite">{mintedId ? "NFT minted" : prepared ? (kind === "edition" ? "Ready to launch" : "Ready to mint") : kind === "edition" ? "Create a limited edition" : "Create a 1/1 work"}</h3>}
        {prepared ? (
          <>
            {created && <DropCreated address={created.address} hash={created.hash} />}
            <h4>{prepared.name}</h4>
            {prepared.description && <p>{prepared.description}</p>}
            {!mintedId && kind === "single" && (
              <p>1/1 edition · 0 {chain.nativeCurrency.symbol} + network fee</p>
            )}
            {kind === "edition" && !created && <>
              <label>Collection symbol<input maxLength={32} value={symbol} disabled={disabled} onChange={e => setSymbol(e.target.value.toUpperCase())} /></label>
              <label>Max supply<input type="number" min="1" value={supply} disabled={disabled} onChange={e => setSupply(e.target.value)} /></label>
              <label>Max mints per wallet<input type="number" min="1" value={limit} disabled={disabled} onChange={e => setLimit(e.target.value)} /></label>
              <label>Mint price ({chain.nativeCurrency.symbol})<input inputMode="decimal" value={price} disabled={disabled} onChange={e => setPrice(e.target.value)} /></label>
              <details className="token-technical">
                <summary>Mint schedule</summary>
                <label>Mint starts<input type="datetime-local" value={start} disabled={disabled} onChange={e => setStart(e.target.value)} /></label>
                <label>Mint ends<input type="datetime-local" value={end} disabled={disabled} onChange={e => setEnd(e.target.value)} /></label>
              </details>
              <p>{priceValue === 0n ? "Collectors pay only the network fee." : `You receive ${formatEther(priceValue - fee)} ${chain.nativeCurrency.symbol} per mint after the 0.25% platform fee.`}</p>
            </>}
            {mintedId ? (
              <a className="primary-action" href={`/token/${mintedId}`}>View NFT</a>
            ) : !created && (
              <button
                type="button"
                className="primary-action"
                disabled={!ready || disabled || !!pending || checkingMint || (kind === "edition" && (!validEdition || !dropsConfigured)) || prepared.creator.toLowerCase() !== account.address?.toLowerCase()}
                onClick={() => kind === "single" ? void run({ ...nftCall, functionName: "mint", args: [prepared.uri] }) : void createDrop(run, { name: prepared.name, symbol: symbol.trim(), description: prepared.description, uri: prepared.uri, supply: BigInt(supply), price: priceValue, limit: BigInt(limit), start: start ? BigInt(Math.floor(new Date(start).getTime() / 1000)) : 0n, end: end ? BigInt(Math.floor(new Date(end).getTime() / 1000)) : 0n }, (address, hash) => setCreated({ address, hash }))}
              >
                {pending ? "Waiting for confirmation…" : checkingMint ? "Checking mint status…" : actionLabel}
              </button>
            )}
            {kind === "edition" && !dropsConfigured && <p className="market-notice">Limited editions are unavailable on this network.</p>}
            <button
              type="button"
              className="nft-button"
              disabled={disabled || !!pending}
              onClick={() => {
                localStorage.removeItem(key);
                setPrepared(undefined);
                setCreated(undefined);
                setProgress("");
                if (finished) {
                  setFile(undefined);
                  setName("");
                  setDescription("");
                  setRights(false);
                }
              }}
            >
              {finished ? "Create another NFT" : "Back to editing"}
            </button>
            <details className="token-technical">
              <summary>Technical details</summary>
              <dl className="token-technical-facts">
                <dt>Network</dt><dd>{chain.name}</dd>
                <dt>Creator</dt><dd>{prepared.creator}</dd>
                <dt>Metadata URI</dt><dd>{prepared.uri}</dd>
              </dl>
            </details>
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
                {service.isPending
                  ? "Checking storage…"
                  : service.isError
                    ? "Upload service could not be reached."
                    : "Permanent storage is not available on this server."}
                {!service.isPending && (
                  <button type="button" className="nft-button" onClick={() => void service.refetch()}>
                    Retry
                  </button>
                )}
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
            <p>Prepare first, then confirm minting in your wallet.</p>
            {!account.address && (
              <p>
                Connect a wallet to prepare. The form stays here.{" "}
                <button type="button" className="nft-button" onClick={() => window.dispatchEvent(new Event("rarecognos-login"))}>
                  Connect wallet
                </button>
              </p>
            )}
            {account.address && account.chainId !== chain.id && (
              <p>Wrong network. Switch to LiteForge in the header. The form stays here.</p>
            )}
            {file && file.size > 1_200_000 && (
              <p>This image is too large for the saved draft. You will need to choose it again if you leave.</p>
            )}
          </>
        )}
        {!account.address && prepared && <p>Connect your wallet to continue.</p>}
        <p role="status" aria-live="polite">
          {progress}
        </p>
      </div>
    </div>
  );
}
