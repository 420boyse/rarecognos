import { useEffect, useState, useRef } from "react";
import { useAccount, useBalance, usePublicClient, useWalletClient } from "wagmi";
import {
  encodeDeployData,
  formatEther,
  zeroAddress,
  keccak256,
  isAddress,
  type Abi,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { chain, explorer } from "@/lib/nft/config";
import {
  transactionError,
  assertChain,
  saveRecord,
  records,
  resumeTransaction,
  followReceipt,
  type Pending,
} from "@/lib/nft/transaction";
import { abi as nft } from "@/lib/nft/RareCognos";
import { abi as marketAbi } from "@/lib/nft/RareCognosMarket";
import { uploadAPI } from "./nft-create";
type State = {
  collection?: Address;
  market?: Address;
  collectionDeploymentTx?: Hex;
  marketDeploymentTx?: Hex;
  pending?: Pending;
  artifactHash?: Hex;
};
export function NFTDeploy() {
  const account = useAccount(),
    client = usePublicClient({ chainId: 4441 }),
    wallet = useWalletClient();
  const balance = useBalance({ address: account.address, chainId: 4441, query: { enabled: account.isConnected && account.chainId === 4441 } });
  const [state, setState] = useState<State>({}),
    [message, setMessage] = useState(""),
    [treasury, setTreasury] = useState(""),
    [localOnly, setLocalOnly] = useState(false),
    [busy, setBusy] = useState(false),
    [review, setReview] = useState<{
      abi: Abi;
      bytecode: Hex;
      data: Hex;
      fee: bigint;
      name: string;
      args: Address[];
    }>();
  const okx = !!account.connector && /okx|okex/i.test(`${account.connector.name} ${account.connector.id} ${account.connector.rdns ?? ""}`);
  const key = `rarecognos.deployment.fee25.v1:4441:${account.address?.toLowerCase()}`,
    current = useRef(key);
  const treasuryInput = useRef(treasury);
  const validTreasury = isAddress(treasury) && treasury.toLowerCase() !== zeroAddress;
  current.current = key;
  useEffect(() => {
    setLocalOnly(import.meta.env.DEV && import.meta.env.VITE_NFT_DEPLOY === "true" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname));
  }, []);
  useEffect(() => {
    try {
      setState(JSON.parse(localStorage.getItem(key) || "{}"));
    } catch {
      setState({});
    }
    setReview(undefined);
    setMessage("");
  }, [key]);
  const persist = (s: State, k = key) => {
    localStorage.setItem(k, JSON.stringify(s));
    if (current.current === k) setState(s);
  };
  async function settle(record: Pending, s: State, k: string, resume = false) {
    const receipt = await (resume
      ? resumeTransaction(client as PublicClient, record, () => {})
      : followReceipt(client as PublicClient, record, () => {}));
    if (receipt.status !== "success" || !receipt.contractAddress)
      throw Error("Deployment not confirmed");
    if (!(await client!.getCode({ address: receipt.contractAddress })))
      throw Error("No deployed code");
    const collectionStep = record.kind === "deploy:RareCognos";
    if (
      collectionStep &&
      (await client!.readContract({
        address: receipt.contractAddress,
        abi: nft,
        functionName: "version",
      })) !== 2n
    )
      throw Error("Unexpected collection ABI/version");
    if (!collectionStep) {
      const [boundCollection, boundTreasury, fee] = await Promise.all([
        client!.readContract({ address: receipt.contractAddress, abi: marketAbi, functionName: "collection" }),
        client!.readContract({ address: receipt.contractAddress, abi: marketAbi, functionName: "treasury" }),
        client!.readContract({ address: receipt.contractAddress, abi: marketAbi, functionName: "FEE_BPS" }),
      ]);
      if (boundCollection.toLowerCase() !== s.collection?.toLowerCase() || fee !== 25n || boundTreasury === zeroAddress)
        throw Error("Deployed marketplace configuration did not match; inspect the transaction before continuing.");
    }
    const next = {
      ...s,
      pending: undefined,
      ...(collectionStep
        ? { collection: receipt.contractAddress, collectionDeploymentTx: receipt.transactionHash }
        : { market: receipt.contractAddress, marketDeploymentTx: receipt.transactionHash }),
    };
    persist(next, k);
    if (current.current === k)
      setMessage(
        "Deployment confirmed. " +
          (collectionStep
            ? "Next: deploy the marketplace."
            : "Verify both contracts in the explorer before enabling them."),
      );
  }
  async function prepare() {
    if (!localOnly || !okx || !client || !wallet.data || !account.address) return;
    setBusy(true);
    try {
      assertChain(await wallet.data.getChainId(), 4441);
      const name = state.collection ? "RareCognosMarket" : "RareCognos";
      const r = await fetch("/contracts/" + name + ".json");
      if (!r.ok) throw Error("Artifact unavailable");
      const a = (await r.json()) as { abi: Abi; bytecode: Hex };
      if (state.collection && !validTreasury)
        throw Error("Enter a valid nonzero treasury address.");
      const args: Address[] = state.collection ? [state.collection, treasury as Address] : [];
      const data = encodeDeployData({ ...a, args });
      await client.call({ account: account.address, data });
      const [gas, price] = await Promise.all([
        client.estimateGas({ account: account.address, data }),
        client.getGasPrice(),
      ]);
      if (state.collection && treasuryInput.current !== args[1])
        throw Error("Treasury changed during simulation. Simulate again.");
      setReview({ ...a, data, fee: gas * price, name, args });
      setMessage("Simulation passed. Review before confirming in your wallet.");
    } catch (e) {
      setMessage(transactionError(e));
    } finally {
      setBusy(false);
    }
  }
  async function deploy() {
    if (!localOnly || !okx || !client || !wallet.data || !account.address || !review) return;
    const k = key,
      s = state,
      owner = account.address;
    setBusy(true);
    try {
      assertChain(await wallet.data.getChainId(), 4441);
      if (review.name === "RareCognosMarket" &&
        (!state.collection || review.args.length !== 2 || review.args[0] !== state.collection ||
          !isAddress(review.args[1]) || review.args[1].toLowerCase() === zeroAddress ||
          review.args[1] !== treasuryInput.current ||
          encodeDeployData({ abi: review.abi, bytecode: review.bytecode, args: review.args }) !== review.data))
        throw Error("Treasury or market deployment details changed. Simulate again.");
      if ((await wallet.data.getAddresses())[0].toLowerCase() !== owner.toLowerCase())
        throw Error("Wallet account changed");
      const block = await client.getBlockNumber();
      await client.call({ account: owner, data: review.data });
      if (review.name === "RareCognosMarket" && review.args[1] !== treasuryInput.current)
        throw Error("Treasury changed during simulation. Simulate again.");
      const hash = await wallet.data.deployContract({
        abi: review.abi,
        bytecode: review.bytecode,
        args: review.args,
        chain,
      });
      const pending: Pending = {
        id: hash,
        hash,
        chainId: 4441,
        wallet: owner,
        contract: zeroAddress,
        kind: "deploy:" + review.name,
        data: review.data,
        value: "0",
        block: String(block),
        status: "pending",
      };
      saveRecord(pending);
      persist({ ...s, pending, artifactHash: keccak256(review.bytecode) }, k);
      setReview(undefined);
      try {
        pending.nonce = (await client.getTransaction({ hash })).nonce;
        saveRecord(pending);
        persist({ ...s, pending }, k);
      } catch {
        /* Saved hash remains resumable */
      }
      await settle(pending, s, k);
    } catch (e) {
      if (current.current === k) setMessage(transactionError(e));
    } finally {
      setBusy(false);
    }
  }
  async function resume() {
    const pending = state.pending;
    if (!pending) return;
    setBusy(true);
    try {
      await settle(pending, state, key, true);
    } catch (e) {
      setMessage(transactionError(e));
      const saved = records().find((r) => r.id === pending.id);
      if (saved && ["failed", "replaced"].includes(saved.status))
        persist({ ...state, pending: undefined });
    } finally {
      setBusy(false);
    }
  }
  if (!localOnly) return null;
  return (
    <section className="market-section">
      <h2 className="text-3xl">Deploy RareCognos V2</h2>
      {account.isConnected && account.chainId === 4441 && (
        <p>Wallet balance: {balance.data ? `${formatEther(balance.data.value)} zkLTC` : balance.isError ? "Unavailable" : "Loading…"}</p>
      )}
      <p className="market-notice">
        LiteForge 4441 · IPFS token URIs are fixed per mint. Collection constructor has no metadata
        base. Upload service: {uploadAPI || "not configured"}. Deployments require your wallet
        signature. Local development only; select OKX Wallet in the wallet menu. Each contract requires a separate approval.
      </p>
      {state.pending ? (
        <>
          <p className="uri-text">Pending deployment: {state.pending.hash}</p>
          <button className="nft-button" disabled={busy} onClick={() => void resume()}>
            Resume deployment receipt
          </button>
        </>
      ) : (
        !state.market && (
          <>
            {state.collection && <label>Treasury recipient (public address)
              <input required aria-invalid={treasury !== "" && !validTreasury} disabled={busy} value={treasury} onChange={(e) => { const value = e.target.value.trim(); treasuryInput.current = value; setTreasury(value); setReview(undefined); }} placeholder="0x…" />
              {treasury !== "" && !validTreasury && <span role="alert">Enter a valid nonzero EVM treasury address.</span>}
            </label>}
            {!okx && <p role="status">Connect OKX Wallet to prepare deployment.</p>}
            <button
              className="nft-button"
              disabled={busy || !okx || account.chainId !== 4441 || !wallet.data || (!!state.collection && !validTreasury)}
              onClick={() => void prepare()}
            >
              Simulate {state.collection ? "marketplace" : "collection"} deployment
            </button>
            {review && (
              <div className="permission-confirm">
                <p>Contract: {review.name} · Network: LiteForge (4441)</p>
                <p className="uri-text">
                  Collection: {state.collection || "new ERC-721 collection"}
                  {state.collection && <><br />Treasury: {review.args[1]} · Fee: 0.25% (fixed)</>}
                  <br />
                  Artifact hash: {keccak256(review.bytecode)}
                </p>
                <p>
                  Estimated deployment fee: {formatEther(review.fee)} zkLTC. Wallet confirms final
                  fee.
                </p>
                <button className="primary-action" disabled={busy} onClick={() => void deploy()}>
                  Confirm deployment in wallet
                </button>
              </div>
            )}
          </>
        )
      )}
      <p role="status" className="market-notice">
        {message}
      </p>
      {state.collection && (
        <p className="uri-text">
          Collection: {state.collection}{" "}
          {explorer && (
            <a
              className="text-link"
              href={`${explorer}/address/${state.collection}`}
              target="_blank"
              rel="noreferrer"
            >
              Explorer
            </a>
          )}
        </p>
      )}
      {state.market && (
        <pre className="uri-text whitespace-pre-wrap">
          {JSON.stringify(
            {
              chainId: 4441,
              schemaVersion: 2,
              collection: state.collection,
              market: state.market,
              verified: false,
              collectionDeploymentTx: state.collectionDeploymentTx,
              marketDeploymentTx: state.marketDeploymentTx,
              verificationUrls: [],
            },
            null,
            2,
          )}
        </pre>
      )}
    </section>
  );
}
