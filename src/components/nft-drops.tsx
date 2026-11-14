import { useState } from "react";
import { useAccount, usePublicClient, useReadContract, useWalletClient } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { formatEther, parseEther, parseEventLogs, type Address, type Hash, type PublicClient, type WalletClient } from "viem";
import { ExternalLink, Pause, Play } from "lucide-react";
import { chain, contracts, dropsConfigured, explorer } from "@/lib/nft/config";
import { abi as factoryABI } from "@/lib/nft/RareCognosDropFactory";
import { abi as dropABI } from "@/lib/nft/RareCognosDrop";
import { dropCall, dropURL, feeFor, factoryCall, useCreatorDrops, useDrop, useDropMetadata } from "@/lib/nft/drops";
import { short } from "@/lib/nft/data";
import { records, resumeTransaction, transact, transactionError, type Pending } from "@/lib/nft/transaction";

type Run = (call: Parameters<typeof transact>[2], after?: (receipt: Awaited<ReturnType<typeof transact>>) => void) => Promise<void>;

export function NFTDropMint({ address }: { address: Address }) {
  const account = useAccount(), wallet = useWalletClient(), client = usePublicClient({ chainId: chain.id }), cache = useQueryClient();
  const drop = useDrop(address), image = useDropMetadata(drop.data?.uri);
  const [quantity, setQuantity] = useState(1), [status, setStatus] = useState(""), [busy, setBusy] = useState(false), [hash, setHash] = useState<Hash>();
  const minted = useReadContract({ ...dropCall(address), chainId: chain.id, functionName: "mintedBy", args: [account.address || "0x0000000000000000000000000000000000000000"], query: { enabled: !!drop.data } });
  const total = (drop.data?.mintPrice || 0n) * BigInt(quantity), fee = feeFor(total);
  const pending = records().find(r => r.status === "pending" && r.chainId === chain.id && r.wallet.toLowerCase() === account.address?.toLowerCase());
  async function mint() {
    if (!client || !wallet.data || !drop.data || busy || pending) return;
    setBusy(true); setStatus("");
    try {
      await transact(client as PublicClient, wallet.data as WalletClient, { ...dropCall(address), functionName: "publicMint", args: [BigInt(quantity)], value: total }, (message, h) => { setStatus(message); if (h) setHash(h); });
      setStatus("Edition minted to your wallet and confirmed on-chain.");
      await Promise.all([drop.refetch(), minted.refetch(), cache.invalidateQueries({ queryKey: ["drop"] })]);
    } catch (e) { setStatus(transactionError(e)); } finally { setBusy(false); }
  }
  async function resume(r: Pending) {
    if (!client || busy) return;
    setBusy(true);
    try { await resumeTransaction(client as PublicClient, r, (m, h) => { setStatus(m); if (h) setHash(h); }); setStatus("Transaction confirmed on-chain."); await drop.refetch(); }
    catch (e) { setStatus(transactionError(e)); } finally { setBusy(false); }
  }
  if (drop.isPending) return <section className="market-section"><p role="status">Reading public mint…</p></section>;
  if (drop.error || !drop.data) return <section className="market-section"><div className="market-notice" role="alert">Could not read this drop on {chain.name}. <button className="nft-button" onClick={() => void drop.refetch()}>Retry</button></div></section>;
  const d = drop.data, remaining = d.maxPerWallet - (minted.data || 0n);
  const pct = d.maxSupply > 0n ? Math.min(100, Number((d.total * 100n) / d.maxSupply)) : 0;
  return <section id="drop" className="market-section" aria-labelledby="drop-title">
    <div className="section-heading">
      <div>
        <div className="drop-heading-row">
          <h2 id="drop-title">{d.name}</h2>
          <span className={`drop-badge ${d.open ? "drop-badge--live" : "drop-badge--closed"}`}>
            {d.open ? "Live" : d.total >= d.maxSupply ? "Sold out" : !d.active ? "Paused" : "Closed"}
          </span>
        </div>
        <p>{d.symbol} · Public edition</p>
      </div>
    </div>
    <div className="creation-grid">
      <div className="art-preview">{image.data ? <img src={image.data.image} alt={d.name} /> : <div><h3>{image.isError ? "Artwork unavailable" : "Loading artwork…"}</h3><p className="uri-text">{d.uri}</p></div>}</div>
      <div className="creation-form">
        <div className="mint-progress-block">
          <div className="mint-progress-header">
            <h3>{String(d.total)} / {String(d.maxSupply)} minted</h3>
            <span className="mint-progress-pct">{pct}%</span>
          </div>
          <div className="mint-progress" aria-hidden="true">
            <span style={{ width: `${pct}%` }} />
          </div>
        </div>
        <p>{d.description}</p>
        <dl className="token-details">
          <div><dt>Creator</dt><dd title={d.creator}>{short(d.creator)}</dd></div>
          <div><dt>Chain</dt><dd>{chain.name} ({chain.id})</dd></div>
          <div><dt>Contract</dt><dd>{explorer ? <a href={`${explorer}/address/${address}`} target="_blank" rel="noreferrer">{short(address)}</a> : short(address)}</dd></div>
          <div><dt>Mint price</dt><dd>{d.mintPrice === 0n ? "Free" : `${formatEther(d.mintPrice)} ${chain.nativeCurrency.symbol}`}</dd></div>
          <div><dt>Wallet limit</dt><dd>{String(d.maxPerWallet)} · yours: {String(minted.data || 0n)}</dd></div>
          {d.start > 0n && <div><dt>Mint window</dt><dd>{new Date(Number(d.start) * 1000).toLocaleString()} – {new Date(Number(d.end) * 1000).toLocaleString()}</dd></div>}
        </dl>
        <p>{d.open ? "Public mint is open." : "Public mint is closed, paused, sold out, or outside its window."}</p>
        <label>Quantity<input type="number" min={1} max={Number(remaining)} value={quantity} disabled={busy} onChange={e => setQuantity(Math.max(1, Number(e.target.value)))} /></label>
        <div className="market-notice"><strong>Before you mint</strong><p>Edition: {formatEther(total)} {chain.nativeCurrency.symbol}<br />RareCognos fee (0.25%): {formatEther(fee)} {chain.nativeCurrency.symbol}<br />Creator proceeds (99.75%): {formatEther(total - fee)} {chain.nativeCurrency.symbol}<br />Network gas: separate; estimated by your wallet.<br />Total excluding gas: {formatEther(total)} {chain.nativeCurrency.symbol}</p>{d.mintPrice === 0n && <p>Free mint: no RareCognos fee. Collector pays network gas.</p>}</div>
        <button className="primary-action" disabled={!account.address || account.chainId !== chain.id || busy || !!pending || !d.open || remaining < BigInt(quantity) || quantity > Number(d.maxSupply - d.total)} onClick={() => void mint()}>{busy ? "Processing…" : d.mintPrice === 0n ? "Mint free edition" : "Mint edition"}</button>
        {!account.address && <p>Connect an EVM wallet in the top bar to mint.</p>}
        {pending && <button className="nft-button" disabled={busy} onClick={() => void resume(pending)}>Recheck pending receipt (does not resend)</button>}
        {status && <div role="status" className="market-notice"><p>{status}</p>{hash && explorer && <a className="text-link" href={`${explorer}/tx/${hash}`} target="_blank" rel="noreferrer">View transaction</a>}</div>}
      </div>
    </div>
  </section>;
}

export function CreatorDashboard() {
  const account = useAccount(), client = usePublicClient({ chainId: chain.id }), wallet = useWalletClient(), cache = useQueryClient();
  const drops = useCreatorDrops(account.address);
  const [status, setStatus] = useState(""), [busy, setBusy] = useState(false);
  async function toggle(address: Address, active: boolean) {
    if (!client || !wallet.data || busy) return;
    setBusy(true);
    try { await transact(client as PublicClient, wallet.data as WalletClient, { ...dropCall(address), functionName: "setMintingActive", args: [!active] }, setStatus); await cache.invalidateQueries({ queryKey: ["drop"] }); setStatus("Drop status confirmed on-chain."); }
    catch (e) { setStatus(transactionError(e)); } finally { setBusy(false); }
  }
  if (!dropsConfigured) return null;
  return <section id="drops" className="market-section" aria-labelledby="drops-title"><div className="section-heading"><div><h2 id="drops-title">Your drops</h2><p>Creator-owned editions, independent of the existing marketplace.</p></div></div>
    {!account.address ? <p>Connect your wallet to view your drops.</p> : drops.isPending ? <p>Reading your drops…</p> : drops.error ? <p role="alert">Could not read drops. <button className="nft-button" onClick={() => void drops.refetch()}>Retry</button></p> : !drops.data?.length ? <p>No drops yet. Use Create → Limited edition to launch one.</p> : <div className="owned-grid">{drops.data.map(address => <DashboardDrop key={address} address={address} busy={busy} toggle={toggle} />)}</div>}
    {status && <p className="market-notice" role="status">{status}</p>}
  </section>;
}
function DashboardDrop({ address, busy, toggle }: { address: Address; busy: boolean; toggle: (address: Address, active: boolean) => Promise<void> }) {
  const d = useDrop(address);
  const pct = d.data && d.data.maxSupply > 0n ? Math.min(100, Number((d.data.total * 100n) / d.data.maxSupply)) : 0;
  return (
    <article className="token-card" data-testid="creator-drop-card">
      <div className="token-info">
        {d.data ? (
          <>
            <div className="drop-card-header">
              <h3>{d.data.name}</h3>
              <span className={`drop-badge ${d.data.active ? "drop-badge--live" : "drop-badge--closed"}`}>
                {d.data.active ? "Active" : "Paused"}
              </span>
            </div>
            <p className="drop-card-stats">
              {String(d.data.total)} / {String(d.data.maxSupply)} minted ·{" "}
              {d.data.mintPrice === 0n ? "Free" : `${formatEther(d.data.mintPrice)} ${chain.nativeCurrency.symbol}`}
            </p>
            <div className="mint-progress" aria-hidden="true">
              <span style={{ width: `${pct}%` }} />
            </div>
            <p className="drop-card-meta">
              {d.data.active ? "Active" : "Paused"} · {short(address)}
            </p>
            <div className="drop-card-actions">
              <a className="text-link" href={`#drop/${address}`}>
                Open public mint <ExternalLink size={14} />
              </a>
              <button className="nft-button" disabled={busy} onClick={() => void toggle(address, d.data!.active)}>
                {d.data.active ? <Pause size={15} /> : <Play size={15} />}
                {d.data.active ? "Pause mint" : "Resume mint"}
              </button>
            </div>
          </>
        ) : (
          <p>Loading drop…</p>
        )}
      </div>
    </article>
  );
}

export function DropCreated({ address, hash }: { address: Address; hash?: Hash }) {
  const url = dropURL(address);
  return (
    <div className="market-notice drop-created-box" role="status" data-testid="drop-created">
      <h3>Your drop is live.</h3>
      <p>Collection deployed and confirmed. Share this public mint page:</p>
      <p className="uri-text">{url}</p>
      <div className="drop-card-actions">
        <a className="primary-action" href={`#drop/${address}`}>Open public mint</a>
        <button className="nft-button" onClick={() => void navigator.clipboard.writeText(url)}>Copy share link</button>
        {hash && explorer && <a className="text-link" href={`${explorer}/tx/${hash}`} target="_blank" rel="noreferrer">View deployment transaction</a>}
      </div>
    </div>
  );
}

export async function createDrop(run: Run, input: { name: string; symbol: string; description: string; uri: string; supply: bigint; price: bigint; limit: bigint; start: bigint; end: bigint }, done: (address: Address, hash: Hash) => void) {
  await run({ ...factoryCall, functionName: "createDrop", args: [input.name, input.symbol, input.description, input.uri, input.supply, input.price, input.limit, input.start, input.end] }, receipt => {
    const event = parseEventLogs({ abi: factoryABI, eventName: "DropCreated", logs: receipt.logs }).find(e => e.address.toLowerCase() === contracts.factory!.toLowerCase());
    if (!event) throw Error("Deployment confirmed but DropCreated event is missing. Check the transaction before retrying.");
    done(event.args.drop, receipt.transactionHash);
  });
}
